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
4. **版本化缓存与请求合并 (Versioned Cache)**：缓存键包含模型、提示词版本与 schema 版本；磁盘缓存原子写入、损坏隔离，并对同一并发检索请求执行 single-flight 合并，避免重复消耗模型额度。
5. **交互式 AI 助教批改 (Assessment & TA Reviewer)**：不仅检测代码测试是否通过，还会自动收集并**支持数字/字母/括号多种格式归一化校验**选择题（Quiz）答案。大模型扮演极具共情力与专业度的 AI TA，提供多阶段渐进式 Hints（根据尝试次数提供概念指引、方向锁定、或伪代码提示）以及有温度的诊断反馈。
6. **自适应补救路线 (Adaptive Remediation)**：当同一单元连续失败到第 2 次时，系统会根据失败测试、Quiz 错题和诊断结果生成一个短小的 `remediation` 补救单元，自动插回学习计划；通关补救单元后会通过 `nextIfPassed` 路由回原单元重新挑战。
7. **课程质量审计 (Curriculum Audit)**：提供 `fc audit` 本地质量闸门，扫描当前计划里的讲义、Quiz、练习测试、ProjectSpec、Remediation 路由和 fallback 标记，输出质量分与可操作问题清单，也支持 `--json` 接入脚本。
8. **弹性跳过与复习机制 (Skip & Review)**：支持 `fc skip` 跳过太难的关卡（在 submit 连续失败 5 次时系统亦会自动发出友好跳过提示），之后随时通过 `fc review` 唤起复习面板重新挑战，让你保持顺畅的学习心流。
9. **可恢复安全发布 (Generation Jobs & Atomic Publish)**：
   - **质量门**：课程大纲、单元、测验和评估反馈均经结构化工具调用与 schema 校验；正式单元还必须有来源包、目标覆盖、三类测试和通过实跑的参考解答。
   - **可恢复性**：每次生成记录 durable job 与 artifact manifest；失败不会以占位课发布，可用 generation status 查看并用 generation retry 恢复。
   - **学习者保护**：发布使用原子写入和单写者锁；已有 solution 文件默认永不覆盖，生成器另写 starter 文件。只有显式 reset-solution 才会替换答案。

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
```

### 4. 学习、提交与跳过

```bash
# 开启当前学习单元，生成讲义与代码模板
npm run dev -- start

# 【可选】一键并发离线生成大纲中所有单元的讲义与代码骨架以供预览
npm run dev -- generate-all

# 【可选】提高预生成吞吐：最多允许 4 个并发，按启动间隔做限流
npm run dev -- generate-all --concurrency 2 --stagger-ms 1500

# 查看或重试未发布的生成作业
npm run dev -- generation status <jobId>
npm run dev -- generation retry <jobId>

# 【可选】审计当前计划/讲义/练习/Project 的质量
npm run dev -- audit

# (在本地编写 solution 文件，阅读 lesson；Project 单元还会生成 PROJECT.md)

# 提交作业（将自动运行本地测试、回答 Quiz 并获得 AI TA 渐进式启发诊断）
npm run dev -- submit

# 【可选】主动跳过当前死磕的单元（尝试失败 5 次后，系统也会引导你跳过）
npm run dev -- skip

# 【可选】调出复习面板，重新挑战曾经跳过并保留进度的关卡
npm run dev -- review

# 通过后，解锁并进入下一关
npm run dev -- next
```

---

## 📅 当前版本状态 (Current Status)

* **当前版本**: `v0.2.0 (Pre-release)`
* **当前状态**:
  - 多语言 Runner 沙盒框架、3-Pass LLM 联网检索与 AI 助教评估的骨架已开发完成。
  - 课程、练习与 Project 生成已加入结构化校验、质量闸门、自动修复、计划缓存和本地 Runner 优先路由。
  - 提交失败后可自动生成 micro-remediation 补救单元，并通过 `nextIfPassed` 回到原关卡。
  - `fc audit` 可本地审计课程质量、路由完整性、练习测试覆盖和 Project/Remediation 结构。
  - 默认离线种子路线包含一个 DSA capstone Project，可在无 API key 时体验项目式学习闭环。
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
> 包含你的专属课件讲义 (`lessons/`)、你完成的代码练习和 Project 规格 (`exercises/`)、个性化计划大纲 (`plan.json`) 以及诊断记录 (`state.json` 和 `learner.json`)。这些文件已经去除了敏感 key，可以安全地推送到 GitHub 方便你进行进度同步或课后分析！

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
```

你可以通过在命令行运行 `git status` 来确保上述敏感文件处于 **Untracked/Ignored** 状态，防止被错误提交。
