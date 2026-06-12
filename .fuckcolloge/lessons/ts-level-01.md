# TypeScript 定位：JavaScript 的静态类型层

## 0. 修订要点

原稿方向正确，但需要更精确地区分：**TypeScript 的类型检查发生在开发期/编译期，不进入运行时**；TypeScript 不是“更安全的 JavaScript 运行时”，而是 JavaScript 的**静态类型层 + 编译器 + 工程工具链**。

---

## 1. TypeScript 与 JavaScript 的关系

TypeScript，简称 TS，是 JavaScript，简称 JS 的**超集**。更准确地说：

> TypeScript ≈ JavaScript 语法 + 静态类型系统 + 编译器/编辑器工具链

语法层面，大多数 JavaScript 代码都可以作为 TypeScript 代码理解；但 TypeScript 增加了类型标注、类型推断、接口、泛型等能力。

```ts
function add(a: number, b: number): number {
  return a + b;
}

add(1, 2);     // OK
add(1, "2");   // TS 报错：不能把 string 传给 number
```

编译后，类型标注会被擦除：

```js
function add(a, b) {
  return a + b;
}

add(1, "2"); // 运行时仍会得到 "12"
```

关键 gotcha：

> TypeScript 不会自动插入运行时类型检查。

除非你自己写校验逻辑，否则错误类型仍然可能进入运行时。

---

## 2. TypeScript 解决什么问题？

JavaScript 是动态类型语言：

```js
let x = 1;
x = "hello";
x = { name: "Alice" };
```

这在小程序中灵活，但在大型项目中容易造成隐患：

```js
function add(a, b) {
  return a + b;
}

add(1, "2"); // 得到 "12"，但可能期望 3
```

TypeScript 通过静态类型检查，在代码运行前发现许多问题：

```ts
function add(a: number, b: number): number {
  return a + b;
}

add(1, "2"); // 编译期报错
```

它主要提升：

1. **错误提前暴露**：减少 `undefined is not a function`、字段拼写错误等问题。
2. **编辑器体验**：自动补全、跳转定义、重命名重构。
3. **团队协作**：类型像机器可检查的文档。
4. **大型项目维护**：修改接口、函数签名时更容易发现影响范围。
5. **业务建模**：用类型表达状态、约束和数据结构。

---

## 3. 类型、运行时、编译器：必须分清

### 3.1 类型层

类型描述数据的形状：

```ts
type User = {
  id: number;
  name: string;
  tags?: string[];
};

const user: User = {
  id: 1,
  name: "Alice",
};
```

TypeScript 使用**结构类型系统**：只要结构匹配，就可以赋值。

```ts
const obj = { id: 1, name: "Alice", age: 20 };

const user: User = obj; // OK，即使 obj 多了 age
```

但对象字面量有额外检查：

```ts
const user2: User = {
  id: 1,
  name: "Alice",
  age: 20, // 直接赋值时常会报错：多余属性
};
```

### 3.2 运行时

运行时仍然是 JavaScript 环境：浏览器、Node.js、Deno、Bun 等。

```ts
let x: string = "hello";
```

编译后：

```js
let x = "hello";
```

`string` 不会出现在运行时。

### 3.3 编译器

`tsc` 负责：

- 类型检查；
- 将 TS 转成 JS；
- 根据配置生成 `.d.ts`、`.js`；
- 控制目标语法版本和模块系统。

---

## 4. 静态类型检查 vs 动态运行时行为

JavaScript 中，变量类型由运行时的值决定：

```js
let value = 1;
value = "abc"; // OK
```

TypeScript 中，类型在编码期被检查：

```ts
let value: number = 1;
value = "abc"; // TS 报错
```

即使不写类型，TS 也会推断：

```ts
let value = 1;
value = "abc"; // 仍然报错，因为推断为 number
```

但 TS 不是万能的。外部数据必须运行时校验：

```ts
const data = JSON.parse(input) as User;
```

`as User` 只是告诉编译器“相信我”，不会验证 `input`。

更安全写法：

```ts
function isUser(value: unknown): value is User {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as User).id === "number" &&
    typeof (value as User).name === "string"
  );
}

const parsed: unknown = JSON.parse(input);

if (isUser(parsed)) {
  parsed.name; // 这里才是 User
}
```

核心 gotcha：

- `any`：关闭类型检查，容易失去 TS 价值。
- `unknown`：必须收窄后才能使用，更安全。
- `as`：类型断言，不是运行时转换。
- `strictNullChecks`：让 `null` / `undefined` 必须显式处理。

---

## 5. tsconfig 的作用

`tsconfig.json` 是 TypeScript 项目的工程配置：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "outDir": "dist",
    "noEmitOnError": true
  },
  "include": ["src"]
}
```

常见配置：

| 配置 | 含义 |
|---|---|
| `target` | 输出哪个版本的 JavaScript |
| `module` | 模块系统，如 CommonJS、ESNext |
| `moduleResolution` | 如何解析 import |
| `strict` | 开启严格类型检查 |
| `lib` | 声明可用全局 API，如 DOM、ES2020 |
| `outDir` | 编译产物目录 |
| `declaration` | 生成 `.d.ts` 类型声明 |
| `noEmit` | 只检查，不输出 JS |
| `include/exclude` | 控制纳入检查的文件 |

现代项目通常应开启 `strict: true`，否则 TypeScript 可能退化为“带注释的 JavaScript”。

---

## 6. 推荐学习路径

1. **基础类型**：`number`、`string`、`boolean`、数组、元组、对象、函数、联合类型、字面量类型。
2. **工程配置**：`tsconfig`、模块、构建、类型检查、`.d.ts`。
3. **泛型**：让函数、接口、类支持“类型参数化”。
4. **类型建模**：用 `interface`、`type`、`readonly`、`optional`、`as const` 表达业务约束。
5. **高级类型**：条件类型、映射类型、索引访问、类型守卫、工具类型。
6. **框架实战**：React/Vue/Node.js/API 类型共享/表单与状态建模。

最终目标不是“到处写类型标注”，而是用类型系统表达程序意图，让错误更早暴露，让代码更容易推理和维护。