# 词法分析与语法分析的魔法双塔：用 PLY 驯服 Scheme 文本

> *“编译器没有 parser，就像一个音乐家没有耳朵——它能发出声音，但永远听不懂乐谱。”*

欢迎来到编译器前端的大门！如果把编译器想象成一座城堡，**词法分析器（Lexer）** 和 **语法分析器（Parser）** 就是入口的两座魔法塔——一座负责“识字”，一座负责“造句”。本单元，我们将用 Python 的 **PLY（Python Lex-Yacc）** 库，从零搭建一个 Scheme 子集的前端，让 `.scm` 文件进去，一棵嵌套列表 AST 出来。

---

## 1. 先看成品：10 秒感受“前端”在干什么

```scheme
(define (square x) (* x x))
```

经过双塔流水线后，变成：

```python
['define', ['square', 'x'], ['*', 'x', 'x']]
```

**这就是编译器的“阅读理解”结果。** 没有这一步，解释器看到的只是一串字符。而有了 AST，解释器就可以递归遍历求值——这正是巅峰项目 **Scheme 解释器 REPL 中 “R”（Read）环节** 的核心能力。

---

## 2. 第一座塔：词法分析（Lexing）——把字符串切成 Token 流

### 2.1 直觉类比

大脑读“我喜欢编程”会自动切分成 `["我","喜欢","编程"]`。词法分析器干的就是这件事——把源代码字符串切成有意义的 **词法单元（Token）**。

对于 `(define (square x) (* x x))`，词法分析器应输出：

```
LPAREN  →  (
IDENTIFIER → define
LPAREN  →  (
IDENTIFIER → square
IDENTIFIER → x
RPAREN  →  )
LPAREN  →  (
IDENTIFIER → *
IDENTIFIER → x
IDENTIFIER → x
RPAREN  →  )
RPAREN  →  )
```

### 2.2 用 PLY 的 `lex` 模块实现

PLY 的约定：**你定义什么 Token，就写什么 `t_` 开头的规则。** 下面是核心骨架：

```python
import ply.lex as lex

tokens = (
    'LPAREN', 'RPAREN',      # ( )
    'QUOTE',                  # '
    'NUMBER',                 # 42, -3, 3.14
    'BOOLEAN',                # #t, #f
    'IDENTIFIER',             # square, x, +
)

t_LPAREN  = r'\('
t_RPAREN  = r'\)'
t_QUOTE   = r'\''

def t_NUMBER(t):
    r'-?\d+\.?\d*'            # 整数或小数
    t.value = float(t.value) if '.' in t.value else int(t.value)
    return t

def t_BOOLEAN(t):
    r'#t|#f'
    t.value = True if t.value == '#t' else False
    return t

def t_IDENTIFIER(t):
    r'[a-zA-Z+\-*/<=>!?][a-zA-Z0-9+\-*/<=>!?]*'
    return t

t_ignore  = ' \t'
t_ignore_COMMENT = r';.*'     # 行注释

def t_newline(t):
    r'\n+'
    t.lexer.lineno += len(t.value)

def t_error(t):
    print(f"⚠️ 非法字符 '{t.value[0]}' 在第 {t.lexer.lineno} 行")
    t.lexer.skip(1)

lexer = lex.lex()
```

### 2.3 立刻试试

```python
code = "(define (square x) (* x x))"
lexer.input(code)
while True:
    tok = lexer.token()
    if not tok: break
    print(f"{tok.type:12} → {tok.value}")
```

输出与预期一致。

> 🧙 **魔法要点**：PLY 按 `t_` 函数的**定义顺序**匹配——先定义的规则优先级更高。这就是为什么 `t_BOOLEAN` 要放在 `t_IDENTIFIER` 前面（否则 `#t` 会被误认为标识符）。同时，`t_ignore` 中的字符会被自动跳过，不会产生 Token。

### 2.4 关键陷阱：负数与减号

Scheme 中 `-` 既是标识符（减法函数），也是数字前缀（如 `-3`）。词法分析器如何区分？**最长匹配原则**：`t_NUMBER` 的正则 `-?\d+\.?\d*` 会优先匹配 `-3` 为一个 NUMBER token；单独的 `-` 因不满足 `\d+` 而不会被匹配，最终落入 `t_IDENTIFIER`。因此，**必须将 `t_NUMBER` 定义在 `t_IDENTIFIER` 之前**，否则 `-3` 会被切成 `-` 和 `3` 两个 token。

---

## 3. 第二座塔：语法分析（Parsing）——把 Token 流组装成 AST

### 3.1 从 Token 到树：LALR(1) 解析

词法分析给了我们一串“单词”，语法分析器的任务是把它们按**文法规则**组装成一棵树。PLY 的 `yacc` 模块使用 **LALR(1)** 算法——工业界最主流的自底向上解析算法，Yacc/Bison 都用它。

### 3.2 用 BNF 描述 Scheme 语法

Scheme 一切皆 S-表达式。一个 S-表达式要么是原子，要么是 `(操作符 操作数...)` 的列表。BNF 如下：

```
expression : atom
           | '(' expression_list ')'

atom       : NUMBER | BOOLEAN | IDENTIFIER

expression_list : expression
                | expression_list expression
```

### 3.3 用 PLY 的 `yacc` 实现

```python
import ply.yacc as yacc
from scheme_lexer import tokens

def p_expression_atom(p):
    '''expression : NUMBER
                  | BOOLEAN
                  | IDENTIFIER'''
    p[0] = p[1]

def p_expression_list(p):
    '''expression : LPAREN expression_list RPAREN'''
    p[0] = p[2]                    # 扔掉括号，返回内部列表

def p_expression_list_first(p):
    '''expression_list : expression'''
    p[0] = [p[1]]

def p_expression_list_rest(p):
    '''expression_list : expression_list expression'''
    p[0] = p[1] + [p[2]]

def p_error(p):
    if p:
        print(f"❌ 语法错误：意外 Token '{p.value}'")
    else:
        print("❌ 语法错误：输入不完整")

parser = yacc.yacc()
```

### 3.4 见证奇迹

```python
result = parser.parse("(define (square x) (* x x))")
print(result)   # ['define', ['square', 'x'], ['*', 'x', 'x']]
```

**完美！** 这正是 REPL 中 `Read` 阶段的输出。

---

## 4. 扩展语法：支持 `quote`、空列表、点对

### 4.1 引号语法 `'x` ≡ `(quote x)`

添加一条产生式即可：

```python
def p_expression_quote(p):
    '''expression : QUOTE expression'''
    p[0] = ['quote', p[2]]
```

现在 `'apple` → `['quote', 'apple']`，`'(1 2)` → `['quote', [1, 2]]`。

### 4.2 支持空列表 `()`

当前文法要求列表至少有一个元素。要支持 `()`，需增加一条空产生式：

```python
def p_expression_list_empty(p):
    '''expression_list : '''
    p[0] = []                     # 空列表
```

**注意**：空产生式必须放在 `expression_list` 的其他产生式**之后**，否则会导致解析器在遇到 `)` 时不知道该归约成空列表还是等待更多 token。PLY 会报告 shift/reduce 冲突，但通过定义顺序（空产生式在后）可让解析器优先选择移进，从而正确解析 `()`。

### 4.3 点对（dotted pair）`(1 . 2)`

Scheme 的点对是构建非列表结构的关键。添加一条规则：

```python
def p_expression_dotted(p):
    '''expression : LPAREN expression_list DOT expression RPAREN'''
    p[0] = p[2] + ['.', p[4]]     # 用 Python 列表模拟，如 [1, '.', 2]
```

同时需在词法分析器中添加 `DOT` token：`t_DOT = r'\.'`（注意转义）。这样 `(1 . 2)` 会被解析为 `[1, '.', 2]`，解释器可据此构造 cons 对。

---

## 5. 调试必杀技：shift/reduce 冲突

当你扩展语法时，PLY 可能会报：

```
WARNING: 1 shift/reduce conflict
```

这意味着解析器在某个状态下**不知道该“移进”下一个 Token 还是“归约”当前规则**。例如，加入空列表产生式时，解析器在遇到 `)` 时面临选择：移进 `)` 以完成列表，还是归约空 `expression_list`？通过将空产生式放在最后，PLY 默认选择移进，从而正确解析 `()`。

**调试三步法：**

1. **生成调试文件**：`parser = yacc.yacc(debug=True)`，会生成 `parser.out`，里面详细列出了每个状态和冲突。
2. **设置优先级**：用 `precedence` 元组声明运算符优先级和结合性（Scheme 中极少用，但若添加中缀运算符则必需）。
3. **重构文法**：如果冲突复杂，把歧义规则拆成更明确的产生式。

> 💡 对于 Scheme 子集，由于 S-表达式天然无歧义，你基本不会遇到冲突——这是 Lisp 家族语言的巨大优势。

---

## 6. 完整流水线：从文件到 AST（支持多表达式）

Scheme 源文件通常包含多个表达式。修改顶层文法：

```python
def p_program(p):
    '''program : expression_list'''
    p[0] = p[1]

def p_expression_list_multi(p):
    '''expression_list : expression_list expression
                       | expression'''
    # 与之前相同，但允许顶层多个表达式
```

然后构建解析器时指定起始符号：`parser = yacc.yacc(start='program')`。现在 `parser.parse("(define a 1) (define b 2)")` 会返回 `[['define', 'a', 1], ['define', 'b', 2]]`。

---

## 7. 单元小结 & 通向巅峰项目的桥梁

| 概念 | 一句话 |
|------|--------|
| **词法分析（Lexing）** | 正则 + 有限状态机，把字符串切成 Token |
| **语法分析（Parsing）** | BNF 文法 + LALR(1)，把 Token 组装成 AST |
| **PLY `lex`** | `t_` 前缀定义 Token，按顺序匹配，支持动作函数 |
| **PLY `yacc`** | `p_` 前缀定义产生式，`p[0]` 是归约结果 |
| **shift/reduce 冲突** | 解析器不知道该移进还是归约，用优先级或重构文法解决 |

**下一步**：带着这个 AST 生成器，你将进入 **Unit 3（AST 遍历与环境模型）**，学习如何递归遍历这棵嵌套列表树，实现 `define`、`lambda`、`if` 的求值逻辑。最终在巅峰项目中，三者合一——**Lexer + Parser + Evaluator = 一个完整的 Scheme 解释器**。

> 🏰 *“双塔已立，圣殿之门即将开启。”*