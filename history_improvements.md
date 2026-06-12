# FuckColloge CLI 核心改进历史记录 (Core Improvements Log)

本文件记录了 `FuckColloge` 平台从最初的 MVP 版本到当前企业级多语言自适应学习平台的演进过程与核心技术优化。

---

## 1. Windows 子进程执行异常修复 (Windows Subprocess `spawn EINVAL` Fix)
* **背景与痛点**：
  在 Windows 环境下，原版的 TypeScript 代码运行器通过 Node.js 的 `execFile` 调用 `tsx` 时，由于 Windows 路径的分隔符差异（反斜杠 `\`）以及某些敏感环境变量的空键名污染，会导致底层 `CreateProcessW` 抛出 `spawn EINVAL`（无效参数）异常，导致用户无法正常提交和评测作业。
* **改进核心**：
  - 引入了跨平台绝对路径规范化处理，强制将工作区路径、临时测试路径通过 `path.resolve` 转化为平台兼容的绝对路径。
  - 对传递给子进程的 `process.env` 进行安全过滤，剔除了 Windows 特有的可能导致子进程崩溃的无效键值对。
  - 为子进程增加健壮的错误捕获（Error Catching）和优雅降级（Graceful Degradation）机制，确保测试执行器在 Windows 11 下 100% 可复现运行。

---

## 2. 三阶段大模型提炼环与联网搜索容灾 (3-Pass LLM Learning Loop & Search Fallbacks)
* **背景与痛点**：
  在生成个性化课件时，传统的单次大模型调用（1-Pass Generation）经常出现生成质量参差不齐、内容过于简陋、概念练习与作业代码不呼应，以及代码块被包裹了 Markdown 格式修饰符（如 ````typescript ... ````）导致本地语法解析失败的问题。此外，联网搜索作为核心工具，在恶劣或受限的网络环境下频繁发生各种网络超时与连接失败。
* **改进核心**：
  - **Pass 1: 基础初稿生成 (Drafting)**：根据用户画像中的基础水平，快速生成知识大纲。
  - **Pass 2: 联网检索与扩展 (Search & Refinement)**：引入网络搜索引擎工具，针对该知识点联网检索最新的官方规范（如 MDN、W3C 规范或 Python 官方文档），将内容扩展提炼 2-3 次，自动融入 CS61A 风格的丰富注释（Docstrings）和多层次断言。
  - **Pass 3: 代码纯净化与自检 (Sanitization & Self-Check)**：设计专门的正则清洗过滤器，剥离所有 Markdown 冗余文本，保证生成的作业模板代码是纯净、无污染且可直接执行的骨架。

* **联网搜索失败场景及全链路容灾解决方案 (Detailed Search Failures & Solutions)**：
  在网络检索这块“最易掉链子”的环节，我们针对各种边界异常设计了多级冗余方案：
  1. **网络连接中断与 DNS 域名解析失败 (`TypeError: fetch failed`)**：
     - *细节*：当学习者环境处于无网络连接、未配置有效代理或 Wikipedia 的 API 域名解析受阻时，底层 Node.js `fetch` 接口会直接抛出 `fetch failed` 错误。
     - *解决方案*：在 `WebSearchTool.execute()` 内部使用 `try-catch` 捕获异常，将其包装为标准的错误文本字符串返回给大模型（如 `Search error: fetch failed`），防止工具链报错使整个 CLI 程序崩溃；在 Pipeline 的前置检索层中也设计了外层 `try-catch`，一旦捕获失败便会在终端打印警告 `⚠️ 联网检索失败，将使用 LLM 内部参数化知识`，并把检索文本优雅降级为 `"No search results available."`，确保主流程畅通。
  2. **头解析与数据读取超时 (`HeadersTimeoutError` / `TimeoutError`)**：
     - *细节*：由于国内访问 Wikipedia 接口（`https://en.wikipedia.org/...`）存在严重延迟，常在读取 Response Headers 阶段触发 `undici` 内部的超时保护，抛出 `HeadersTimeoutError` (`UND_ERR_HEADERS_TIMEOUT`)，或由于等待过久被 `AbortController` 抛出 `TimeoutError`。
     - *解决方案*：我们对大模型的 Prompt 进行了约束，告知大模型联网搜索是**最佳实践但非强依赖项**。一旦大模型调用的工具在执行期间被超时拦截，大模型会基于其**自我纠正 (Self-Correction)** 机制，自主在下一次对话中跳过该工具，直接凭借其自身的参数化知识 (Parametric Knowledge) 补齐课件内容，确保整体高响应率。
  3. **限流及 HTTP 错误状态码 (`429 Too Many Requests` / `500/503`)**：
     - *细节*：频繁发起检索可能面临 API 限流或服务端故障，使接口返回非 200 状态码。
     - *解决方案*：`WebSearchTool` 增加了针对 `!response.ok` 的显式校验，一旦触发即抛出说明响应码的友好文本，使大模型可以清晰得知当前不可用，并切换回内部知识模型。
  4. **大模型 API 彻底瘫痪下的全局灾备 (Total Pipeline Crash & Seed Fallback)**：
     - *细节*：如果用户的 API Key 额度耗尽、代理完全挂掉或网络链路彻底断开，连大模型本身的 Chat Completing 接口都无法连通时，不仅联网搜索，整个 3-Pass 流程都会崩溃。
     - *解决方案*：在 `cli.ts` 调用的最外层，我们为 `generateUnitContent` 设置了终极防线。当整个 LLM 调用流水线失败时，系统将无缝激活**备用种子课程生成器 (`ensureUnitFullyPopulated`)**，直接回退并渲染项目本地已有的种子课程大纲（Seed Curriculum）和本地代码占位框架，确保用户即便在离线状态下也依旧可以完成基本的代码练习与提交测试。

---

## 3. 多语言全栈自适应引擎 (Polyglot Runner & Dynamic Dispatch)
* **背景与痛点**：
  最初的系统完全硬编码（Hard-coded）只支持 JavaScript/TypeScript 相关的教学单元。为了使系统具有普适的计算机科学（CS）教学能力，必须解除语言限制。
* **改进核心**：
  - **通用领域模型改造**：在 [types.ts](src/types.ts) 中将 `jsLevel` 升级为 `programmingLevel`，并将 `ExerciseSpec` 中的硬编码类型扩充为 `language: 'typescript' | 'python' | 'bash'` 组成的联合类型。
  - **中央调度架构 (Runner Factory)**：重构了评测执行系统，解耦了 TS 运行器，新增了 [pythonRunner.ts](src/runner/pythonRunner.ts) 和 [bashRunner.ts](src/runner/bashRunner.ts)。
    - **Python 运行器**：动态生成带有测试断言的测试脚本，利用 Python 原生模块抓取并返回标准 JSON 格式结果。
    - **Bash 运行器**：支持 Linux 运维脚本测试，特别适配了 `stdout` 匹配断言模式，可在 Shell 环境下捕获执行输出。
  - **AI 动态语言选择**：大模型根据当前单元主题（如：运维、算法、数据分析或前端）智能指定当前关卡使用的最佳语言，生成对应后缀的 `solution` 代码骨架。

---

## 4. 交互式 AI 助教诊断服务 (Interactive AI TA & Assessment Reviewer)
* **背景与痛点**：
  在早期的 MVP 流程中，用户提交作业后，系统仅仅输出测试是否通过的布尔值，缺乏针对错误代码、Quiz 题目回答逻辑的深度剖析和启发式引导，体验较差。
* **改进核心**：
  - **答题卡采集**：增加了命令行实时交互交互式 Quiz 回答收集机制，在用户提交时可交互式解答讲义中的选择题。
  - **多源数据融合**：将“本地 Runner 运行的测试用例结果”、“用户的 Quiz 答题状态”以及“用户编写的 solution 源码”合并，作为上下文发送给大模型。
  - **启发式诊断反馈**：大模型扮演 CS61A TA 的角色，生成包含**错因分类（Mistake Types）**、**语义陷阱分析（Diagnosis）**和**下一步行动指南（Next Action）**的全面诊断报告，帮助学生建立知识心智模型，而非仅仅给出正确答案。

---

## 5. 交互式学习时长与自适应规模扩展 (Interactive Study Duration & Dynamic Planning Scale)
* **背景与痛点**：
  最初的大纲生成策略硬编码为固定生成 2 个单元，以降低上下文溢出风险；然而这导致无法根据学习者的学习周期（如 1 个月还是 3 个月）以及每周时长动态匹配合理的课程厚度。此外，画像诊断阶段也缺失了对总体学习周期的量化感知。
* **改进核心**：
  - **画像 Schema 扩展**：在 `LearnerProfile` Zod 规范中新增了 `totalWeeks` 枚举（`1-4` | `5-8` | `9-12` | `12+` 周），并在交互式 `fc diagnose` 命令提示中补充了问答捕获。
  - **单元数量自适应推算**：在 `generatePlan` 阶段引入学时占比转换模型：$\text{期望单元数} = \min(10, \max(2, \text{周数} \times \text{每周小时数} / 5))$，动态调整 Prompt 中大纲的生成个数，支持 2 至 10 个单元的动态大纲规模。

---

## 6. 交互式选择题判分鲁棒性优化 (Robust Quiz Grading & Answer Normalization)
* **背景与痛点**：
  概念题（Quiz）在提问时采用数字序号（如 `1)`、`2)`），而大模型生成的标准答案则采用英文字母（如 `A`、`B`）。原系统直接执行严苛的字面值比对（如 `"2"` === `"B"` 为假），导致学习者即便选出了完全正确的选项也会被无情判定为失败。
* **改进核心**：
  - **选项输入归一化**：重构了 `gradeQuiz` 算法，在比对前自动剥离右括号（如 `"2)"` $\rightarrow$ `"2"`），并将英文字母（`A/B/C/D`）与数字选择序号进行双向归一化转换（如 `A` / `a` $\rightarrow$ `1`，`B` / `b` $\rightarrow$ `2`）。
  - **全文本与索引兜底匹配**：如果输入的是完整选项文本，算法会自动从 `question.options` 数组中查找其实际索引，并与标准答案的索引进行间接比对，彻底解决了由于格式不一致导致的误判问题。

---

## 7. 企业级 Git 提交安全防泄密机制 (Git Secret Exclusion & Selective Tracking)
* **背景与痛点**：
  为了实现日后分析，学习者希望把 `.fuckcolloge/` 中的课件和状态记录一并推送到 GitHub，但该目录下的 `config.json` 存有明文形式的大模型 API 秘钥，执行 `git add .` 极易导致秘钥泄露。
* **改进核心**：
  - **局部隔离忽略**：更新了 `.gitignore` 配置，精准将 `.fuckcolloge/config.json` 列入忽略清单，同时不再粗暴忽略整个 `.fuckcolloge/` 目录。
  - **多维安全防护**：保留了对大纲、讲义、代码练习和答题卡数据库的追踪，做到了“进度可共享、秘钥不泄露”的精细化版本控制。
