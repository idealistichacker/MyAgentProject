# JavaScript/TypeScript 基础与前端项目入门

## 1. 学习目标：从“会写语法”到“能建模”

本单元以项目驱动方式学习前端基础。目标是完成一个可运行的前端应用，例如 **Task Manager**、个人作品集或小型数据展示页面，并能清楚解释：

> 用户事件如何改变状态，状态如何驱动 DOM 更新，数据如何被持久化或异步加载。

**CS61A 式要求**：不要只背 API，要理解 **抽象、状态表示、数据流和函数职责边界**。

---

## 2. 项目规格：Task Manager

建议功能：

- 添加、删除、标记完成任务
- 按 **全部 / 未完成 / 已完成** 筛选
- 使用 `localStorage` 持久化
- 使用 `fetch` 加载模拟数据或 API
- 使用 TypeScript 定义数据模型
- 使用模块拆分 DOM、状态、存储、API
- 使用 Git/GitHub 管理版本

核心数据模型：

```ts
type Task = {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
};

type Filter = "all" | "active" | "done";
```

关键 gotchas：

- `id` 不要用数组下标，否则删除后状态会混乱。
- 标题必须 `trim()`，空任务不能提交。
- 渲染任务标题优先用 `textContent`，避免 `innerHTML` 造成 XSS 风险。

---

## 3. JavaScript 基础：值、作用域与函数

```js
const tasks = [];
let filter = "all";
```

- `const`：绑定不可重新赋值，但对象/数组内部仍可修改。
- `let`：用于会变化的状态。
- `var`：函数作用域，容易产生 bug，现代代码中通常避免。

```js
tasks.push({ id: "1", title: "学习 DOM", done: false });
// tasks = [] // 错误：const 不能重新赋值
```

函数是一等公民，可以作为参数、返回值和对象属性：

```js
function toggleDone(task) {
  return { ...task, done: !task.done };
}

const updateTask = (tasks, id, updater) =>
  tasks.map((task) => (task.id === id ? updater(task) : task));
```

数组方法：

- `map`：逐个转换，返回新数组
- `filter`：筛选元素
- `find`：查找第一个匹配项
- `reduce`：累计计算
- `some` / `every`：判断条件

注意：优先使用不可变更新，例如 `{ ...task }`，而不是直接修改旧对象。

---

## 4. HTML/CSS/DOM：结构、样式与交互

HTML 应语义化：

```html
<form id="task-form" aria-label="添加任务">
  <label for="task-input">任务标题</label>
  <input id="task-input" placeholder="输入任务" />
  <button type="submit">添加</button>
</form>

<ul id="task-list" aria-live="polite"></ul>
```

CSS 使用 Flex/Grid 和媒体查询：

```css
.container {
  display: grid;
  gap: 1rem;
  max-width: 720px;
  margin: auto;
}

@media (max-width: 600px) {
  .container {
    grid-template-columns: 1fr;
    padding: 1rem;
  }
}
```

DOM 交互要围绕状态更新，而不是直接“拼页面”：

```js
form.addEventListener("submit", (event) => {
  event.preventDefault();

  const input = document.querySelector("#task-input");
  const title = input.value.trim();

  if (!title) return;

  const task = {
    id: crypto.randomUUID(),
    title,
    done: false,
    createdAt: Date.now(),
  };

  tasks.push(task);
  render();
  input.value = "";
});
```

Gotchas：

- 表单提交默认会刷新页面，必须 `event.preventDefault()`。
- 输入框类型可能是 `Element`，TypeScript 中需要判断是否为 `HTMLInputElement`。
- 大量任务时，频繁 `innerHTML +=` 会低效且危险；可用 `replaceChildren()` 重建列表。

---

## 5. 异步编程：Promise、async/await 与错误处理

```ts
async function loadTasks(): Promise<Task[]> {
  const response = await fetch("/api/tasks");

  if (!response.ok) {
    throw new Error(`请求失败：HTTP ${response.status}`);
  }

  return response.json();
}

try {
  const tasks = await loadTasks();
  render(tasks);
} catch (error) {
  showError("任务加载失败，请稍后重试");
}
```

重点：

- `fetch` 返回 `Promise<Response>`。
- `await` 只能在 `async` 函数或模块顶层中使用。
- `async` 函数总是返回 Promise。
- `response.ok` 为 `false` 时，`fetch` 不一定会 throw。
- 网络失败、JSON 解析失败、HTTP 错误都应处理。

---

## 6. TypeScript：类型、接口与泛型

TypeScript 是 JavaScript 的超集，最终编译为 JavaScript。类型系统的价值是提前发现错误，而不是运行时“魔法”。

```ts
interface TodoState {
  tasks: Task[];
  filter: Filter;
}
```

`type` 与 `interface`：

- `type`：可表示联合类型、元组、函数类型。
- `interface`：适合描述对象结构，可被扩展。
- 初学者不要滥用 `any`，它会关闭类型检查。

泛型示例：

```ts
function first<T>(items: T[]): T | undefined {
  return items[0];
}

const task = first(tasks);
```

TypeScript gotchas：

- `const x = 1` 推断为字面量类型 `1`，不是宽泛的 `number`。
- 数组方法可能返回 `undefined`，例如 `find()`。
- DOM API 类型很具体，需根据元素类型收窄。

---

## 7. 模块化与工程结构

推荐结构：

```txt
task-manager/
├─ index.html
├─ src/
│  ├─ main.ts
│  ├─ types.ts
│  ├─ render.ts
│  ├─ storage.ts
│  └─ api.ts
├─ style.css
├─ package.json
└─ tsconfig.json
```

模块示例：

```ts
// storage.ts
export function saveTasks(tasks: Task[]): void {
  localStorage.setItem("tasks", JSON.stringify(tasks));
}

export function loadTasks(): Task[] {
  try {
    return JSON.parse(localStorage.getItem("tasks") || "[]");
  } catch {
    return [];
  }
}
```

```html
<script type="module" src="/src/main.js"></script>
```

注意：浏览器原生模块路径通常需要 `.js` 后缀；构建工具如 Vite 会处理 `.ts` 到 `.js` 的转换。

---

## 8. Git/GitHub 工作流

从第一天开始版本控制：

```bash
git init
git add .
git commit -m "Initial task manager app"
git branch -M main
git remote add origin <repo-url>
git push -u origin main
```

建议：

- 每次提交只完成一个清晰目标。
- 提交信息使用动词开头，例如 `Add task form`、`Persist tasks`。
- 忽略 `node_modules/`、`dist/`、环境变量文件。
- 使用 Pull Request 或 GitHub Issues 记录功能与 bug。

---

## 9. 验收标准

完成项目后，你应该能够：

- 解释应用的状态模型和数据流。
- 用 HTML/CSS 构建响应式、可访问页面。
- 用 JavaScript 处理事件、数组、对象和函数。
- 用 TypeScript 定义类型、接口、泛型。
- 用模块组织代码，避免所有逻辑堆在 `main.ts`。
- 正确处理异步请求失败。
- 使用 Git/GitHub 管理项目历史。

最终标准不是“代码能跑”，而是你能独立回答：

> 这个状态存在哪里？哪个函数修改它？修改后页面如何更新？失败时用户看到什么？