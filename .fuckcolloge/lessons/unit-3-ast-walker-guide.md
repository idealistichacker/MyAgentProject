# AST 漫游指南：从嵌套列表到可求值的表达式森林

---

## 开篇：当 Parser 吐出一堆“尸体”

你刚写完词法分析和语法分析，满心期待地把 `(+ 1 (* 2 3))` 喂进去，Parser 兢兢业业地咀嚼一番，“噗”地吐出来——

```python
['+', 1, ['*', 2, 3]]
```

就这？一堆嵌套的 Python 列表？说好的“让代码活过来”呢？

别急。**Parser 造的是骨架，而你要赋予它灵魂。** 这个灵魂的名字叫 **eval**——求值器。本单元，我们就来当一回“亡灵法师”，把这堆冰冷的列表变成能呼吸、能计算、能思考的微型引擎。

---

## 第一站：Cons Cell——Scheme 的“乐高积木”

在 CS61A 的 Scheme 项目中，AST 并不是裸 Python 列表，而是用一种叫做 **Pair**（即 Lisp 世界的 **cons cell**）的结构串联起来的。为什么？因为 Scheme 的列表本质上就是一条**单向链表**。

### 从 Python list 到 Pair 链

Python 的 `[1, 2, 3]` 是一块连续内存。Scheme 的 `(1 2 3)` 长这样：

```
Pair(1, Pair(2, Pair(3, nil)))
```

每个 `Pair` 有两个槽位：`first`（存数据）和 `rest`（指向下一个 Pair 或 `nil`）。`nil` 是链表的终点哨兵——它代表空列表 `()`。

```python
class Pair:
    def __init__(self, first, rest):
        self.first = first      # car
        self.rest = rest        # cdr

    def __repr__(self):
        return f"Pair({self.first}, {self.rest})"

nil = object()  # 独一无二的空列表哨兵
```

> **关键直觉**：`Pair` 的 `first` 是“当前节点装的东西”，`rest` 是“剩下的整条尾巴”。`(a b c)` 就是 `Pair(a, (b c))`，而 `(b c)` 又是 `Pair(b, (c))`……递归结构跃然纸上。

**陷阱**：合法的 Scheme 列表要求每个 `rest` 要么是 `Pair`，要么是 `nil`。若 `rest` 是其他类型（如数字），则构成“点对”（dotted pair），如 `(1 . 2)`，这在标准过程调用中会引发错误。

---

## 第二站：表达式分类——“你是谁？”

eval 函数拿到一个 AST 节点后，第一件事是**认人**。Scheme 表达式分三大类：

| 类别 | 例子 | 求值策略 |
|------|------|----------|
| **自求值表达式** | `42`, `#t`, `"hello"` | 直接返回自身 |
| **符号** | `x`, `+`, `my-func` | 去环境里查它绑定了什么 |
| **组合表达式（列表）** | `(+ 1 2)`, `(define x 3)` | 分发：特殊形式 vs 普通调用 |

### 自求值表达式：照镜子

数字、布尔值、字符串——它们不求人，自己就是自己的值。

```python
def is_self_evaluating(expr):
    return (isinstance(expr, (int, float, bool, str)) or
            expr is nil)
```

`42` 扔进 eval，`42` 吐出来。简单到令人发指，但这是递归基 case 的第一道防线。

### 符号：需要“查户口”

`+` 不是一个自带值的数字——它是个**名字**，名字的意义取决于**环境**（你把它绑定到了什么）。注意：字符串 `"+"` 不是符号，符号是不带引号的标识符。

```python
def is_scheme_symbol(expr):
    return isinstance(expr, str) and not expr.startswith('"')
```

符号求值 = 环境查找。这是第三站的内容，先按下不表。

---

## 第三站：eval 的分发逻辑——“走哪条路？”

这是整个解释器的**心跳**。`scheme_eval` 的核心结构如下：

```python
def scheme_eval(expr, env):
    if is_self_evaluating(expr):
        return expr
    if is_scheme_symbol(expr):
        return env.lookup(expr)
    if not isinstance(expr, Pair):
        raise SchemeError(f"无法求值: {expr}")

    first, rest = expr.first, expr.rest
    if is_scheme_symbol(first) and first in SPECIAL_FORMS:
        return SPECIAL_FORMS[first](rest, env)

    # 普通函数调用
    procedure = scheme_eval(first, env)
    args = rest.map(lambda op: scheme_eval(op, env))
    return scheme_apply(procedure, args, env)
```

### 这张“分叉图”值得刻进肌肉记忆：

```
expr 进来
  ├─ 是数字/布尔/字符串/nil？ → 直接返回（自求值）
  ├─ 是符号？                 → env.lookup（查表）
  └─ 是 Pair？
       ├─ first 是特殊形式关键字？ → 走特殊形式专属逻辑
       └─ 否则                    → 先求值 operator 和 operands，再 apply
```

> **这就是“树遍历解释器”的灵魂**：递归下降 + 按节点类型分发。每个节点知道自己该做什么，eval 只负责“问你是谁，然后叫对的人来处理”——这本质上是**访问者模式（Visitor Pattern）**在解释器中的朴素实现。`scheme_eval` 相当于 `accept`，特殊形式处理函数相当于 `Visitor` 的具体 `visit` 方法，而表达式类型就是被访问的元素。

---

## 第四站：环境模型——“名字住在哪里？”

符号 `x` 的值是什么？取决于你在哪个**帧（Frame）**里问。

### 最简单的帧：一个 Python 字典

```python
class Frame:
    def __init__(self, parent=None):
        self.bindings = {}     # {"x": 10, "y": 20}
        self.parent = parent   # 父帧，形成作用域链

    def define(self, symbol, value):
        self.bindings[symbol] = value

    def lookup(self, symbol):
        if symbol in self.bindings:
            return self.bindings[symbol]
        if self.parent is not None:
            return self.parent.lookup(symbol)
        raise SchemeError(f"未定义的符号: {symbol}")
```

### 作用域链：俄罗斯套娃

```python
global_frame = Frame()
global_frame.define('x', 10)

child = Frame(parent=global_frame)
child.define('y', 20)

child.lookup('y')   # → 20（在当前帧找到）
child.lookup('x')   # → 10（沿 parent 链爬到全局帧）
child.lookup('z')   # → SchemeError!
```

**陷阱**：`define` 总是在**当前最内层帧**绑定，即使外层已有同名变量，也会造成**遮蔽**（shadowing）。而 `set!` 则沿作用域链向上查找并修改已有绑定，若找不到则报错。

---

## 第五站：eval 与 apply 的舞蹈

这是 Scheme 解释器最优雅的双人舞：

- **eval**：拿到表达式和环境，返回一个值。
- **apply**：拿到一个过程（procedure）和参数列表，执行这个过程。

```python
def scheme_apply(procedure, args, env):
    if is_primitive(procedure):
        return procedure.impl(args)
    else:
        new_env = Frame(parent=procedure.env)
        for param, arg in zip(procedure.params, args):
            new_env.define(param, arg)
        return eval_all(procedure.body, new_env)
```

### 一个完整的求值轨迹

对 `(+ 1 (* 2 3))` 求值：

```
scheme_eval(Pair('+', Pair(1, Pair(Pair('*', Pair(2, Pair(3, nil))), nil))), env)
  ├─ first='+' 不是特殊形式 → 走分支 B
  ├─ scheme_eval('+', env) → env.lookup('+') → <内置加法过程>
  ├─ rest.map(scheme_eval, env):
  │    ├─ scheme_eval(1, env) → 1（自求值）
  │    └─ scheme_eval(Pair('*', Pair(2, Pair(3, nil))), env)
  │         ├─ scheme_eval('*', env) → <内置乘法过程>
  │         ├─ scheme_eval(2, env) → 2
  │         ├─ scheme_eval(3, env) → 3
  │         └─ scheme_apply(<乘法>, [2, 3], env) → 6
  └─ scheme_apply(<加法>, [1, 6], env) → 7
```

**递归在 AST 的枝干上爬行，每到一个叶子就带回一个值，层层向上汇聚。** 这就是 tree walking 的魔力。

---

## 第六站：特殊形式——“规则破坏者”

普通函数调用：**先求值所有操作数，再传入函数**。但特殊形式不守这规矩：

| 特殊形式 | 为什么不先求值操作数 |
|----------|---------------------|
| `(if cond t f)` | 只应求值 cond 和其中一个分支，否则死循环/副作用 |
| `(define x expr)` | `x` 是符号，不求值——我们要绑定这个名字本身 |
| `(lambda (x) body)` | `(x)` 是形参列表，不求值——这是声明，不是调用 |
| `(quote x)` | 原封不动返回 `x`，求值就错了 |
| `(cond (p1 e1) (p2 e2))` | 短路求值：只执行第一个为真的分支 |
| `(and a b)` / `(or a b)` | 短路求值，且 `and` 返回最后一个真值而非布尔 |

每种特殊形式都有自己的求值规则，所以 eval 里用 `SPECIAL_FORMS` 字典做**显式分发**：

```python
SPECIAL_FORMS = {
    'define':  eval_define,
    'lambda':  eval_lambda,
    'if':      eval_if,
    'cond':    eval_cond,
    'let':     eval_let,
    'quote':   eval_quote,
    'and':     eval_and,
    'or':      eval_or,
}
```

**陷阱**：`let` 本质上是 `lambda` 的语法糖。`(let ((x 1) (y 2)) body)` 等价于 `((lambda (x y) body) 1 2)`。因此 `let` 创建的新作用域会同时求值所有绑定表达式的值（在当前环境），然后才用这些值扩展新帧并执行体。这意味着 `let` 的绑定表达式不能相互引用，而 `let*` 可以顺序求值。

---

## 结语：微型引擎已点火

你现在拥有的是一个**能对简单 AST 进行语义求值的微型引擎**。回顾你构建的：

1. **Pair 链**——Scheme 列表的 Python 化身，递归结构的物质基础
2. **表达式分类**——自求值、符号、组合表达式，eval 的第一层分发
3. **scheme_eval 核心循环**——递归下降 + 特殊形式字典分发的树遍历解释器（访问者模式）
4. **Frame 环境模型**——Python 字典 + parent 指针的作用域链
5. **eval/apply 双人舞**——一个负责“这是什么”，一个负责“怎么执行”

这套架构就是 CS61A Scheme 解释器项目的**心脏预演**。在巅峰项目中，你将把这颗心脏装入完整的 REPL 循环，接入 turtle 图形扩展，让你的 Scheme 代码画出分形图案——而这一切的起点，就是今天你亲手搭建的这个微型求值引擎。

> **记住这种感觉**：你不再只是写代码的人——你正在写一个**能理解代码的程序**。从这一刻起，你就是语言的设计者。