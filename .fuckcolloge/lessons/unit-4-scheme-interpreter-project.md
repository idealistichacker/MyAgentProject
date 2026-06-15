# 🏰 巅峰项目：Scheme 解释器——让代码在 Python 中活过来

> **项目定位**：这是整个学习旅程的“中庭圣殿”——你将亲手用 Python 从零铸造一个能跑 Scheme 代码的完整解释器。它不仅是前三单元全部技能的终极整合，更是一份足以写入简历的编译器前端作品。完成之后，你离“编译 Scheme 到 LLVM IR”只差最后一步。

---

## 一、项目概览：你的解释器长什么样？

启动你写好的解释器，你会看到一个交互式提示符（REPL）：

```text
scm> (+ 1 2)
3
scm> (define (fact n) (if (= n 0) 1 (* n (fact (- n 1)))))
fact
scm> (fact 5)
120
```

这背后是一条经典的 **REPL 流水线**：

```text
用户输入字符串 ──→ [Read] ──→ Pair AST ──→ [Eval] ──→ 值 ──→ [Print] ──→ 输出 ──→ 回到 Read
```

在我们的单文件实现 `solution.py` 中，所有的核心模块都整合在了一起：

| 模块 | 核心函数/类 | 你的任务 |
|------|------------|----------|
| **Reader（读取器）** | `tokenize`, `read_line`, `read_tokens` | 已提供：将 Scheme 字符串解析为 `Pair` 嵌套链表 AST |
| **Environment（环境模型）** | `Frame` 类 | ⭐ **Phase 3**：实现 `Frame.define` 绑定与 `Frame.lookup` 词法作用域查找 |
| **Special Forms（特殊形式）** | `do_quote_form`, `do_define_form`, `do_lambda_form`, `do_if_form` | ⭐ **Phase 2**：实现 `quote`、`define`、`lambda`、`if` 等核心特殊求值逻辑 |
| **Eval/Apply（求值核心）** | `scheme_eval`, `scheme_apply` | ⭐ **Phase 1**：实现互递归的 eval-apply 求值循环 |

---

## 二、分阶段作战计划

### ⚔️ Phase 1：核心求值引擎——`scheme_eval` + `scheme_apply`

这是零起步的心脏。你需要实现一个**互递归的 eval-apply 循环**：

1. **`scheme_eval(expr, env)`**：
   - **自求值对象**：如果 `expr` 是整数、浮点数、布尔值或 `nil`，直接返回自身。
   - **符号（Symbol）**：如果是字符串，调用 `env.lookup(expr)` 进行查找。
   - **复合表达式（Pair）**：如果是 `Pair`，检查第一个元素 `expr.first` 是否是特殊形式关键字（在 `SPECIAL_FORMS` 中）。若是，则分派；否则求值 operator 和 operands，调用 `scheme_apply`。

2. **`scheme_apply(procedure, args, env)`**：
   - **内置过程（PrimitiveProcedure）**：直接调用 `procedure.apply(args)`。
   - **用户定义过程（LambdaProcedure）**：创建新子帧（父帧为定义时的环境 `procedure.env`），将形参绑定到实参，然后在扩展环境中使用 `eval_all` 求值过程体。

---

### 🛡️ Phase 2：特殊形式的实现

特殊形式不遵循普通的求值规则（即不先求值所有操作数）：

- **`quote`**：直接返回表达式本身而不要求值，如 `(quote x)` 返回 `'x'`.
- **`define`**：
  - 绑定变量：`(define x (+ 1 2))`。
  - 绑定函数（语法糖）：`(define (fact n) body)` 会被去糖化为 `(define fact (lambda (n) body))`。
- **`lambda`**：创建 `LambdaProcedure` 实例，**必须捕获定义时的环境 `env`**，这就是闭包的奥秘！
- **`if`**：判断条件，如果为真求值分支 A，否则求值分支 B。**注意必须短路求值**，不能两边都计算。

---

### 🏗️ Phase 3：环境模型与作用域

- **`Frame.define(symbol, value)`**：在当前帧的 `self.bindings` 字典中建立绑定。
- **`Frame.lookup(symbol)`**：首先在当前帧查找，如果找不到且 `self.parent` 不为空，则递归到父帧中查找。若均找不到，抛出 `KeyError`。

---

## 三、如何运行与提交测试

1. **本地交互调试**：
   直接在终端运行 `solution.py` 进入 REPL 进行手动测试：
   ```bash
   python solution.py
   ```
2. **自动测试与提交**：
   完成 TODO 代码后，运行以下命令提交评测：
   ```bash
   fc submit
   ```
   评测系统会自动执行我们为你配置好的测试用例！
