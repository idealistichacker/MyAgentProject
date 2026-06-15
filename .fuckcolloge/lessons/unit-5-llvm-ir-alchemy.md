# LLVM IR 炼金术：把 Scheme 的魂魄注入中间表示

## 1. 从 AST 到 IR：为什么需要 SSA
编译器前端将 Scheme 代码解析为抽象语法树（AST）后，需要一种既接近机器又保留高层信息的中间表示（IR）。LLVM IR 正是这样一种**静态单赋值（SSA）形式**的三地址码。在 SSA 中，每个变量仅被赋值一次，且每次使用都引用唯一的“版本”。例如 `(+ x y)` 不会修改 `x`，而是生成一个新的虚拟寄存器 `%result`：

```llvm
%result = add i64 %x, %y
```

这种形式让数据流分析（如死代码删除、常量传播）变得极其简单。但遇到分支时，同一变量可能来自不同路径，SSA 使用 **φ (phi) 节点** 合并版本：

```llvm
cond_next:
  %val = phi i64 [ %a, %then_block ], [ %b, %else_block ]
```

phi 的含义是：若从 `%then_block` 跳转而来，则 `%val` 取 `%a`；若从 `%else_block` 来，则取 `%b`。**phi 必须出现在基本块的开头，且前驱块列表必须完整覆盖所有可能到达该块的前驱。**

## 2. 基本块与控制流图
**基本块**是一段连续的指令序列，满足：
- 只有一个入口（第一条指令）
- 只有一个出口（最后一条指令必须是跳转或返回）
- 内部不含其他跳转目标

划分基本块的规则：
- 第一条指令是 leader
- 任何跳转目标指令是 leader
- 紧跟在跳转指令后的指令是 leader

**控制流图（CFG）** 以基本块为节点，跳转关系为边。例如 `(if (> x 0) (+ x 1) (- x 1))` 会生成四个基本块：entry（计算比较）、then、else、merge。entry 结尾用 `br i1 %cond, label %then, label %else` 实现条件跳转；then 和 else 结尾用 `br label %merge` 无条件跳转；merge 用 phi 收集结果并返回。

## 3. 用 llvmlite 构建 IR 的骨架
`llvmlite` 是 Python 对 LLVM C++ API 的轻量封装。构建一个模块的典型流程：

```python
from llvmlite import ir

module = ir.Module(name="scheme_expr")
func_type = ir.FunctionType(ir.IntType(64), [ir.IntType(64), ir.IntType(64)])
func = ir.Function(module, func_type, name="add")
block = func.append_basic_block(name="entry")
builder = ir.IRBuilder(block)
```

**关键陷阱**：`IRBuilder` 会维护一个“插入点”，所有生成的指令都插入到当前基本块的末尾。当需要向不同基本块插入指令时，必须用 `builder.position_at_start(block)` 或 `builder.position_at_end(block)` 重新定位。忘记切换位置是初学者最常犯的错误。

## 4. 算术表达式翻译
Scheme 的 `(+ a b)` 等可直接映射到 LLVM 算术指令。但需注意：
- 所有值统一用 64 位整数（`i64`），因为 Scheme 数值默认为任意精度，这里简化处理。
- 除法 `/` 在 LLVM 中有 `sdiv`（有符号）和 `udiv`（无符号），我们使用 `sdiv`。
- 操作数必须是 `ir.Value` 类型，不能直接传入 Python 整数。常量用 `ir.Constant(ir.IntType(64), 42)`。

递归翻译函数示例：
```python
def translate_expr(expr, builder, env):
    if isinstance(expr, int):
        return ir.Constant(ir.IntType(64), expr)
    elif expr[0] == '+':
        left = translate_expr(expr[1], builder, env)
        right = translate_expr(expr[2], builder, env)
        return builder.add(left, right, name="addtmp")
    # ... 类似处理 -, *, /
```

**陷阱**：`builder.add` 等返回的是指令本身，但可作为值使用。指令必须插入到当前基本块，否则 IR 验证失败。

## 5. 条件表达式与 φ 节点
`(if pred conseq altern)` 的翻译是理解 SSA 精髓的试金石。步骤：
1. 在 entry 块计算谓词 `pred`，得到 `i1` 类型的布尔值（用 `icmp_sgt` 等比较产生）。
2. 创建 then、else、merge 三个基本块。
3. 在 entry 结尾生成条件跳转：`builder.cbranch(pred_val, then_block, else_block)`。
4. 将 builder 定位到 then_block，翻译 `conseq`，记录结果值，并跳转到 merge：`builder.branch(merge_block)`。
5. 同样处理 else_block。
6. 在 merge_block 开头插入 phi 节点：
   ```python
   builder.position_at_start(merge_block)
   phi = builder.phi(ir.IntType(64), name="iftmp")
   phi.add_incoming(then_val, then_block)
   phi.add_incoming(else_val, else_block)
   ```
7. 返回 phi 作为整个 if 表达式的值。

**致命陷阱**：
- phi 的 `add_incoming` 必须按前驱块在 CFG 中的顺序？实际上顺序无关，但必须覆盖所有前驱，且每个前驱只能出现一次。
- 如果某个分支没有显式产生值（例如返回 void），则不能直接用 phi 合并，需要调整设计。
- 忘记在 then/else 块末尾添加跳转指令会导致 IR 格式错误：“Basic block in function '...' does not have terminator!”

## 6. 简单函数定义与调用
将 `(lambda (x) body)` 或 `(define (f x) body)` 翻译为 LLVM 函数：
- 函数类型由参数个数决定，返回值类型为 `i64`。
- 参数在函数内直接作为 SSA 值可用，**无需 alloca**，因为 Scheme 变量不可变，参数不会被重新赋值。
- 函数体翻译后，用 `builder.ret(value)` 返回。

示例：
```python
func = ir.Function(module, ir.FunctionType(ir.IntType(64), [ir.IntType(64)]), name="square")
entry = func.append_basic_block(name="entry")
builder = ir.IRBuilder(entry)
x = func.args[0]  # 参数本身就是 Value
result = builder.mul(x, x, name="sq")
builder.ret(result)
```

**陷阱**：如果需要支持 `set!` 等副作用，则必须用 `alloca` 分配栈空间，通过 `load/store` 模拟可变变量。但本课程仅处理纯函数式子集，故直接使用参数更简洁高效。

## 7. 完整案例：从 Scheme 到可运行 IR
考虑表达式 `(if (> x 0) (+ x 1) (- x 1))` 包裹在 lambda 中。生成的 LLVM IR 如下（注释为后加）：
```llvm
define i64 @foo(i64 %x) {
entry:
  %cmp = icmp sgt i64 %x, 0
  br i1 %cmp, label %then, label %else
then:
  %addtmp = add i64 %x, 1
  br label %merge
else:
  %subtmp = sub i64 %x, 1
  br label %merge
merge:
  %iftmp = phi i64 [ %addtmp, %then ], [ %subtmp, %else ]
  ret i64 %iftmp
}
```
通过 `llvmlite` 绑定 MCJIT 可执行该 IR，验证结果。

## 8. 调试与验证
- 使用 `print(module)` 输出 IR 文本，检查结构。
- 调用 `llvmlite.binding.parse_assembly(str(module))` 验证模块合法性，捕获错误。
- 常见错误信息：“Instruction does not dominate all uses!” 意味着某个值在未定义的基本块中被使用，通常是因为 phi 节点前驱值来自未执行到的路径，或插入位置错误。

## 9. 延伸思考
本课程仅触及 Scheme 子集。后续可扩展：
- 支持布尔类型和 `and`/`or` 短路求值（需要更复杂的控制流）。
- 尾递归优化：将尾调用转换为跳转，重用当前栈帧。
- 闭包与堆分配：将自由变量捕获到堆上结构体。

掌握 IR 构建能力后，你便拥有了连接高级语言与底层硬件的“炼金术”，这正是 CS61A 带你窥探计算本质的钥匙。