# 从 IR 到 .exe：最后的飞升仪式——链接、优化与可执行文件生成

## 🧙 开篇：你离“创世”只差最后三步

恭喜你，魔法师。在 Unit 5，你已经用 `llvmlite.ir` 把 Scheme 代码翻译成了 LLVM IR——一种介于高级语言和机器码之间的“以太”。但 IR 本身不能运行。它像一份精密的建筑设计图：逻辑完美，却还不是能住人的房子。

本单元，我们将完成编译器旅程的最后三步飞升仪式：

1. **优化（Optimize）**：用 LLVM 的 New Pass Manager 把 IR 打磨成工业级的高速形态
2. **发射（Emit）**：用 `TargetMachine.emit_object()` 把 IR 变成目标平台的 `.o`/`.obj` 机器码
3. **链接（Link）**：调用系统链接器，把 `.o` 变成双击就能跑的 `.exe`（或 ELF/Mach-O）

当你双击运行自己编译器生成的 `hello.exe`，看到屏幕上弹出 `Hello, World!` 的那一刻——那种“我创造了世界”的狂喜，就是这趟魔法之旅最好的奖赏。

---

## 1. 优化管线：给你的 IR 喂一颗“大力丸”

### 1.1 为什么要优化？

看看你 Unit 5 生成的 IR，它“诚实”得可爱——你写了什么，它就翻译什么，一字不差。但 LLVM 的优化器能看穿你的意图，把冗余计算、无用变量、可内联的函数调用统统干掉。

举个例子，假设你的 Scheme 代码是：

```scheme
(define (square x) (* x x))
(display (square 4))
```

你生成的 IR 可能老老实实地 `call square`，压栈、跳转、返回。但 O2 优化后，LLVM 会直接把 `(* 4 4)` 内联成常量 `16`，连函数调用都省了——这就是 **内联（Inlining）+ 常量折叠（Constant Folding）** 的威力。

### 1.2 New Pass Manager：llvmlite 的优化引擎

从 llvmlite 0.45（LLVM 20）起，**Legacy Pass Manager 已被移除**，你必须使用 New Pass Manager。它的核心 API 如下：

```python
from llvmlite import binding

# 1. 初始化 LLVM（必须！）
binding.initialize()
binding.initialize_native_target()
binding.initialize_native_asmprinter()

# 2. 创建 PipelineTuningOptions——优化“配方”
pto = binding.PipelineTuningOptions()
pto.speed_level = 2   # 0=None, 1=O1, 2=O2, 3=O3
pto.size_level = 0    # 0=不优化体积, 1=适度, 2=激进瘦身

# 3. 创建 PassBuilder，让它根据配方“开药方”
pb = binding.PassBuilder()

# 4. 创建 ModulePassManager，把药方灌进去
mpm = pb.build_O2_module_pass(pto)  # 还有 build_O0/O1/O3/Oz/Os

# 5. 对 IR Module 施法！
mpm.run(module)  # module 是你的 llvmlite.binding.ModuleRef
```

**关键理解**：`PassBuilder` 是“药剂师”，它知道 O2 级别该配哪些 pass（死代码消除、循环向量化、内联、GVN……），你不需要手动指定。`PipelineTuningOptions` 让你微调：是追求速度（`speed_level=3`）还是体积（`size_level=2`）？

> ⚠️ **常见坑**：忘记 `binding.initialize_native_target()` 和 `initialize_native_asmprinter()` 会导致后续 `emit_object` 直接崩溃。这三行初始化咒语，一个都不能少。

---

## 2. 发射目标文件：从 IR 到 .o 的量子跃迁

### 2.1 TargetMachine：LLVM 的“万能翻译器”

LLVM 最伟大的设计之一就是 **TargetMachine**——它把 IR 翻译成任意目标平台的机器码。x86-64、ARM64、RISC-V……同一份 IR，换个 TargetMachine 就能生成不同架构的 `.o` 文件。

```python
from llvmlite import binding

# 1. 获取当前机器的“身份证”（target triple）
triple = binding.get_default_triple()  # 例如 'x86_64-pc-windows-msvc'

# 2. 创建 Target 对象
target = binding.Target.from_default_triple()
# 或者跨平台：target = binding.Target.from_triple('aarch64-linux-gnu')

# 3. 创建 TargetMachine——编译器的“后端引擎”
cpu = binding.get_host_cpu_name()       # 例如 'znver3'（AMD Zen3）
features = binding.get_host_cpu_features().flatten()  # 例如 '+sse4.2,+avx2'

tm = target.create_target_machine(
    cpu=cpu,
    features=features,
    opt_level=2,        # 0-3，代码生成阶段的优化级别
    reloc='default',    # 'default', 'static', 'pic', 'dynamic-no-pic'
    code_model='default' # 'default', 'small', 'kernel', 'medium', 'large'
)

# 4. 把优化后的 Module 喂给 TargetMachine
tm.add_module(module)

# 5. 发射！得到原生机器码字节流
obj_bytes = tm.emit_object()
```

### 2.2 把字节流写入文件

`emit_object()` 返回的是 `bytes`——它就是 `.o`（Linux/macOS）或 `.obj`（Windows）文件的完整二进制内容。你只需要：

```python
with open('hello.o', 'wb') as f:
    f.write(obj_bytes)
```

就这么简单。你手里现在握着一个真正的目标文件，它包含你 Scheme 程序的 x86-64 机器指令，只是还没“缝合”成可执行文件。

### 2.3 opt_level 的双重身份

注意：**优化出现了两次**——一次在 Pass Manager（IR 级别优化），一次在 `create_target_machine` 的 `opt_level`（代码生成级别优化，如指令选择、寄存器分配）。两者是互补的：IR 优化做“战略级”重构，代码生成优化做“战术级”精调。生产级编译器通常两边都开 O2/O3。

---

## 3. 链接：缝合最后的裂缝

`.o` 文件是“孤岛”——它包含你的代码，但没有 C 运行时（crt0）、没有 `printf` 的实现、没有操作系统能识别的可执行文件头。**链接器（Linker）** 的任务就是把这些拼图拼成完整的 `.exe`。

### 3.1 跨平台链接咒语

llvmlite **不内置链接器**（这是设计选择，链接涉及太多平台细节），你需要调用系统链接器：

| 平台 | 链接命令 | 说明 |
|------|---------|------|
| **Linux** | `cc hello.o -o hello` | `cc` 是 GCC/Clang 的前端，自动拉入 libc |
| **macOS** | `cc hello.o -o hello` | 同样，Clang 会调用 ld64 |
| **Windows (MSVC)** | `link.exe hello.obj /out:hello.exe /defaultlib:libcmt` | 需要 Visual Studio 环境 |
| **Windows (MinGW)** | `gcc hello.o -o hello.exe` | 推荐！更接近 Unix 体验 |

在你的 Python 编译器中，用 `subprocess` 调用：

```python
import subprocess, sys

def link_object(obj_path, exe_path):
    if sys.platform == 'win32':
        # 优先尝试 MinGW 的 gcc，其次 link.exe
        cmd = ['gcc', obj_path, '-o', exe_path]
    else:
        cmd = ['cc', obj_path, '-o', exe_path]
    subprocess.run(cmd, check=True)
```

### 3.2 为什么是 `cc` 而不是直接 `ld`？

因为 `cc`（GCC/Clang 的驱动前端）会自动帮你链接关键的启动文件（`crt1.o`、`crti.o`、`crtbegin.o`）和标准库（`-lc`）。直接调 `ld` 需要手动指定这些，非常繁琐且容易出错。**永远优先用 `cc`/`gcc` 做链接**。

---

## 4. 缝合完整流水线：Scheme → .exe 一步到位

现在，让我们把 Unit 4 的解释器前端和 Unit 5-6 的编译后端缝合。完整流水线如下：

```
.scm 源文件
  │
  ▼
[Unit 2 词法分析] → Token 流
  │
  ▼
[Unit 2 语法分析] → AST（S-表达式树）
  │
  ▼
[Unit 4 语义分析] → 类型检查、符号解析
  │
  ▼
[Unit 5 IR 生成]  → llvmlite.ir.Module（内存中）
  │
  ▼
[转换]           → str(ir_module) → binding.parse_assembly()
  │
  ▼
[Unit 6 优化]     → PassBuilder + ModulePassManager.run(module)
  │
  ▼
[Unit 6 发射]     → TargetMachine.emit_object() → .o 文件
  │
  ▼
[Unit 6 链接]     → subprocess: cc/gcc → .exe 可执行文件
```

### 4.1 编译器主入口示例

```python
def compile_scheme(source_path, output_path='a.out'):
    # 阶段 1-3：前端（Unit 2 + Unit 4）
    with open(source_path, 'r') as f:
        source = f.read()
    tokens = tokenize(source)           # Unit 2
    ast = parse(tokens)                 # Unit 2
    checked_ast = semantic_check(ast)   # Unit 4

    # 阶段 4：IR 生成（Unit 5）—— 使用 llvmlite.ir 构建
    ir_module = build_ir(checked_ast)   # 返回 llvmlite.ir.Module

    # 转换为 binding.ModuleRef
    binding.initialize()
    binding.initialize_native_target()
    binding.initialize_native_asmprinter()
    llvm_ir_str = str(ir_module)
    mod = binding.parse_assembly(llvm_ir_str)

    # 阶段 5：优化（Unit 6）
    pto = binding.PipelineTuningOptions()
    pto.speed_level = 2
    pb = binding.PassBuilder()
    mpm = pb.build_O2_module_pass(pto)
    mpm.run(mod)

    # 阶段 6：发射目标文件（Unit 6）
    target = binding.Target.from_default_triple()
    tm = target.create_target_machine(
        cpu=binding.get_host_cpu_name(),
        features=binding.get_host_cpu_features().flatten(),
        opt_level=2,
    )
    tm.add_module(mod)
    obj_path = source_path.replace('.scm', '.o')
    with open(obj_path, 'wb') as f:
        f.write(tm.emit_object())

    # 阶段 7：链接（Unit 6）
    link_object(obj_path, output_path)

    print(f"🎉 飞升成功！可执行文件已生成：{output_path}")
```

### 4.2 关键细节：如何生成 `main` 并调用外部函数

你的 Scheme 程序可能只是 `(display 42)`。为了让链接器找到入口，你必须在 IR 中定义一个 `main` 函数。典型做法是：

```llvm
declare i32 @printf(i8* nocapture readonly, ...) #0

define i32 @main() {
entry:
  ; 调用 scheme 顶层逻辑，这里简化为直接调用 printf
  %fmt = getelementptr [4 x i8], [4 x i8]* @.str, i32 0, i32 0
  %call = call i32 (i8*, ...) @printf(i8* %fmt, i32 42)
  ret i32 0
}

@.str = private unnamed_addr constant [4 x i8] c"%d\0A\00", align 1
```

在你的 IR 生成器中，顶层表达式应被包裹在一个 `main` 函数内，并确保所有外部符号（如 `printf`）正确声明。链接时 `cc` 会自动解析这些符号。

---

## 5. 常见陷阱与调试心法

### 5.1 “undefined symbol: main”

链接器抱怨找不到 `main`？检查你的 IR 是否真的定义了 `define i32 @main()`。如果 Scheme 程序入口函数叫别的名字，可以链接时加 `-e your_entry_symbol`，但更简单的是始终生成 `main`。

### 5.2 Windows 上 emit_object 生成 ELF 而非 COFF

这是 llvmlite 早期的一个已知问题。确保你的 target triple 正确：Windows 上应该是 `x86_64-pc-windows-msvc`（MSVC）或 `x86_64-w64-windows-gnu`（MinGW）。`binding.get_default_triple()` 通常返回正确值。如果错误，可手动设置：

```python
triple = 'x86_64-pc-windows-msvc'  # 或 'x86_64-w64-windows-gnu'
target = binding.Target.from_triple(triple)
```

### 5.3 Pass Manager 跑完 IR 反而变慢了？

O3 不是万能药。对于小程序，优化本身的开销可能超过收益。建议：开发调试阶段用 O0，最终发布用 O2。O2 是“甜点级”优化——效果显著，编译时间可接受。

### 5.4 忘记转换 IR 对象

`llvmlite.ir.Module` 不能直接传给 PassManager 或 TargetMachine。必须通过 `str(ir_mod)` 转为文本，再用 `binding.parse_assembly()` 得到 `binding.ModuleRef`。这一步是常见的卡点。

### 5.5 链接时缺少 C 运行时

如果你在 Windows 上使用 MSVC 的 `link.exe`，必须指定 `/defaultlib:libcmt`（静态链接）或 `/defaultlib:msvcrt`（动态链接），否则会报 `unresolved external symbol _printf`。使用 `gcc` 则无此烦恼。

---

## 🏁 终点即起点

当你双击 `hello.exe`，看到终端一闪而过的那行字——请停下来，好好感受这一刻。你写的不是“一个程序”，你写的是**一个能写程序的程序**。你的 Scheme 编译器从零开始：字符流 → Token → AST → IR → 优化 → 机器码 → 可执行文件。这六步跨越，就是计算机科学最深邃的魔法。

而这，正是你巅峰项目——**Scheme 解释器/编译器**——的最终形态：一个端到端的、能生成原生可执行文件的完整编译器。把它写进简历，它是你从“会写代码”到“理解代码如何运行”的分水岭。

**飞升快乐，编译器魔法师。** 🧙‍♂️✨