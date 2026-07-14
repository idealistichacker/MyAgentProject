# FC Agent CLI 🎓

> **一个受 CS61A 启发的 AI Native 自适应计算机科学 (CS) 自学命令行工具。**

`FCAgent` 旨在打破传统大学僵化、低效的课程体系，利用 AI 代理（FCAgent）根据你当下的知识基础、每周投入时间和偏好，量身定做学习计划。它不仅提供动态联网提炼的高质量课件、练习和 CS61A 风格 Project 规格，还提供支持多语言（TypeScript, Python, Bash, Rust）的本地沙盒测试，并配有贴心的 AI 助教为你进行代码和测试的深度诊断。

---

## ✨ 核心特性 (Key Features)

1. **个性化诊断与知识目标图 (Diagnose, Plan & Objective Graph)**：基于大模型分析你的编程底子、算法基础、**预计总学习时长（周）**及近期目标，生成 2 至 10 个单元的动态课程树。每个后续单元通过 `prerequisiteObjectiveIds` 引用前置单元的精确目标，禁止未知或前向引用；中后期 Project 必须综合至少两个前置单元，并在里程碑中实际使用声明的前置目标。
2. **质量驱动课件生成 (Risk-Adaptive Learning Loop)**：动态联网检索资料后先生成 Draft，并用确定性规则评估长度、目标覆盖、结构、示例、边界和误区。只有高置信草稿才跳过 Critique；存在风险时仍执行深度提炼，最后统一进入结构化 Polish、Zod 校验、内容质量闸门和按错误类型执行的有界局部修复。Project 单元还会额外生成 `ProjectSpec`，落盘为 `PROJECT.md`，包含里程碑、交付物、文件清单和 rubric。
3. **多语言执行器沙盒 (Polyglot Runner)**：底层解耦硬编码，基于调度器架构自动运行并验证不同语言的作业代码：
   - **原生本地支持**：TypeScript (`tsx`), Python (`unittest`), Bash (`shell`), Rust (`rustc`) 可直接在本地编译与断言。
   - **Piston 云端引擎支持**：对于 C++, Java, Go, Ruby, Swift 等数十种小众或主流语言，系统会自动生成测试断言代码并无缝投递至 Piston API 沙箱进行云端执行，**实现零本地依赖的万物皆可学**！
4. **版本化缓存与可信来源包 (Versioned Cache & Source Pack)**：缓存键包含模型、提示词版本、schema 与来源策略版本；来源会重新校验、清洗提示注入、规范化 URL、去重并按可信度与相关性排序。检索使用 24 小时新鲜缓存与 30 天应急缓存，提供方短暂故障时会明确标记并复用已验证旧包；`stale` 状态会随课程持久化并由 `fc audit` 告警，发布 manifest 同时记录来源 URL、hash 与策略版本。同一并发请求仍通过 single-flight 合并。
5. **交互式 AI 助教批改 (Assessment & TA Reviewer)**：不仅检测代码测试是否通过，还会自动收集并**支持数字/字母/括号多种格式归一化校验**选择题（Quiz）答案。大模型扮演极具共情力与专业度的 AI TA，提供多阶段渐进式 Hints（根据尝试次数提供概念指引、方向锁定、或伪代码提示）以及有温度的诊断反馈。
6. **自适应补救路线 (Adaptive Remediation)**：当同一单元连续失败到第 2 次时，系统会根据失败测试、Quiz 错题和诊断结果生成一个短小的 `remediation` 补救单元，自动插回学习计划；通关补救单元后会通过 `nextIfPassed` 路由回原单元重新挑战。
7. **课程质量审计 (Curriculum Audit)**：提供 `fc audit` 本地质量闸门，扫描当前计划里的讲义、Quiz、练习测试、ProjectSpec、Remediation 路由和 fallback 标记，输出质量分与可操作问题清单，也支持 `--json` 接入脚本。
8. **弹性跳过与复习机制 (Skip & Review)**：支持 `fc skip` 跳过太难的关卡（在 submit 连续失败 5 次时系统亦会自动发出友好跳过提示），之后随时通过 `fc review` 唤起复习面板重新挑战，让你保持顺畅的学习心流。
9. **可恢复安全发布 (Generation Jobs & Atomic Publish)**：
   - **质量门**：课程大纲、单元、测验和评估反馈均经结构化工具调用与 schema 校验；正式单元还必须有来源包、目标覆盖、三类测试和通过实跑的参考解答。引用中的关键事实声明必须逐字出现在 lesson，并由一个 primary 来源或两个独立发布者支撑。选择题至少三个唯一且有差异的选项，禁止泛化干扰项；每个错误选项必须绑定独立 misconception 和纠正反馈，同时覆盖真实 objective。失败会写入质量报告并禁止发布。
   - **可恢复性与指标**：每次生成记录 durable job、阶段 checkpoint 与 artifact manifest；CLI 启动时扫描未完成发布，hash 与计划 revision 全匹配时可安全完成，已知部分写入可回滚，未知修改拒绝自动覆盖。失败不会以占位课发布，可用 generation status/retry/recover 恢复，并通过 generation metrics 查看 p50/p95、重试、token、缓存复用与 Critique 跳过次数。
   - **学习者保护**：发布使用原子写入和单写者锁；已有 solution 文件默认永不覆盖，生成器另写 starter 文件。只有显式 reset-solution 才会替换答案。

---

## 🛠️ 快速上手 (Quick Start)

> [!TIP]
> **相关文档链接**：
>
> - 📄 **[从零上手与 CLI 命令指南 (GETTING_STARTED.md)](file:///y:/MyAgentProject/GETTING_STARTED.md)**：包含正式版 `fc` 命令链接、诊断追问模式、以及最全的参数手册。
> - 🧠 **[FCAgent 功能全景与技术实现细节 (fcagent_features_detail.md)](file:///y:/MyAgentProject/fcagent_features_detail.md)**：关于大模型诊断、大纲生成、质量驱动课件渲染及多语言 Runner 的技术原理深度剖析文档。✨
> - 🧰 **[生成故障与真实验收记录 (问题记录.md)](file:///y:/MyAgentProject/问题记录.md)**：记录 Pass 3 超时、局部质量修复、引用核验、Python runner 缺陷及 DeepSeek V4 Pro 真实回归结果。
> - 🧭 **[课程生成优化重构建议 (课程生成优化重构建议.md)](file:///y:/MyAgentProject/课程生成优化重构建议.md)**：当前架构状态、已完成项、剩余风险和后续优先级。

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

# 限制提供方请求速率；连续 3 次临时错误后熔断剩余队列
npm run dev -- generate-all --requests-per-minute 30 --failure-threshold 3

# 查看或重试未发布的生成作业；重试会复用输入未变化的已完成阶段
npm run dev -- generation status <jobId>
npm run dev -- generation retry <jobId>
npm run dev -- generation recover
npm run dev -- generation metrics --json

# 【可选】审计当前计划/讲义/练习/Project 的质量
npm run dev -- audit

# 离线、确定性的分层回归
npm run test:unit
npm run test:integration
npm run test:golden

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
  - 多语言 Runner 沙盒框架、质量驱动 LLM 联网生成与 AI 助教评估的骨架已开发完成。
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
