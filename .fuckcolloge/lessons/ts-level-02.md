# 基础类型与类型标注：把“可能是什么”写清楚

TypeScript 的类型是**编译期契约**：编译后会被擦除，不改变 JavaScript 运行时行为。它真正回答的问题是：这个表达式“可能”有哪些值？

## 1. 基础类型

```ts
let name: string = "Ada";
let age: number = 36;        // JS 的 number 包括 NaN、Infinity
let active: boolean = true;  // 只表示 true/false，不是“真值”
let empty: string | null = null;
let later: string | undefined = undefined;
```

- `null`：显式表示“没有值”。
- `undefined`：变量未赋值、属性不存在、参数缺失等。
- 开启 `strictNullChecks` / `strict` 后，`null`、`undefined` 不能直接赋给 `string` 等类型，除非写进联合类型。

```ts
let title: string = null;            // strictNullChecks 下错误
let title2: string | null = null;    // 正确
```

- `any`：关闭类型检查。

```ts
let data: any = 1;
data.noMethod(); // 编译通过，但运行可能 TypeError
```

- `unknown`：安全版 `any`。它可以接收任何值，但使用前必须收窄。

```ts
let value: unknown = "hello";

if (typeof value === "string") {
  value.toUpperCase(); // OK：此处 value 是 string
}
```

- `never`：表示“没有正常返回值”，常用于抛错、无限循环、穷尽检查。它不同于 `void`：`void` 可以正常结束并返回 `undefined`，`never` 不会正常结束。

```ts
function fail(): never {
  throw new Error("失败");
}
```

## 2. 函数：标注边界，推断细节

```ts
function add(a: number, b: number): number {
  return a + b;
}

function log(message: string): void {
  console.log(message);
}
```

参数和返回值是函数契约。TypeScript 会推断 `const x = 10` 为 `number`，但公开函数、回调、配置对象等“边界”建议显式标注，防止以后改坏接口。

## 3. 对象、数组与元组

```ts
type User = {
  id: number;
  name: string;
  active?: boolean; // 可缺省；读取时类型为 boolean | undefined
};

const user: User = { id: 1, name: "Ada" };
const active = user.active?.toString(); // 安全访问
```

可选属性表示键可以不存在；读取它时通常得到 `boolean | undefined`。

数组表示“多个同类型元素”，长度通常可变：

```ts
let scores: number[] = [90, 88];
let names: Array<string> = ["Ada"];
```

元组表示“每个位置的类型固定”：

```ts
let point: [number, number] = [10, 20];
const [x, y] = point; // x: number, y: number
```

Gotcha：元组不等于只读数组。若要禁止修改，使用 `readonly`：

```ts
let fixed: readonly [number, number] = [10, 20];
// fixed[0] = 30; // 错误
// fixed.push(30); // 错误
```

带 rest 的元组可表达“至少两个数字”：

```ts
type AtLeastTwo = [number, number, ...number[]];
```

## 4. 联合类型与类型收窄

联合类型表示“这些类型之一”：

```ts
type ID = string | number;

function formatId(id: ID): string {
  if (typeof id === "number") {
    return `ID: ${id}`;
  }
  return `ID: ${id.toUpperCase()}`;
}
```

收窄前，只能访问所有成员共有的操作；收窄后，TypeScript 会知道当前分支的具体类型。

```ts
function describe(value: string | number): string {
  if (typeof value === "string") return value.toUpperCase();
  return value.toFixed(2);
}
```

Gotcha：`typeof null === "object"`，所以检查 `null` 要写 `value === null`，不要只靠 `typeof`。

## 5. `never` 的穷尽检查

```ts
type Shape =
  | { kind: "circle"; r: number }
  | { kind: "rect"; w: number; h: number };

function assertNever(x: never): never {
  throw new Error(`未处理分支: ${JSON.stringify(x)}`);
}

function area(s: Shape): number {
  switch (s.kind) {
    case "circle": return Math.PI * s.r * s.r;
    case "rect": return s.w * s.h;
    default: return assertNever(s);
  }
}
```

如果以后新增 `Shape` 分支却忘了处理，`assertNever(s)` 会报错。这是用类型系统防止逻辑遗漏。

## 6. 练习与参考解

```ts
function parseScore(score: string): number | null {
  const n = Number(score);
  return Number.isFinite(n) ? n : null;
}
```

注意：`Number("")` 和 `Number(" ")` 都是 `0`；若空格不算有效输入，应先检查 `score.trim() !== ""`。

```ts
function firstTwo(nums: number[]): [number, number] {
  const a = nums[0];
  const b = nums[1];

  if (a === undefined || b === undefined) {
    throw new Error("至少需要两个数字");
  }

  return [a, b];
}
```

若开启 `noUncheckedIndexedAccess`，`nums[0]` 会是 `number | undefined`，这类检查更重要。

核心问题：看到任何值，都问“它可能有哪些类型？我在使用前是否已经证明它是其中某一种？”