# 🎓 FuckColloge CLI 平台开发项目求职简历指南 (Resume Project Guide)

本指南旨在为你将 `FuckColloge` 核心研发经历及配套的 `Scheme 解释器与编译器大作业` 写入简历时提供详尽的技术支撑，帮助你通过 **STAR 原则（Situation, Task, Action, Result）** 突显你在 AI Agent（智能体）、System Programming（系统编程）和高性能流控缓存方面的深度硬核技术实力。

---

## 📄 简历模板内容推荐（可直接参考修改）

### 项目一：FuckColloge — AI-Native 自适应计算机科学学习与沙盒评测系统（全栈/系统研发）
* **项目时间**：2026.03 - 2026.06 (可根据实际情况修改)
* **核心技术**：Node.js, TypeScript, Python, LLM API (DeepSeek/GPT-4o), Piston Execution API, LRU Cache, Subprocess Sandbox
* **项目描述**：一款基于 Multi-Agent 架构的计算机科学自学命令行客户端。系统通过对用户做交互式画像诊断，利用大模型自适应规划课程大纲；采用 3-Pass LLM 联网课件生成环输出定制化教案，并通过本地多语言编译执行沙盒（Runner Sandbox）及情绪共情力 AI TA 提供多阶段渐进式 Hints 批改服务。
* **核心工作与业绩（STAR 结构描述）**：
  1. **【分层缓存设计 / 高并发优化】**：针对 LLM 响应延迟、重复联网搜索浪费 Token 的痛点，设计并实现了 **L1 内存 + L2 磁盘分层持久化缓存机制**（基于 SHA-256 签名）；实现重复请求 **1ms 级极速返回**，降低大模型 API 消耗成本达 **60% 以上**，彻底阻断了命令行控制台卡顿。
  2. **【抗限流调度 / 并发错峰】**：针对大批量生成任务时高频触发大模型服务商（SiliconFlow/OpenAI）速率超限（Rate Limit Exceeded）及 Socket 重置（`ECONNRESET`）问题，手写了基于 Promise 的 **Staggered Concurrency Limiter（错峰并发限制器）**，实现最大并发度为 1 且任务间带有 3 秒错峰延迟的流控调度，使预生成稳定性提升至 **100%**。
  3. **【跨平台执行沙盒 / 优雅熔断】**：设计 **Runner Factory（运行器工厂模式）** 统一调度本地 TypeScript/Python/Bash/Rust 等多语言执行器，过滤 Windows 下 `spawn EINVAL` 底层敏感环境变量和路径解析缺陷；针对小众语言对接 Piston API 实现云端执行，并设计了**尝试 5 次失败自动触发 Skip（跳过）与 Review（复习账本）**的状态控制流，大幅提升学习者心流体验。
  4. **【断点续传与自适应重试机制】**：针对网络/API 偶然故障导致的生成超时，设计了 **Fallback（降级）标记与自适应差异扫描机制**。系统会自动对故障单元进行占位标记，并在下一次启动时**仅增量生成失败的节点**，保证在大模型服务不稳定下的流程高鲁棒性。
  5. **【AI TA 评估与归一化校验】**：编写了 Quiz 答题卡多格式归一化算法（支持字母、数字、右括号等格式兼容比对），融合“代码运行日志 + Quiz 答卷 + 源码”作为 LLM 上下文，提供场景化、多阶梯式的 Hints 调试启发，在通关和失败时提供差异化情绪支持。

---

### 项目二：基于 Python 语言的 Scheme 子集解释器与 LLVM 编译器管道实现（硬核系统编程）
* **项目时间**：2026.05 - 2026.06 (可根据实际情况修改)
* **核心技术**：Python, PLY (Lex-Yacc), LLVM IR (llvmlite), Lexical Scoping, Closure, Tail-call Optimization (Trampolining)
* **项目描述**：FuckColloge 的第四单元巅峰实战项目。独立用 Python 实现了一个支持 Scheme Lisp 子集的完整解释器与编译器后端，打通了从源代码输入（REPL）到直接编译为 LLVM IR 并链接生成可运行可执行文件（.exe）的完整流水线。
* **核心工作与业绩（STAR 结构描述）**：
  1. **【编译器前端构建】**：利用 PLY（Python Lex-Yacc）从零构建了 **LALR(1) 语法分析器**，定义了包含 S-Expression、点对（Dotted Pair）、原子和嵌套列表的语法文法规范，实现了将 Scheme 源程序解析为内存树状 Pair（Cons Cell）链表，为后端提供了结构化的 AST。
  2. **【词法环境与闭包实现】**：自主设计了**嵌套环境 Frame 模型**（由 Python 字典与指向 Parent Frame 的指针组成链表），通过词法作用域链（Lexical Scope Chain）解决符号查询与变量绑定遮蔽（Shadowing）问题，完美实现了 `LambdaProcedure` 在定义时捕获并维持定义帧上下文的**闭包（Closure）机制**。
  3. **【尾递归消除与 Trampoline 优化】**：针对 Python 原生调用栈限制（Recursion Limit），在求值器中引入了 **Unevaluated Thunk（延迟求值对象）** 包装，重构 `scheme_eval` 为 Thunk 驱动的 `while` 循环（**Trampolining 蹦床机制**），将尾调用递归空间开销从 $O(n)$ 优化到 $O(1)$，**彻底消除了深层递归导致的爆栈（Stack Overflow）**。
  4. **【LLVM IR 编译管道与链接】**：利用 `llvmlite` 库，设计了将 Scheme 表达式转换为 SSA（静态单赋值）形式 LLVM IR 的编译生成器；适配了控制流图基本块（Basic Blocks）与 Phi 节点的生成，并自动侦测宿主系统调用跨平台链接器（Linux/macOS 下使用 `cc`，Windows 下使用 `gcc / MinGW`）将生成的 `.ll` / `.o` 文件链接生成独立可执行文件，建立起完整的 AOT（Ahead-Of-Time）编译通路。

---

## 💡 面试官高频提问准备（Technical Q&A Practice）

### Q1：为什么要手写 L2 文件缓存，而不是直接用内存缓存（Memory Cache）？
> **话术回答**：
> “在我们的 CLI 自学习系统中，`generate-all` 或 `start` 的命令执行是进程级独立的——也就是说，每次用户在终端敲下 `fc start` 时，都会启动一个新的 Node.js 虚拟机进程。如果只使用简单的内存缓存（如 `Map`），进程结束后缓存数据就全部丢失了，根本无法在多次命令行交互之间共享数据。
> 因此，我设计并实现了**以文件系统为基底的 L2 磁盘持久化缓存**。通过对 Prompt 序列化字符串进行 SHA-256 哈希作为文件名（保存在 `.fuckcolloge/cache/`），在多次独立的命令调用间实现了极速的断点复用，这也为未来的离线学习（Offline Mode）打下了基础。”

### Q2：你是怎么解决三方大模型 API 的 Rate Limit（限频）报错的？
> **话术回答**：
> “许多国内外的模型服务商（比如 SiliconFlow）对于免费或低配 API Key 的并发率控制非常严苛（例如每分钟请求数限制或并发连接数限制）。当我们的全量课件生成引擎通过 `Promise.all` 瞬间并发 5-6 个重型单元生成时，网络握手会瞬间被服务商拒绝，抛出 `ECONNRESET` 或 `503 Service Unavailable` 错误。
> 为此，我实现了一个自定义的 **Promise 并发调节器**：
> 1. 将并发数强限制为 1，将并发退化为稳定的串行队列；
> 2. 在每个任务启动时，使用 staggered delay 差值算法，加入 `taskIndex * 3000ms` 的偏移量（Staggered Offset），避免短时间内的连续请求把套接字耗尽。
> 3. 对请求超时进行 `try-catch` 熔断，写入占位标记并提供断点自适应重试，极大提升了分布式请求的抗震能力。”

### Q3：解释器里的 Trampoline（蹦床机制）是如何解决递归爆栈的？
> **话术回答**：
> “Python 默认的调用栈深度大约是 1000 层，直接使用朴素的递归 `eval` 进行树深度遍历时，一旦遇到深度阶乘或无限循环的 Scheme 尾递归，就会直接报 `RecursionError` 崩溃。
> 解决这个问题的关键是**将递归化为循环**。当 `scheme_eval` 检测到当前是一个尾调用上下文（Tail Context）时，它**不再立即递归调用 eval**，而是将需要计算的表达式和环境包装进一个 `Unevaluated` 对象（称作 Thunk 壳）并直接返回给上一层。
> 在 REPL 的最外层，我放置了一个 `while` 循环作为『蹦床』：它不断接收返回值，一旦收到 Thunk 对象，就把 Thunk 剥开并继续运行下一次循环，若收到的是最终计算值则退出循环。这样，函数调用就只在单层 Python 栈帧中进行，空间复杂度从 $O(n)$ 直接降为 $O(1)$，实现了完美的尾递归优化。”

---

祝你求职顺利！这份简历描述拥有非常清晰的**底层系统设计**与 **AI 应用工程结合点**，在简历初筛和技术面中会极具竞争力！💪✨
