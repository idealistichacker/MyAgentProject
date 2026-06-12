# JavaScript 基础：从 1+1=2 到可运行代码

## 学习目标

完成本课后，你应该能够：

- 理解变量、数字、字符串、布尔值等基础概念。
- 使用 `console.log` 输出计算结果。
- 写出并运行 `1 + 1 = 2` 对应的 JavaScript 代码。
- 使用变量保存数字，并完成简单加减乘除。
- 写出简单函数，例如 `add(a, b)` 返回两个数的和。

---

## 1. JavaScript 是什么？

JavaScript 是一门编程语言，常用于网页交互，也可以通过 Node.js 在电脑命令行中运行。

它的基本工作方式可以理解为：

1. 你写代码。
2. JavaScript 解释并执行代码。
3. 程序产生结果，例如输出一个数字。

例如，数学中：

```text
1 + 1 = 2
```

在 JavaScript 中可以写成：

```javascript
console.log(1 + 1);
```

运行后会输出：

```text
2
```

---

## 2. 第一行可运行代码：输出 1 + 1

JavaScript 中常用 `console.log()` 把结果显示在控制台。

```javascript
console.log(1 + 1);
```

这行代码可以拆成两部分：

- `1 + 1`：计算表达式。
- `console.log(...)`：把计算结果打印出来。

所以：

```javascript
console.log(1 + 1);
```

表示：先计算 `1 + 1`，再把结果 `2` 输出。

---

## 3. 基础数据类型

JavaScript 中有几种常见的基础数据类型。

| 类型 | 例子 | 说明 |
|---|---|---|
| 数字 number | `1`, `2.5`, `-3` | 表示数字 |
| 字符串 string | `"hello"`, `"你好"` | 表示文本 |
| 布尔值 boolean | `true`, `false` | 表示是或非 |
| undefined | `undefined` | 表示还没有值 |

示例：

```javascript
let age = 18;
let name = "Ada";
let isStudent = true;
```

说明：

- `18` 是数字。
- `"Ada"` 是字符串。
- `true` 是布尔值。

---

## 4. 变量：给数据起名字

变量可以理解为一个“盒子”，用来保存数据。

```javascript
let apples = 3;
let oranges = 2;
```

这里：

- `apples` 是一个变量名。
- `3` 是保存的值。
- `=` 是赋值符号，表示把右边的值保存到左边的变量中。

然后可以这样使用变量：

```javascript
console.log(apples + oranges);
```

输出：

```text
5
```

因为：

```javascript
apples + oranges
```

等价于：

```javascript
3 + 2
```

---

## 5. let 和 const

### 使用 let 声明可以改变的变量

```javascript
let score = 10;
score = 15;
```

`score` 一开始是 `10`，后来被改成 `15`。

### 使用 const 声明常量

```javascript
const pi = 3.14;
```

`const` 声明的变量通常表示不会重新赋值的常量。

一般规则：

- 如果值以后可能会变，用 `let`。
- 如果值不会变，用 `const`。

---

## 6. 运算符：让数字参与计算

JavaScript 中常用运算符如下：

| 运算符 | 含义 | 示例 | 结果 |
|---|---|---|---|
| `+` | 加法 | `1 + 1` | `2` |
| `-` | 减法 | `5 - 2` | `3` |
| `*` | 乘法 | `3 * 4` | `12` |
| `/` | 除法 | `10 / 2` | `5` |
| `()` | 改变优先级 | `(2 + 3) * 4` | `20` |

示例：

```javascript
let a = 10;
let b = 2;

console.log(a + b); // 12
console.log(a - b); // 8
console.log(a * b); // 20
console.log(a / b); // 5
```

注意运算优先级：

```javascript
console.log(2 + 3 * 4);
```

输出：

```text
14
```

因为先算乘法：

```javascript
3 * 4 = 12
2 + 12 = 14
```

如果想先算加法，要使用括号：

```javascript
console.log((2 + 3) * 4);
```

输出：

```text
20
```

---

## 7. 使用字符串输出完整表达

有时候我们不只想要结果，还想输出一句完整的话。

```javascript
console.log("1 + 1 = " + (1 + 1));
```

输出：

```text
1 + 1 = 2
```

这里：

```javascript
"1 + 1 = "
```

是字符串。

```javascript
1 + 1
```

是计算表达式。

括号很重要：

```javascript
"1 + 1 = " + (1 + 1)
```

会输出：

```text
1 + 1 = 2
```

---

## 8. 函数：把一段计算包装起来

函数可以理解为一段可重复使用的代码。

例如，数学中有：

```text
add(1, 1) = 2
```

JavaScript 中可以写成：

```javascript
function add(a, b) {
  return a + b;
}
```

使用函数：

```javascript
console.log(add(1, 1)); // 2
console.log(add(3, 4)); // 7
```

函数由几部分组成：

```javascript
function add(a, b) {
  return a + b;
}
```

说明：

- `function`：声明这是一个函数。
- `add`：函数名。
- `a`, `b`：参数，表示传入的数字。
- `{ ... }`：函数体，里面写要执行的代码。
- `return a + b;`：把计算结果返回。

---

## 9. return 和 console.log 的区别

`return` 和 `console.log` 都常见，但作用不同。

### console.log：打印结果

```javascript
console.log(1 + 1);
```

作用是把 `2` 显示出来。

### return：把结果交给函数调用者

```javascript
function add(a, b) {
  return a + b;
}
```

这里函数没有自己打印结果，而是把 `a + b` 的值返回。

例如：

```javascript
let result = add(1, 1);
console.log(result); // 2
```

---

## 10. 一个完整的小程序

下面代码展示了变量、运算符和输出：

```javascript
let x = 1;
let y = 1;
let sum = x + y;

console.log("x =", x);
console.log("y =", y);
console.log("x + y =", sum);
```

输出：

```text
x = 1
y = 1
x + y = 2
```

你可以修改 `x` 和 `y` 的值，例如：

```javascript
let x = 3;
let y = 4;
let sum = x + y;

console.log("x + y =", sum);
```

输出：

```text
x + y = 7
```

---

## 11. 如何运行 JavaScript 代码

### 方法一：使用 Node.js

1. 安装 Node.js。
2. 新建一个文件，例如 `app.js`。
3. 在文件中写入代码：

```javascript
console.log(1 + 1);
```

4. 在命令行运行：

```bash
node app.js
```

5. 看到输出：

```text
2
```

### 方法二：使用浏览器控制台

1. 打开浏览器。
2. 按 `F12` 打开开发者工具。
3. 进入 Console 控制台。
4. 输入：

```javascript
console.log(1 + 1);
```

5. 回车后看到输出：

```text
2
```

---

## 12. 常见错误

### 错误 1：使用中文符号

错误示例：

```javascript
console.log（1 + 1）
```

正确示例：

```javascript
console.log(1 + 1);
```

JavaScript 代码中的括号、引号、分号通常使用英文符号。

---

### 错误 2：忘记 console.log

```javascript
1 + 1;
```

这段代码虽然计算了，但没有把结果打印出来。

应该写：

```javascript
console.log(1 + 1);
```

---

### 错误 3：变量名大小写不一致

错误示例：

```javascript
let score = 10;
console.log(Score);
```

正确示例：

```javascript
let score = 10;
console.log(score);
```

JavaScript 区分大小写，`score` 和 `Score` 是两个不同名字。

---

### 错误 4：函数应该返回时却只打印

错误示例：

```javascript
function add(a, b) {
  console.log(a + b);
}
```

如果题目要求函数返回结果，应使用 `return`：

```javascript
function add(a, b) {
  return a + b;
}
```

---

## 13. 小练习建议

你可以尝试完成以下任务：

1. 把 `console.log(1 + 1);` 改成 `console.log(3 + 4);`，观察输出。
2. 用变量保存两个数字，并计算它们的和。
3. 用变量保存两个数字，并计算它们的差、积、商。
4. 写一个 `multiply(a, b)` 函数，返回两个数的乘积。
5. 预测下面代码输出什么，再运行验证：

```javascript
let a = 5;
let b = 2;

console.log(a + b);
console.log(a - b);
console.log(a * b);
console.log(a / b);
```

---

## 总结

本课核心知识点：

- `console.log()` 用于输出结果。
- `1 + 1` 是表达式，结果是 `2`。
- 变量用来保存数据，例如 `let x = 1;`。
- 常见运算符包括 `+`、`-`、`*`、`/`。
- 函数用 `function` 定义，用 `return` 返回结果。
- 写代码时要注意英文符号、变量名大小写和 `return` 的使用。

---