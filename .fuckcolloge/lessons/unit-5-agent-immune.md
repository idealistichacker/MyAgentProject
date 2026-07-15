# Python 错误自动诊断与修复系统：从分类到验证

> *"你要造一个能自我修复的 Agent，它首先得能'看懂'自己犯了什么错。这一课，我们打造 Agent 的诊断之眼。"*

## 一、错误分类体系：四层模型与边界陷阱

Python 的错误并非扁平集合，而是有严格层次。我们必须按**触发时机**与**可捕获性**建立四层分类：

### 1.1 语法错误（SyntaxError 及其子类）

在字节码编译阶段（`compile()`）触发，**早于任何运行时逻辑**。关键属性：

```python
try:
    compile("x +", "<test>", "exec")
except SyntaxError as e:
    print(e.lineno, e.offset, e.text, e.filename)
```

**陷阱一**：`IndentationError` 与 `TabError` 是 `SyntaxError` 的子类，分类器若用 `type(e) is SyntaxError` 会漏判，必须用 `isinstance(e, SyntaxError)`。

**陷阱二**：`SyntaxError` 可被 `try/except` 捕获，但捕获点与出错点不同——它发生在编译期，traceback 中通常只有一帧。解析器必须特殊处理：直接读取 `e.lineno` 与 `e.text`，而非依赖 `traceback.extract_tb`。

### 1.2 导入错误（ImportError / ModuleNotFoundError）

`ModuleNotFoundError` 是 `ImportError` 的子类（Python 3.6+）。分类时**先判子类再判父类**，否则信息丢失。常见根因有三：模块未安装、循环导入、`sys.path` 缺失。修复策略需区分对待——前两者靠环境/重构，后者靠路径注入。

### 1.3 运行时错误（RuntimeError 的广义集合）

指 `Exception` 树下除上述两类之外的所有异常：`NameError`、`TypeError`、`ValueError`、`ZeroDivisionError`、`AttributeError` 等。

**关键陷阱**：`SystemExit` 与 `KeyboardInterrupt` 继承自 `BaseException` 而非 `Exception`。分类器若用 `except Exception` 兜底，会漏掉它们；若用 `except BaseException`，则会误吞用户 Ctrl+C。正确做法是显式枚举目标类型，或用 `Exception` 作为边界并单独标注 `BaseException` 子类为"不可修复"。

### 1.4 逻辑错误（无异常，输出错误）

最隐蔽——程序正常返回但结果错误。自动分类器无法靠 traceback 识别，必须依赖**测试断言失败**或**属性测试（property-based testing）**作为信号源。我们将 `AssertionError` 归入此类入口，但需注意：`AssertionError` 本身是运行时异常，分类器要结合"是否来自测试代码"做二次判定。

### 分类决策树（伪码）

```python
def classify(exc: BaseException) -> str:
    if isinstance(exc, SyntaxError):
        return "syntax"
    if isinstance(exc, ImportError):
        return "import"
    if isinstance(exc, Exception):
        # 需结合调用栈判断是否为逻辑错误
        return "logic" if _from_test_assertion(exc) else "runtime"
    return "system"  # SystemExit / KeyboardInterrupt
```

## 二、堆栈跟踪解析器：提取与定位

### 2.1 核心数据结构

Python 标准库 `traceback` 提供 `FrameSummary`，含 `filename`、`lineno`、`name`、`line` 四字段。解析器应基于 `traceback.extract_tb(tb)` 而非字符串正则——后者脆弱且版本敏感。

```python
import sys, traceback

def parse(exc):
    tb = exc.__traceback__
    frames = traceback.extract_tb(tb)
    # 最内层用户帧（过滤库代码）
    user_frames = [f for f in frames if not _is_stdlib(f.filename)]
    if not user_frames:
        user_frames = frames
    culprit = user_frames[-1]
    return {
        "type": type(exc).__name__,
        "message": str(exc),
        "file": culprit.filename,
        "line": culprit.lineno,
        "func": culprit.name,
        "source": culprit.line,
    }
```

### 2.2 关键陷阱

**陷阱三——链式异常**：Python 3 引入 `__cause__`（显式 `raise ... from`）与 `__context__`（隐式）。解析器必须递归追溯，否则只看到包装层而错过根因。使用 `traceback.walk_tb` 或手动遍历 `__cause__`/`__context__`。

**陷阱四——SyntaxError 无完整 traceback**：`exc.__traceback__` 可能为 `None` 或仅含编译器帧。此时必须回退到 `exc.lineno`、`exc.filename`、`exc.text`。

**陷阱五——源码定位偏移**：`FrameSummary.line` 是已剥离缩进的源码行，但 `SyntaxError.offset` 指向原始行的字符位置。定位高亮时需保留原始缩进，否则列号错位。

**陷阱六——exec/eval 动态代码**：`filename` 为 `"<string>"` 或 `"<console>"`，无对应磁盘文件。解析器需检测并降级为"无法定位源码"。

## 三、修复策略库：分型模板

不同错误类型需要差异化的 LLM 提示模板。核心原则：**提供充足上下文（错误行±5行）、完整 traceback、相关函数签名、测试期望**。

| 错误类型 | 策略模式 | 提示模板要点 |
|---------|---------|------------|
| SyntaxError | 局部重写 | 提供出错行及偏移，要求仅修正语法，禁止改逻辑 |
| ImportError | 环境诊断 | 提供完整 import 语句与 `sys.path`，区分缺失依赖/循环导入 |
| NameError/AttributeError | 作用域分析 | 提供函数定义与调用上下文，检查拼写与作用域泄漏 |
| TypeError | 签名比对 | 提供函数签名与实参类型，要求类型推断与修正 |
| 逻辑错误 | 断言驱动 | 提供失败测试用例与实际输出，要求最小化修改使测试通过 |

**陷阱七——LLM 倾向过度修改**。模板中必须显式约束："仅修改与错误直接相关的行，禁止重构无关代码"，并在系统提示中加入 diff 格式要求，便于后续精确应用。

## 四、修复验证机制：防回归闭环

### 4.1 验证流程

1. **快照基线**：修复前运行完整测试套件，记录通过/失败集合。
2. **应用补丁**：以 diff 形式修改源码，保留原始备份。
3. **重跑测试**：优先运行原失败用例，确认转绿；再跑全套件。
4. **回归判定**：对比基线，任何原通过用例变为失败即判定回归。
5. **回滚或保留**：回归则自动回滚，并记录失败原因供下一轮策略选择。

```python
def verify(patch_applied, failing_test, full_suite):
    baseline = run_suite(full_suite)  # 修复前快照
    if not patch_applied:
        return False, "patch failed"
    new_result = run_suite(full_suite)
    if not new_result[failing_test].passed:
        return False, "target test still fails"
    regressions = [t for t in baseline.passed if not new_result[t].passed]
    if regressions:
        return False, f"regressions: {regressions}"
    return True, "fixed without regression"
```

### 4.2 关键陷阱

**陷阱八——测试本身有随机性或依赖外部状态**（网络、时间、文件系统）。验证前需固定随机种子、mock 外部依赖，否则基线不稳定，回归判定失效。

**陷阱九——修复引入新测试通过但破坏不变量**。仅靠现有测试不足，应补充**属性测试**或**不变量断言**作为额外守卫。

**陷阱十——无限修复循环**。LLM 反复尝试不同补丁却始终失败。必须设置最大重试次数（如 3 次），并在每次失败后将失败原因追加到上下文，避免重复同一策略。

## 五、总结

本系统的核心难点不在单点技术，而在**分类—解析—修复—验证**闭环的鲁棒性。分类决策树处理异常继承层次；解析器应对链式异常与动态代码；策略库按错误分型约束 LLM 行为；验证机制以基线对比防回归。每一环节都有边界陷阱，唯有显式处理才能构建可信的自动修复工具。

> *"Agent 的眼睛看到的不应只是'出错了'，而是'在哪里、出了什么错、根因是什么'。下一课，我们将把这些诊断结果喂给 LLM 大脑，让它决定如何动手修复。"*