# FuckColloge CLI 🎓

> **一个受 CS61A 启发的 AI Native 自适应计算机科学 (CS) 自学命令行工具。**

`FuckColloge` 旨在打破传统大学僵化、低效的课程体系，利用 AI 代理（FCAgent）根据你当下的知识基础、每周投入时间和偏好，量身定做学习计划。它不仅提供动态联网提炼的高质量课件，还提供支持多语言（TypeScript, Python, Bash）的本地沙盒测试，并配有贴心的 AI 助教为你进行代码和测试的深度诊断。

---

## ✨ 核心特性 (Key Features)

1. **个性化诊断与规划 (Diagnose & Plan)**：基于大模型分析你的编程底子、算法基础、**预计总学习时长（周）**及近期目标，生成量身定制的动态课程树（**单元数量可自适应扩展为 2 至 10 个单元**）。
2. **三阶段高质量课件生成 (3-Pass Learning Loop)**：动态联网检索最新规范（如 MDN、W3C 规范），进行 2-3 次内容重构提炼，保证生成兼具趣味性与专业度的讲义，拒绝大模型废话与 Markdown 格式污染。
3. **多语言执行器沙盒 (Polyglot Runner)**：底层解耦硬编码，基于调度器架构自动运行并验证不同语言的作业代码：
   - **原生本地支持**：TypeScript (`tsx`), Python (`unittest`), Bash (`shell`), Rust (`rustc`) 可直接在本地编译与断言。
   - **Piston 云端引擎支持**：对于 C++, Java, Go, Ruby, Swift 等数十种小众或主流语言，系统会自动生成测试断言代码并无缝投递至 Piston API 沙箱进行云端执行，**实现零本地依赖的万物皆可学**！
4. **交互式 AI 助教批改 (Assessment & TA Reviewer)**：不仅检测代码测试是否通过，还会自动收集并**支持数字/字母/括号多种格式归一化校验**选择题（Quiz）答案，由 AI TA 进行包含错因分类（Mistake Types）和语义诊断的全方位报告。
5. **动态复习与跳过机制 (Skip & Review)**：支持 `fc skip` 跳过太难的关卡，之后随时通过 `fc review` 重新挑战，让你保持顺畅的学习心流。

---

## 🛠️ 快速上手 (Quick Start)

> [!TIP]
> **重要提示**：我们为你编写了一份极其详细的 **[从零上手与 CLI 命令指南 (GETTING_STARTED.md)](file:///y:/MyAgentProject/GETTING_STARTED.md)**！
> 该文件包含了如何全局链接正式版命令 `fc`、AI 导师目标追问机制（Grilling Mode）、以及全部 CLI 子命令的详细参数手册。强烈建议优先阅读它！✨

确保你的本地环境已安装 [Node.js (v18+)](https://nodejs.org/)。

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化配置 (配置 AI 密钥)

```bash
npm run dev -- init --api-key "你的API_KEY" --base-url "接口BaseURL" --model "模型名称"
```

### 3. 开始诊断与规划

```bash
# 启动交互式画像诊断
npm run dev -- diagnose

# 生成个性化学习规划大纲
npm run dev -- plan
```

### 4. 学习与提交

```bash
# 开启当前学习单元，生成讲义与代码模板
npm run dev -- start

# (在本地编写 solution 文件，阅读 lesson)

# 提交作业（将自动运行本地测试、回答 Quiz 并获得 AI TA 深度诊断）
npm run dev -- submit

# 通过后，解锁并进入下一关
npm run dev -- next
```

---

## 📅 当前版本状态 (Current Status)

* **当前版本**: `v0.2.0 (Pre-release)`
* **当前状态**:
  - 多语言 Runner 沙盒框架、3-Pass LLM 联网检索与 AI 助教评估的骨架已开发完成。
  - 本地状态持久化存储工作正常。
  - 当前由于大模型生成用例和环境差异，部分复杂全栈单元的交互尚处在打磨阶段。欢迎向 GitHub 提交 Issue 或参与共建！

---

## ⚠️ 敏感文件提交防范安全提示 (Git Security Warnings)

当你准备将代码提交到 GitHub 仓库时，**请务必注意保护好你的个人敏感资产和 API 凭证**！

### 1. 绝对不要提交的文件 (DO NOT Commit)

* **❌ `.fuckcolloge/config.json`**
  - **重要原因**：该文件包含你初始化时输入的**大模型 API Key (`apiKey`)**！一旦上传到 GitHub 公开仓库，你的 API Key 将被全网爬虫瞬间抓取导致扣费或滥用。
* **❌ `.env` & `.env.*` 文件**
  - 如果你在项目里配置了任何环境变量配置文件，切记不要提交。
* **❌ `node_modules/` & `dist/`**
  - 标准依赖和编译输出文件夹，应保持干净。

> [!TIP]
> **关于 `.fuckcolloge/` 其他文件**：
> 包含你的专属课件讲义 (`lessons/`)、你完成的代码练习 (`exercises/`)、个性化计划大纲 (`plan.json`) 以及诊断记录 (`state.json` 和 `learner.json`)。这些文件已经去除了敏感 key，可以安全地推送到 GitHub 方便你进行进度同步或课后分析！

### 2. 检查你的 Git 忽略状态

我们已经在项目的 `.gitignore` 中为你配置了以下规则：

```gitignore
node_modules
dist
.DS_Store
.cmd.txt
.env
.env.*
.fuckcolloge/config.json
```

你可以通过在命令行运行 `git status` 来确保上述敏感文件处于 **Untracked/Ignored** 状态，防止被错误提交。
