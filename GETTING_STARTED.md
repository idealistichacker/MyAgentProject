# 🎓 FuckColloge 从零上手与 CLI 命令指南 (Getting Started)

嗨！我是你的天才 AI 少女导师~ ✨ 欢迎来到 `FuckColloge`！这是一个完全由 AI 原生驱动的计算机科学 (CS) 自适应自学系统。

无论是想挑战经典的 DSA（数据结构与算法），还是探索各种编程语言（Go, Python, TypeScript 等），本指南都将手把手带你**从零开始**通关这个项目！

---

## 🛠️ 第一部分：新手村通关指南 (Step-by-Step)

为了在 Windows 11 环境下获得最流畅的体验，我们建议全程使用 **PowerShell**。让我们现在开始吧！

### Step 1: 确保本地环境就绪
你需要在本地安装 **Node.js (v18+)**。可以在控制台输入以下命令进行验证：
```powershell
node -v
npm -v
```

### Step 2: 安装项目依赖
克隆或进入项目目录 `y:\MyAgentProject` 后，安装开发和运行所需的 node 包：
```powershell
npm install
```

### Step 3: 挂载正式版 `fc` 命令到系统全局 (推荐)
为了在任何地方都可以直接输入高大上的 `fc` 命令，我们需要利用 npm 的 link 机制：
1. **编译项目源码**：
   ```powershell
   npm run build
   ```
2. **创建全局软链接**：
   ```powershell
   npm link
   ```
   > [!NOTE]
   > npm 官方设计中，`npm link` 会读取 `package.json` 中的 `bin` 字段（这里定义了 `"fc": "dist/cli.js"`），并在 Windows 全局路径下创建 `fc` 快捷方式。如果提示权限不足，请以**管理员身份**运行 PowerShell 再次执行。

3. **测试正式版命令**：
   ```powershell
   fc --help
   ```
   *💡 如果你不想使用全局命令，或者权限受限，你也可以使用开发版命令替代。比如用 `npm run dev -- <command>`（例如 `npm run dev -- --help`）来运行后续步骤！*

### Step 4: 初始化 AI 大模型与搜索引擎
运行初始化配置命令，配置你的大模型 API 密钥。这里以兼容 OpenAI 的接口为例（比如 SiliconFlow 平台）：
```powershell
fc init
```
**交互式引导中你将遇到以下选择**：
* **选择搜索引擎**：系统会提示你选择 `wikipedia`（免费自带）或 `tavily`（需要 API Key）。
* **配置参数**：如果不想走交互流程，也可以直接用选项一步到位：
  ```powershell
  fc init --api-key "your_siliconflow_api_key" --base-url "https://api.siliconflow.cn/v1" --model "deepseek-ai/DeepSeek-V4-Pro" --search-provider "wikipedia"
  ```

### Step 5: 启动画像诊断 (目标细化雷达)
准备开始学习！我们先通过 AI 导师进行学习画像的诊断：
```powershell
fc diagnose
```
> [!IMPORTANT]
> **导师 grilling 模式**：如果你输入的学习目标太宏大（如 `想学习Go语言`），AI 导师会启动 3~5 轮的犀利对话追问，逼迫你细化核心痛点与背景，最终为你量身生成一个极具实战性的精准目标！

### Step 6: 制定大纲计划
画像生成后，调用 FCAgent 编排最符合你的个性化学习路线图：
```powershell
fc plan
```
运行完成后，你将看到一个精心编排的**课程树**（可能包含数个基础讲义单元以及大型实战 Project 🚀）。

### Step 7: 开启第一关并学习讲义
正式开课啦！输入以下命令解锁你的第一关：
```powershell
fc start
```
执行后，系统会在本地生成两个文件：
1. **讲义文件**：`.fuckcolloge/lessons/unit-xxx.md` (你可以用 VS Code 打开直接阅读，或者在命令行输入 `fc lesson` 在控制台查看)。
2. **练习代码文件**：`.fuckcolloge/exercises/unit-xxx/solution.ts` (或者是其他语言的后缀，包含初始代码骨架)。

### Step 8: 编写代码、答题与提交评估
根据讲义里的要求，修改并完成 `.fuckcolloge/exercises/` 下的练习代码。写完后，在控制台运行提交命令：
```powershell
fc submit
```
* **前置 Quiz 考核**：提交后，系统会弹出 2-3 道跟讲义相关的选择题或填空题，你需要全部答对才会解锁代码自动测试！
* **多维评估**：如果通过了 Quiz，系统会利用沙盒运行本地断言，并生成一份由 AI 助教亲笔撰写的深度诊断，包括得分、错因分类、复杂度分析和修改建议。

### Step 9: 晋级下一关
评估通过后，直接输入以下命令解锁下一关：
```powershell
fc next
```
开启你的下一轮循环（再次 `fc start`）吧！如果本关实在卡住了，也可以任性地通过 `fc skip` 跳关，之后随时使用 `fc review` 查看你曾经跳过的内容。

---

## 📋 第二部分：全部 CLI 命令参考手册 (CLI Reference)

所有的指令都支持在两种模式下运行：
* **开发模式**：`npm run dev -- <command> [options]`
* **正式模式**：`fc <command> [options]` (或 `node dist/cli.js <command> [options]`)

### 1. `init` — 初始化配置
* **描述**：设置 API URL、大模型密钥及搜索引擎。
* **参数选项**：
  * `--base-url <url>`：兼容 OpenAI 的 API 请求基底地址。
  * `--model <model>`：推理与评估选用的大模型名称。
  * `--api-key <key>`：API Key。
  * `--search-provider <provider>`：设置搜索引擎类型，可选 `wikipedia` \| `tavily`。
  * `--tavily-api-key <key>`：Tavily 搜索引擎专属 API Key。

### 2. `config` — 查看配置信息
* **描述**：打印出当前环境的大模型接口设置与状态。

### 3. `diagnose` — 画像诊断
* **描述**：通过命令行选项或导师 grill 追问，确立学习者的实际编程底子、每周可用时间及节奏偏好。
* **参数选项**：
  * `--target <text>`：设定学习目标（如 `想用 Go 开发高并发 Web`）。
  * `--programming-level <level>`：当前编程水平（`zero` \| `basic` \| `small-projects` \| `comfortable`）。
  * `--dsa-level <level>`：DSA 水平（`none` \| `heard` \| `some-practice` \| `systematic`）。
  * `--weekly-hours <hours>`：每周计划投入时间（`<2` \| `2-5` \| `5-10` \| `10+`）。
  * `--total-weeks <weeks>`：预计总周数（`1-4` \| `5-8` \| `9-12` \| `12+`）。
  * `--learning-style <style>`：学习偏好（`explain-first` \| `example-first` \| `practice-first` \| `project-first`）。
  * `--code-practice <value>`：做题意愿（`yes` \| `sometimes` \| `no`）。
  * `--pace <pace>`：节奏（`fast` \| `normal` \| `steady`）。
  * `--goal <text>`：近期里程碑。

### 4. `plan` — 生成定制大纲计划
* **描述**：为当前用户画像生成动态学习计划路线图，确定包含的单元和类型。

### 5. `start [unitId]` — 解锁或拉取指定单元
* **描述**：加载指定单元。若该单元为首次加载，将从网上爬取最新的标准规范（如 MDN、W3C 规范），并在后台重构 2-3 次自动生成专属课件与测试用例文件。
* **参数**：
  * `[unitId]`（可选）：传入特定单元 ID (例如 `go-concurrency-basics`) 可强制跳转。

### 6. `lesson [unitId]` — 终端阅览讲义
* **描述**：以终端 Markdown 的排版形式输出当前或指定单元的课件内容。

### 7. `submit [unitId]` — 提交评测
* **描述**：输入答案并通过小测验（Quiz），触发本地 Runner 沙盒运行测试用例，并拉取 AI 助教返回的诊断细节。
* **参数选项**：
  * `--quiz <answers>`：直接从命令行传递测验答案（例如 `--quiz="q1=C,q2=O(log n)"`）。若未指定，系统会自动启动交互式输入。

### 8. `assess` — 获取最新评估详情
* **描述**：再次输出最近一次提交的评估日志，不用重新跑测试。

### 9. `next` — 通关晋级
* **描述**：判断当前单元是否已通过（Passed），通过后将计划索引前进一位，切换至下一个单元。

### 10. `skip` — 逃课跳关
* **描述**：当关卡难度太大或暂时想先往后学时，将当前单元打上“Skipped”标记并记录至逃课账本，直接解锁并跳转至下一单元。

### 11. `review` — 查看逃课账本
* **描述**：列出所有被跳过的单元列表，便于后期查漏补缺和重新发起挑战。

### 12. `status` — 仪表盘看板
* **描述**：输出包含百分比、进度条、当前章节和通过率等多维度的命令行自学看板。

### 13. `generate-all` — 全量课件生成
* **描述**：在离线或弱网前，提前一次性批量生成大纲内所有的讲义和代码骨架，并存放在 `.fuckcolloge/` 对应目录下。

---

## ❓ 常见问题 FAQ

#### Q1: Windows 11 PowerShell 提示“因为在此系统上禁止运行脚本，无法加载文件...”？
这是 Windows 的默认执行策略限制。你可以用**管理员身份**打开 PowerShell 并运行以下命令：
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### Q2: 如何重新诊断和制定计划？
如果你学完了一门课，或者想换个方向，只需依次运行 `fc diagnose` 和 `fc plan`。它会根据新的选择覆盖旧 of 的计划大纲。如果你想连同以往的通关状态和做过的题一并清空，可以直接手动删掉项目中的 `.fuckcolloge/` 隐藏文件夹。

#### Q3: 运行 `fc submit` 提示 "有前置知识测试未通过"？
这是因为我们的讲义中包含重点提炼的小测验，如果你没有正确理解讲义，直接强行提交是不行哒！请回到 `.fuckcolloge/lessons/` 下仔细阅读你的专属讲义，找出关键点，然后在交互界面中选择正确答案。
