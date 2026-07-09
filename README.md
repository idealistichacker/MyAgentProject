# FC Agent CLI 🎓

> **一个受 CS61A 启发的 AI Native 自适应计算机科学 (CS) 自学命令行工具。**

`FCAgent` 旨在打破传统大学僵化、低效的课程体系，利用 AI 代理（FCAgent）根据你当下的知识基础、每周投入时间和偏好，量身定做学习计划。它不仅提供动态联网提炼的高质量课件、练习和 CS61A 风格 Project 规格，还提供支持多语言（TypeScript, Python, Bash, Rust）的本地沙盒测试，并配有贴心的 AI 助教为你进行代码和测试的深度诊断。

---

## ✨ 核心特性 (Key Features)

1. **个性化诊断与规划 (Diagnose & Plan)**：基于大模型分析你的编程底子、算法基础、**预计总学习时长（周）**及近期目标，生成量身定制的动态课程树（**单元数量可自适应扩展为 2 至 10 个单元**），并在中后期自动混入 **Project 大型项目实战关卡**（类似 CS61A Ants / Scheme 解释器）。
2. **三阶段高质量课件生成 (3-Pass Learning Loop)**：动态联网检索最新规范（支持 **Wikipedia 免费检索** 与 **Tavily 全网精准 API 检索**），进行 3 次内容重构提炼（Draft -> Critique -> Polish）。最终输出会经过结构化 JSON 元数据解析、Zod 校验、内容质量闸门和一次自动修复，减少 Markdown 污染、坏 JSON、空洞练习和占位降级；Project 单元还会额外生成 `ProjectSpec`，落盘为 `PROJECT.md`，包含里程碑、交付物、文件清单和 rubric。
3. **多语言执行器沙盒 (Polyglot Runner)**：底层解耦硬编码，基于调度器架构自动运行并验证不同语言的作业代码：
   - **原生本地支持**：TypeScript (`tsx`), Python (`unittest`), Bash (`shell`), Rust (`rustc`) 可直接在本地编译与断言。
   - **Piston 云端引擎支持**：对于 C++, Java, Go, Ruby, Swift 等数十种小众或主流语言，系统会自动生成测试断言代码并无缝投递至 Piston API 沙箱进行云端执行，**实现零本地依赖的万物皆可学**！
4. **高性能 L2 分层缓存系统 (Layered L2 Cache)**：针对 LLM 响应慢、易超时及重复检索消耗额度问题，构建了基于 SHA-256 哈希的内存（L1）与磁盘文件（L2）分层缓存系统。对于已发起的网络搜索、相同 Prompt 参数的大模型生成以及相同画像的课程规划，实现 `1ms` 级闪电命中（Cache HIT），节省高达 60% 的 API 费用并彻底解决控制台卡顿。
5. **交互式 AI 助教批改 (Assessment & TA Reviewer)**：不仅检测代码测试是否通过，还会自动收集并**支持数字/字母/括号多种格式归一化校验**选择题（Quiz）答案。大模型扮演极具共情力与专业度的 AI TA，提供多阶段渐进式 Hints（根据尝试次数提供概念指引、方向锁定、或伪代码提示）以及有温度的诊断反馈。
6. **自适应补救路线 (Adaptive Remediation)**：当同一单元连续失败到第 2 次时，系统会根据失败测试、Quiz 错题和诊断结果生成一个短小的 `remediation` 补救单元，自动插回学习计划；通关补救单元后会通过 `nextIfPassed` 路由回原单元重新挑战。
7. **课程质量审计 (Curriculum Audit)**：提供 `fc audit` 本地质量闸门，扫描当前计划里的讲义、Quiz、练习测试、ProjectSpec、Remediation 路由和 fallback 标记，输出质量分与可操作问题清单，也支持 `--json` 接入脚本。
8. **弹性跳过与复习机制 (Skip & Review)**：支持 `fc skip` 跳过太难的关卡（在 submit 连续失败 5 次时系统亦会自动发出友好跳过提示），之后随时通过 `fc review` 唤起复习面板重新挑战，让你保持顺畅的学习心流。
9. **控频并发预生成与自适应重试 (Generate All & Auto-Retry)**：
   - **抗 Rate Limit 流控**：支持一键离线预生成命令 `fc generate-all`，底层集成自定义 `pLimit` 并发调度器与可配置启动间隔（默认并发度 `1`、间隔 `1000ms`），既能稳健避开模型提供商连接限流，也能在额度更高时通过参数提速。
   - **断点续传与弹性恢复**：网络或 API 超时导致单个单元降级为占位符时，系统不会锁死状态。重新执行 `generate-all` 或 `start` 时，CLI 会自动扫描并**仅重新触发生成失败的单元**，实现无缝断点续传。
10. **学习掌握度报告与重规划 (Mastery & Replan)**：支持 `fc mastery` 命令输出学习状态、掌握度统计、弱项技能与建议。并提供 `fc plan --replan` 基于当前真实掌握度重新规划剩余课程。
11. **仓库卫生与安全审计 (Repo Hygiene)**：提供 `fc doctor` 命令检测你的 `.gitignore` 配置，防止敏感信息或缓存文件泄露。

---

## 🛠️ 快速上手 (Quick Start)

> [!TIP]
> **相关文档链接**：
>
> - 📄 **[从零上手与 CLI 命令指南 (GETTING_STARTED.md)](file:///y:/MyAgentProject/GETTING_STARTED.md)**：包含正式版 `fc` 命令链接、诊断追问模式、以及最全的参数手册。
> - 🧠 **[FCAgent 功能全景与技术实现细节 (fcagent_features_detail.md)](file:///y:/MyAgentProject/fcagent_features_detail.md)**：关于大模型诊断、大纲生成、三阶段课件渲染及多语言 Runner 的技术原理深度剖析文档。✨

确保你的本地环境已安装 [Node.js (v18+)](https://nodejs.org/)。

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化配置 (配置 AI 密钥与检索源)

```bash
# 初始化大模型配置（默认使用 wikipedia 免费检索）
npm run dev -- init --api-key "你的API_KEY" --base-url "接口BaseURL" --model "模型名称"

# （可选）配置使用 Tavily API 进行更精准的全网开发者文档检索
npm run dev -- init --api-key "你的API_KEY" --base-url "接口BaseURL" --model "模型名称" --search-provider "tavily" --tavily-api-key "你的TAVILY_KEY"
```


---

## 🛠️ 快速上手 (Quick Start)

> [!TIP]
> **相关文档链接**：
>
> - 📄 **[从零上手与 CLI 命令指南 (GETTING_STARTED.md)](file:///y:/MyAgentProject/GETTING_STARTED.md)**：包含正式版 `fc` 命令链接、诊断追问模式、以及最全的参数手册。
> - 🧠 **[FCAgent 功能全景与技术实现细节 (fcagent_features_detail.md)](file:///y:/MyAgentProject/fcagent_features_detail.md)**：关于大模型诊断、大纲生成、三阶段课件渲染及多语言 Runner 的技术原理深度剖析文档。✨

确保你的本地环境已安装 [Node.js (v18+)](https://nodejs.org/)。

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化配置 (配置 AI 密钥与检索源)

```bash
# 初始化大模型配置（默认使用 wikipedia 免费检索）
npm run dev -- init --api-key "你的API_KEY" --base-url "接口BaseURL" --model "模型名称"

# （可选）配置使用 Tavily API 进行更精准的全网开发者文档检索
npm run dev -- init --api-key "你的API_KEY" --base-url "接口BaseURL" --model "模型名称" --search-provider "tavily" --tavily-api-key "你的TAVILY_KEY"
```

### 3. 开始诊断与规划

```bash
# 启动交互式画像诊断（模糊目标将触发 3-5 轮追问细化）
npm run dev -- diagnose

# 生成个性化学习规划大纲（中后期自动加入实战 Project 大作业）
npm run dev -- plan

# 基于当前掌握度报告，重构剩余学习规划
npm run dev -- plan --replan
```

### 4. 学习、提交与跳过

```bash
# 开启当前学习单元，生成讲义与代码模板
npm run dev -- start

# 【可选】一键并发离线生成大纲中所有单元的讲义与代码骨架以供预览
npm run dev -- generate-all

# 【可选】提高预生成吞吐：最多允许 4 个并发，按启动间隔做限流
npm run dev -- generate-all --concurrency 2 --stagger-ms 1500

# 【可选】审计当前计划/讲义/练习/Project 的质量
npm run dev -- audit

# 查看当前学习掌握度报告
npm run dev -- mastery

# 运行仓库环境诊断
npm run dev -- doctor

# (在本地编写 solution 文件，阅读 lesson；Project 单元还会生成 PROJECT.md)
```

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
> **关于 `.fuckcolloge/` 文件夹**：
> 默认配置下，`.fuckcolloge/config.json` (含 API Key)、`.fuckcolloge/cache/` (大体积生成缓存)、`.fuckcolloge/state.json` 和 `learner.json` (个人学习进度) 以及生成的课件与练习文件都不会被提交。只建议同步 `plan.json` 或项目级配置文件。

### 2. 检查你的 Git 忽略状态

我们已经在项目的 `.gitignore` 中为你配置了以下规则：

```gitignore
node_modules
dist
tests/cmd.txt
.DS_Store
.cmd.txt
.env
.env.*
.fuckcolloge/config.json
.fuckcolloge/cache/
.fuckcolloge/state.json
.fuckcolloge/learner.json
.fuckcolloge/lessons/
.fuckcolloge/exercises/
```

你可以通过在命令行运行 `git status` 来确保上述敏感文件处于 **Untracked/Ignored** 状态，防止被错误提交。
