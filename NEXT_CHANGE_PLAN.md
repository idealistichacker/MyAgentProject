# FCAgent 后续改动计划

本文档记录在 `codex-course-generation-optimization` 分支之后，我建议继续推进的改动。目标不是盲目加功能，而是让 FCAgent 更接近一个真正可靠的 SWE/CS 自学代理：能规划、能生成、能验证质量、能根据学习反馈调整路径，并且速度更快、失败更少。

## 当前基线

- 已有三阶段课程内容生成：Draft -> Critique -> Polish。
- 已有结构化 JSON 解析、Zod 校验、自动修复、LLM/Search 分层缓存。
- 已有 ProjectSpec、remediation 补救单元、`fc audit` 质量审计。
- 已新增 `src/curriculum/mastery.ts`，但目前只提供纯函数模型，尚未接入 CLI 和文档。
- 工作区中 `.fuckcolloge/` 仍包含本地生成内容和学习进度改动，后续代码提交应继续避免误提交这些运行数据。

## 改动原则

1. 每次改动都应该能独立验证、独立提交。
2. 优先把生成质量变成可观测指标，再继续扩大生成能力。
3. 生成链路要逐步拆小，减少 `pipeline.ts` 的职责堆叠。
4. 面向本地可用性优化：失败可恢复、缓存可解释、命令可重复运行。
5. 文档与 CLI 行为同步更新，避免功能存在但用户不知道怎么用。

## Phase 1：接入学习掌握度报告

目标：把已新增的 mastery 纯函数变成用户可直接使用的命令。

计划改动：

- 在 `src/cli.ts` 新增 `fc mastery` 命令。
- 支持 `--json` 输出，方便脚本或后续 UI 消费。
- 支持 `--top <n>` 展示最需要练习的技能。
- 支持 `--units` 展示每个单元的掌握度、尝试次数和最近一次评估结果。
- 更新 `README.md`、`GETTING_STARTED.md`、`fcagent_features_detail.md`、`roadmap.md`、`history_improvements.md`。

验收标准：

- `fc mastery --help` 可用。
- 没有学习状态时能输出合理的 `not-started` 报告。
- 有 assessment/state 时能正确展示 weak skills、已完成单元、跳过单元和下一步建议。
- `tsc --noEmit` 通过。

## Phase 2：拆分生成流水线，降低 pipeline.ts 复杂度

目标：让课程生成、解析、修复、质量校验、fallback 各自有清晰边界，方便继续提升质量。

计划改动：

- 新增 `src/agents/unitGeneration.ts`：负责 unit content 的高层编排。
- 新增 `src/agents/generatedUnitParser.ts`：负责 JSON/CONTENT/STARTER_CODE/TEST_CODE 分段解析。
- 新增 `src/agents/generatedUnitQuality.ts`：负责内容、Quiz、Exercise、ProjectSpec 质量闸门。
- 新增 `src/agents/fallbacks.ts`：集中管理 fallback lesson、fallback exercise、fallback project。
- `src/agents/pipeline.ts` 保留 learner diagnosis、plan generation、assessment、routing 等核心流程。

验收标准：

- 行为不变，现有 CLI 命令仍能运行。
- 新模块有纯函数边界，后续可以单独测试。
- `pipeline.ts` 行数和职责明显下降。
- `tsc --noEmit` 通过。

## Phase 3：建立生成质量回归测试

目标：让“课程内容和练习质量更高”不只靠感觉，而是有可重复的本地测试。

计划改动：

- 为 `auditLearningPlan` 增加样例计划测试。
- 为 generated unit parser 增加坏 JSON、Markdown code fence、多段 section、缺失 STARTER_CODE 的测试。
- 为 quality gate 增加测试：过短内容、答案不在选项中、练习少于 3 个测试、ProjectSpec 缺 milestone/rubric 等。
- 为 `buildMasteryReport` 增加学习状态样例测试。

验收标准：

- 至少覆盖 4 类典型生成失败。
- 测试不依赖真实 LLM 或网络。
- 失败信息能指出具体质量问题。

## Phase 4：优化生成速度与稳定性

目标：进一步降低等待时间和 API 失败带来的中断。

计划改动：

- 为 `generateUnitContent` 增加更细粒度缓存：search、draft、critique、final metadata 可以分阶段复用。
- 给 `generate-all` 增加进度摘要：cache hit、generated、repaired、fallback、failed 数量。
- 增加 `--only-missing` 和 `--force` 的行为说明与更严格实现。
- 对相同课程单元的并发生成加 in-flight 去重，避免同一 unit 重复请求模型。
- 在 provider retry 日志中显示第几次重试、退避时间、错误类别。

验收标准：

- 重复运行 `generate-all` 时不会重复生成已有完整单元。
- 部分单元失败后再次运行能稳定续跑。
- 控制台输出能看出慢在哪里、失败在哪里。

## Phase 5：提升练习与项目的教学质量

目标：让练习更像课程系统的一部分，而不是附在讲义后的孤立题。

计划改动：

- 为 exercise 增加 `difficulty`、`conceptTags`、`commonPitfalls`、`estimatedMinutes` 字段。
- 生成题目时要求至少包含 normal、edge、misconception guard 三类测试。
- ProjectSpec 增加 `checkpointQuestions`，让项目每个里程碑都有概念检查。
- remediation 单元根据 mistakeTypes 生成更短、更聚焦的练习，而不是完整重讲。

验收标准：

- 新字段有 schema 校验和 fallback 默认值。
- `fc audit` 能检查 conceptTags、pitfalls、checkpointQuestions。
- 至少一个离线 seed unit 展示新结构。

## Phase 6：把 learner model 做得更聪明

目标：让路线规划不只看初始画像，也持续吸收学习过程中的证据。

计划改动：

- 在 state 中记录 skill-level evidence，而不是只记录 unit-level assessment。
- `adaptNextUnit` 引入 mastery report：若多个相关技能低于阈值，优先安排补救或复习。
- `fc plan` 或新命令支持基于当前状态重新规划剩余单元。
- 增加 explainable routing：每次跳转都记录为什么进入下一单元、补救单元或复习。

验收标准：

- 同一个 learner 在不同 assessment 历史下会得到不同推荐。
- 路由原因可在 CLI 中查看。
- 不破坏已有 `nextIfPassed` / `nextIfFailed` 显式路由。

## Phase 7：安全和仓库卫生

目标：减少误提交运行数据、敏感配置和生成缓存的风险。

计划改动：

- 复查 `.gitignore` 对 `.fuckcolloge/cache/`、临时生成物、编译产物的覆盖。
- 增加 `fc doctor` 或 `fc audit --repo`，提示本地敏感文件和异常 Git 状态。
- 文档中明确哪些 `.fuckcolloge` 文件适合同步，哪些只应留在本地。

验收标准：

- `git status` 中不应长期出现缓存类 untracked 文件。
- API key、dist、node_modules、cache 默认不会被提交。
- 用户能清楚区分学习产物和项目源码。

## 推荐提交顺序

1. `Add mastery CLI reporting`
2. `Extract generated unit parsing and quality gates`
3. `Add curriculum generation regression tests`
4. `Improve generate-all resumability metrics`
5. `Enrich exercise and project pedagogy metadata`
6. `Use mastery evidence for adaptive routing`
7. `Harden repository hygiene checks`

## 近期我建议先做的三件事

1. 先完成 `fc mastery`，因为已有纯函数基础，收益高、风险低。
2. 再拆 `pipeline.ts`，为后面的测试和质量增强扫清结构障碍。
3. 然后补生成质量回归测试，把“高质量课程生成”固定成可验证的工程约束。

