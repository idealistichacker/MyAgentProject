# FuckColloge CLI 历史开发纪实 (Development Walkthrough History)

本文件整理并汇总了 `FuckColloge` 自学工具项目从立项、分析、重构到当前自适应多语言版本的完整开发轨迹与历史里程碑。

---

## 📅 阶段一：立项构建与 MVP 搭建 (Phase 1: MVP Setup & Architecture)
* **核心目标**：
  构建一个受 UC Berkeley CS61A 启发的 AI Native 自学命令行客户端。通过画像诊断定制用户的自适应学习计划。
* **主要工作与实现**：
  - **模块化架构设计**：搭建以 CLI (`cli.ts`) 为主干，配合 Agents (`pipeline.ts`)、执行沙盒 (`tsxRunner.ts`) 和本地状态库 (`fsState.ts`) 的基础架构。
  - **核心命令集实现**：
    - `init`：初始化 OpenAI 兼容大模型服务配置。
    - `diagnose`：在控制台通过一问一答，建立学习者的初始水平与目标画像。
    - `plan`：生成大纲，并与静态种子课程相结合。
    - `start`：在本地生成 `.md` 讲义及 `solution.ts` 代码模板。
    - `submit`：执行本地代码测试，并回传给大模型进行诊断评估。
    - `next`：通过判定后晋级下一单元。

---

## 📅 阶段二：仓库剖析与 Windows 子进程调试 (Phase 2: Windows Subprocess debugging)
* **核心目标**：
  解决在 Windows 11 环境下，`fc submit` 评测用户代码时进程崩溃的底层异常问题。
* **主要工作与实现**：
  - **原因定位**：剖析发现 Node.js 的 `execFile` 在 Windows 下拉起 `tsx` 时，由于反斜杠路径格式解析错误，以及环境参数污染（如 Windows 空环境变量），会抛出底层 `spawn EINVAL` 错误。
  - **稳健修复**：
    - 引入了 `path.resolve` 与平台规范的绝对路径处理。
    - 对注入子进程的 `process.env` 进行安全过滤，规避非法键值对。
    - 增加跨平台异常捕获与优雅降级机制，保证测试评测流程在 Windows 11 上畅通无阻。

---

## 📅 阶段三：三阶段提炼环与多语言执行沙盒重构 (Phase 3: 3-Pass Loop & Polyglot Runner)
* **核心目标**：
  打破单一 JavaScript/TypeScript 教学的限制，将平台重构为支持全域计算机科学（CS）的通用自学工具；同时解决讲义质量不高和 Markdown 代码块符号污染问题。
* **主要工作与实现**：
  - **多语言 Runner Factory**：解耦了硬编码的 TS 运行器，新增 Python 执行器（`pythonRunner.ts`）和 Bash 脚本执行器（`bashRunner.ts`），由调度中心按课程配置动态加载。
  - **三阶段大模型提炼环 (3-Pass Loop)**：
    - *Pass 1 (Drafting)*：根据用户画像生成初始讲义草稿。
    - *Pass 2 (Refinement)*：联网搜索（Web Search Wikipedia API）最新的标准（如 MDN, W3C 规范），对内容进行 2-3 次内容重构提炼，补充 Gotchas 和边缘案例。
    - *Pass 3 (Sanitization)*：正则清洗大模型返回的 ``` 等修饰标签，确保生成的 `solution` 代码框架是纯净的可执行代码。
  - **启发式 AI 助教 (AssessmentReviewer)**：在提交阶段采集选择题（Quiz）答卷，并结合源码与本地运行日志打包发给大模型，提供 CS61A TA 风格的高质量分析反馈。

---

## 📅 阶段四：自适应学时规模扩展与判分算法优化 (Phase 4: Dynamic Scale & Quiz Grading Fix)
* **核心目标**：
  实现课程大纲规模与预计总学习时间相匹配，并解决选择题交互选项因“字母 vs 数字”格式差异导致被误判为 `fail` 的问题。
* **主要工作与实现**：
  - **画像总时长捕获**：在 `LearnerProfile` Zod 规范及 `fc diagnose` 流程中新增 `totalWeeks`（总学习周数）属性。
  - **大纲规模动态算法**：在 `plan` 阶段根据 `总周数 * 每周小时数` 动态推算生成的单元数（支持 2 至 10 个单元），使大纲厚度具有自适应弹性。
  - **Quiz 答案归一化重构**：升级 `gradeQuiz` 判分算法，支持用户输入数字、右括号后缀、字母（A/B/C/D）和全文本比对。自动在内部建立索引级别的模糊匹配，彻底消除了判定偏差。
  - **Git 提交敏感信息防漏隔离**：在 `.gitignore` 中精准屏蔽 `.fuckcolloge/config.json`（包含大模型 API 秘钥），同时解除对讲义、代码、答题数据库文件夹的整体忽略，方便安全共享与分析。

---

## 📅 阶段五：联网搜索升级、弹性跳过机制与趣味强关联 Prompt 重构 (Phase 5: Search Selector, Skip/Review & Prompt Overhauls)
* **核心目标**：
  提供更强大的全网搜索引擎能力以支持新兴技术开发课件的精准生成；提供弹性的跳过与复习状态流控制以平滑学习难度；重构 LLM 交互提示词以注入有趣的人设灵魂并确保单元与项目强逻辑关联。
* **主要工作与实现**：
  - **Tavily 检索支持**：新增了对 `Tavily API` 的集成支持。用户可在 `fc init` 时自主选择 Wikipedia 或 Tavily 作为检索提供方，为高阶编程课件（如 Rust/Go）提供更前沿精确的互联网开发者文档检索。
  - **全课件离线预生成 (`fc generate-all`)**：引入了一键并发预生成所有计划单元讲义和代码模版的功能，支持快速大纲预览以及弱网下的离线学习。
  - **弹性跳过与复习面板 (`fc skip` / `fc review`)**：
    - 开发了 `fc skip` 指令支持主动跳过难关，并在 `fc submit` 失败 5 次时提供黄色高亮引导熔断。
    - 构建了 `fc review` 交互面板，供学习者随时查阅被跳过的单元账本并进行二次挑战。
  - **强关联趣味提示词重构 (Prompts Overhaul)**：
    - 对大纲设计者（`CurriculumPlanner`）、课件撰写者（`ContentGenerator` / `ContentCritic`）和精修人（`FinalPolisher`）进行全面 Prompt 重构，使其被赋予更具幽默感的 AI 导师灵魂。
    - 修改了 `generateUnitContent` 的底层传参逻辑，向其传入包含 Project 目标的完整 `LearningPlan`。AI 在起草课件时将获得上帝视角，实现讲义内容、Scenario-based 选择题、项目主题 Starter Code 变量命名三位一体强关联到最终的大作业中。
    - 升级了 `buildAssessment` 诊断助教，使其反馈信息更富有人情味，在成功时狂热庆祝，在失败时给予共情疏导和多阶段渐进式 Hints 调试启发。
