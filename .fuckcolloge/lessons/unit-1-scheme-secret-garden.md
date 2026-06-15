# Scheme 语法的秘密花园：S 表达式与函数式思维初探

> “代码即数据，数据即代码”——这不是哲学口号，而是 Scheme 给你的超能力。

## 0. 欢迎来到括号星球 🌍

先别被密密麻麻的括号吓跑。看完这一节，你会爱上它们的——我保证。

打开你的 Python REPL（没错，Python！），我们先用 Python 当“翻译官”，来一场 Scheme 速览：

```python
# 假装 Python 是 Scheme 解释器——你期末项目就会真的写出它！
>>> from functools import reduce
>>> # (+ 1 2) → Python 脑内翻译：1 + 2
>>> 1 + 2
3
```

**Scheme 的第一条法则：运算符在最前面。** 不是 `1 + 2`，而是 `(+ 1 2)`。这叫**前缀表达式**。为什么？因为 Scheme 里 `+` 不是“运算符”，它只是一个**普通函数名**——和 `fact`、`display` 没有任何地位区别。这为“代码即数据”埋下了最深的伏笔。

---

## 1. S 表达式：一棵披着括号外衣的树 🌳

**S 表达式（S-expression）** 是 Scheme 唯一的语法。没有逗号、没有分号、没有缩进争议——只有原子和列表。

| 类型 | 例子 | 含义 |
|------|------|------|
| 原子（Atom） | `42`, `#t`, `"hello"`, `x` | 不可再分的值或符号 |
| 列表（List） | `(+ 1 2)`, `(define x 10)` | 括号包裹的若干 S 表达式 |

**关键洞察**：`(+ 1 (* 2 3))` 既是一段**代码**（调用 `+`），也是一个**嵌套列表数据结构**：

```
(+ 1 (* 2 3))
 → Python 视角：['+', 1, ['*', 2, 3]]
```

这就是“代码即数据”的核心：**你的程序本身就是一棵 AST（抽象语法树），Scheme 把它赤裸裸地交到你手上。** 在 Python 里 `1 + 2 * 3` 需要解析器才能变成 AST；在 Scheme 里，你直接看到的就是 AST。

> 🎯 **期末项目伏笔**：你的 Scheme 解释器的 `read` 阶段，就是把字符串 `"(+ 1 2)"` 解析成 Python 的 `Pair('+', Pair(1, Pair(2, nil)))`。今天你学会“看” S 表达式，就是在训练你解释器的“眼睛”。

---

## 2. 四则运算与 define：你的第一行 Scheme 🖊️

```scheme
(+ 1 2 3 4)        ; → 10（加法支持多参数！）
(- 10 3 2)         ; → 5（从左到右连续减）
(* 2 3 4)          ; → 24
(/ 12 2 3)         ; → 2
(= 5 5)            ; → #t（真）
(< 3 5)            ; → #t
```

**变量绑定**用 `define`：

```scheme
(define x 10)           ; x = 10
(define y (+ x 5))      ; y = 15
```

**函数定义**——两种写法，完全等价：

```scheme
; 方式一：define + lambda（显式版）
(define fact
  (lambda (n)
    (if (= n 0)
        1
        (* n (fact (- n 1))))))

; 方式二：语法糖（常用版）
(define (fact n)
  (if (= n 0)
      1
      (* n (fact (- n 1)))))
```

> 🧠 **心智模型**：方式二只是方式一的语法糖。你的解释器项目里，`(define (name args...) body)` 会被展开成 `(define name (lambda (args...) body))`。理解这一点，你就理解了 Scheme 的“去糖化”。

---

## 3. lambda：函数是一等公民 👑

`lambda` 创建一个**匿名函数**——函数和 `42` 一样，是可以随手传递的值：

```scheme
(lambda (x) (* x x))           ; 一个求平方的函数
((lambda (x) (* x x)) 5)       ; → 25（定义后立刻调用！）
```

**高阶函数三剑客**：

```scheme
(map (lambda (x) (* x x)) '(1 2 3 4))     ; → (1 4 9 16)
(filter even? '(1 2 3 4 5 6))             ; → (2 4 6)
(apply + '(1 2 3 4))                      ; → 10
```

> 🔥 **为什么这很酷？** Python 里你写 `map(lambda x: x*x, [1,2,3])` 觉得理所当然——但 Scheme 在 1975 年就已经这样做了。lambda 不是后来“加入”的特性，它是 Scheme 的**原生呼吸方式**。

---

## 4. 条件分支：if 与 cond 🌿

```scheme
; if 表达式：三部分——条件、真分支、假分支
(if (> x 0)
    "positive"
    "non-positive")

; cond：多分支（相当于 Python 的 if-elif-else）
(cond ((< x 0) "negative")
      ((= x 0) "zero")
      (else    "positive"))
```

**关键区别**：Scheme 的 `if` 是**表达式**，不是语句——它**一定返回值**。这意味着你可以写 `(+ (if #t 1 2) 3)` 得到 `4`，这在 Python 中是不可能的。`cond` 同理，每个分支的最后一个表达式就是该分支的返回值。

> ⚠️ **陷阱**：`cond` 如果没有 `else` 且所有条件都不满足，返回值是未定义的（CS61A 解释器可能报错）。**永远加上 `else` 分支**。

---

## 5. 递归：Scheme 的循环就是递归 🔄

Scheme 没有 `for`、`while`。**循环 = 递归**。

```scheme
; 计算列表长度
(define (my-length lst)
  (if (null? lst)
      0
      (+ 1 (my-length (cdr lst)))))

; 列表求和
(define (sum lst)
  (if (null? lst)
      0
      (+ (car lst) (sum (cdr lst)))))
```

**尾递归优化**：Scheme 规范要求实现必须支持尾递归优化——递归深度可以无限，不会栈溢出。要让递归成为尾递归，需要把中间结果作为参数传递：

```scheme
(define (fact n)
  (define (iter n acc)
    (if (= n 0) acc (iter (- n 1) (* n acc))))
  (iter n 1))
```

这里 `iter` 的递归调用是函数体最后一步，解释器可以复用栈帧，实现常数空间。

---

## 6. cons / car / cdr：列表的乐高积木 🧱

Scheme 的列表由 **cons 单元（pair）** 串联而成：

```scheme
(cons 1 2)              ; → (1 . 2)  —— 一个 pair
(cons 1 (cons 2 '()))   ; → (1 2)    —— 一个 proper list
(car '(1 2 3))          ; → 1        —— 取头部
(cdr '(1 2 3))          ; → (2 3)    —— 取尾部
```

列表本质：`(1 2 3)` = `(cons 1 (cons 2 (cons 3 '())))`。`'()` 是空列表（nil）。

> ⚠️ **陷阱**：`(1 . 2)` 不是 proper list，它的 `cdr` 不是 pair 也不是 `'()`，对它使用 `length` 或 `map` 会出错。**确保列表最后一个 cons 的 cdr 是 `'()`**。

> 📐 **手拆练习**：把 `(define (square x) (* x x))` 拆成嵌套列表结构：
> ```
> (define (square x) (* x x))
> → ['define', ['square', 'x'], ['*', 'x', 'x']]
> ```
> 这就是你解释器项目里 `scheme_read` 要干的事——把字符串变成 Pair 链。

---

## 7. quote 与词法作用域 🔒

```scheme
(quote (1 2 3))     ; → (1 2 3)，阻止求值
'(1 2 3)            ; 同上，' 是 quote 的语法糖
```

`quote` 告诉 Scheme：“别求值这个表达式，把它当数据还给我。” 这是“代码即数据”的操作按钮。

**词法作用域（Lexical Scoping）**：变量的可见性由**源代码的文本结构**决定，而非运行时调用栈。

```scheme
(define (make-adder x)
  (lambda (y) (+ x y)))      ; x 被“捕获”进闭包

(define add5 (make-adder 5))
(add5 3)                      ; → 8
```

`x` 在 `lambda` 内部依然可见——因为它在 `make-adder` 的**词法作用域**内。这就是**闭包（closure）**。

> ⚠️ **陷阱**：`'(1 2 3)` 创建的是**字面量列表**，修改它的元素（如 `set-car!`）行为是未定义的，可能导致不可预测的错误。在 CS61A 项目中，请把引用的列表当作只读数据。

---

## 8. 从 Scheme 到解释器：全景图 🗺️

学完本单元，你已经能写出这样的 Scheme 程序：

```scheme
(define (primes-to n)
  (define (range a b)
    (if (> a b) '() (cons a (range (+ a 1) b))))
  (define (filter pred lst)
    (if (null? lst)
        '()
        (if (pred (car lst))
            (cons (car lst) (filter pred (cdr lst)))
            (filter pred (cdr lst)))))
  (define (sieve lst)
    (if (null? lst)
        '()
        (cons (car lst)
              (sieve (filter (lambda (x) (not (= (modulo x (car lst)) 0)))
                             (cdr lst))))))
  (sieve (range 2 n)))
```

**但更重要的是**，你现在拥有了一种“X 光透视眼”——看到 `(+ 1 2)`，你脑中浮现的不再是“加法”，而是 `Pair('+', Pair(1, Pair(2, nil)))`。

这就是下一单元的入场券：**词法分析（Lexing）与语法解析（Parsing）**——把字符串变成 AST。你已经知道 AST 长什么样了，剩下的只是写出那个转换器。

> 🏰 **巅峰项目预告**：你的 Scheme 解释器将实现 REPL（Read → Eval → Print → Loop）。本单元教会你“说 Scheme”，下一单元教会你“拆 Scheme”，第三单元教会你“运行 Scheme”。三块基石垒在一起——你将亲手让代码在 Python 中活过来。

---

**括号不是枷锁，是翅膀。** 下一站：词法分析的拆解魔法。🪄