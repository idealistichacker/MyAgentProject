# React + Node.js 全栈应用构建：任务管理系统

## 0. 修订重点

原稿覆盖了主线，但需要加强：接口契约、错误处理、安全、数据库设计、异步数据流、部署细节与可测试性。本单元按 CS61A 风格强调：**抽象边界清晰、数据流可追踪、每个函数/组件/接口都有输入输出契约**。

---

## 1. 系统视角：从页面到数据流

目标项目：一个可部署的任务管理系统。

```text
React 表单
  ↓ POST /api/tasks + Authorization: Bearer token
Express 路由
  ↓ 校验输入、鉴权
数据库
  ↓ INSERT 返回新任务
React 更新本地状态
```

核心问题不是“页面能显示”，而是：

- 数据从哪里来？
- 谁可以修改数据？
- 请求失败时 UI 如何反馈？
- 数据库状态与前端状态是否一致？

---

## 2. React：组件、状态、表单与副作用

组件是 UI 抽象；状态是组件内部会变化的数据。

```jsx
function TaskForm({ onAdd }) {
  const [title, setTitle] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await onAdd(title);
      setTitle("");
    } catch (err) {
      alert("添加失败，请稍后重试");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="任务标题"
      />
      <button>添加</button>
    </form>
  );
}
```

Gotchas：

- `<input value={...}>` 是受控组件，必须用 `onChange` 更新状态。
- 列表渲染必须使用稳定 `key`，不要用数组下标作为唯一 key。
- `setState` 是异步批处理的，不要依赖立即更新后的状态。
- 如果通过 `useEffect` 请求 API，要处理依赖数组，避免无限请求。
- 生产环境不要把敏感信息写入前端代码或浏览器 localStorage；JWT 更安全的方式通常是 `httpOnly` cookie。

---

## 3. Express REST API：契约、状态码与错误处理

REST API 用资源、HTTP 方法和状态码表达操作：

| 操作 | 方法 | 路径 |
|---|---|---|
| 查询任务 | GET | `/api/tasks` |
| 创建任务 | POST | `/api/tasks` |
| 查询单个任务 | GET | `/api/tasks/:id` |
| 部分修改 | PATCH | `/api/tasks/:id` |
| 删除 | DELETE | `/api/tasks/:id` |

示例：

```js
app.post("/api/tasks", requireAuth, async (req, res, next) => {
  try {
    const { title } = req.body;

    if (typeof title !== "string" || title.trim() === "") {
      return res.status(400).json({ error: "title is required" });
    }

    const result = await pool.query(
      `INSERT INTO tasks (title, user_id)
       VALUES ($1, $2)
       RETURNING id, title, done, created_at`,
      [title.trim(), req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});
```

Gotchas：

- `GET` 不应产生副作用；`POST` 创建资源；`PATCH` 部分更新。
- 永远不要拼接用户输入生成 SQL，必须使用参数化查询。
- 后端要校验输入，不能信任前端。
- 统一错误处理中间件可以让 API 行为一致。
- 跨域请求需要正确配置 CORS；如果发送 cookie，还要设置 `credentials`。

---

## 4. 数据库：表、主键、外键与 CRUD

任务系统至少需要：

```text
users
- id: 主键
- email: 唯一
- password_hash: 哈希后的密码
- created_at

tasks
- id: 主键
- title
- done
- user_id: 外键，指向 users.id
- created_at
```

CRUD 对应：

```sql
INSERT INTO tasks (title, user_id) VALUES ($1, $2);
SELECT * FROM tasks WHERE user_id = $1;
UPDATE tasks SET done = $1 WHERE id = $2 AND user_id = $3;
DELETE FROM tasks WHERE id = $1 AND user_id = $2;
```

Gotchas：

- `user_id` 防止用户访问他人任务。
- `done` 使用布尔值，不要用字符串 `"true"` / `"false"`。
- 查询用户任务时，WHERE 条件必须同时检查 `id` 和 `user_id`。
- 对 `user_id`、`email` 等常用查询字段建立索引。
- 数据库结构变化应使用 migration，而不是手动改表。

---

## 5. 认证与授权：谁登录，谁能操作

认证回答“你是谁”；授权回答“你能做什么”。

密码必须使用 bcrypt/argon2 等慢哈希算法保存，不能明文保存，也不能使用普通 MD5/SHA。

JWT 中间件示例：

```js
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace(/^Bearer /, "");

  try {
    req.user = verifyToken(token); // 包含 user id
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
```

Gotchas：

- Token 应设置过期时间。
- 不要把密码或敏感信息放入 JWT。
- `localStorage` 存 token 易受 XSS 影响；生产环境优先考虑 `httpOnly` cookie。
- 登录失败不要透露是“邮箱不存在”还是“密码错误”。

---

## 6. 数据结构与算法：选择合适抽象

| 结构 | 用途 | 复杂度 |
|---|---|---|
| 数组 | 保存任务列表 | 按索引访问 O(1)，遍历 O(n) |
| Map | 按 id 快速查找任务 | 平均 O(1) |
| 栈 | 撤销、历史记录 | push/pop O(1) |
| 队列 | 后台任务、消息处理 | enqueue/dequeue O(1) |
| 排序 | 按时间/优先级排序 | 常见 O(n log n) |

例子：

```js
const doneTasks = tasks.filter((t) => t.done);          // O(n)
const sorted = [...tasks].sort((a, b) => a.id - b.id);  // O(n log n)
```

Gotchas：`Array.prototype.sort()` 会修改原数组，通常应先复制。

---

## 7. 项目交付与部署

推荐结构：

```text
my-app
├─ client/          # React/Vite
├─ server/          # Express API
├─ README.md
└─ package.json
```

必须包含：

1. 注册、登录、退出。
2. 任务 CRUD。
3. 后端数据库持久化。
4. 基础错误处理与输入校验。
5. API 文档，可用 README 或 OpenAPI。
6. 部署链接，例如 Vercel/Netlify + Render/Railway/Fly.io。

部署前检查：

- 使用环境变量保存 `DATABASE_URL`、`JWT_SECRET`、`CLIENT_ORIGIN`。
- 前端构建后只包含静态文件。
- 后端提供 `/health` 健康检查。
- 数据库迁移能自动运行。
- README 写清本地运行、测试、部署和已知限制。

最终目标：你不仅能“跑起来”一个全栈应用，还能解释每一步的数据流、安全边界、接口契约与复杂度。