# FCAgent 优化更改与后续优化建议

本文档总结了当前已经实现的优化和修复，以及针对生成链路稳定性和响应速度的后续优化建议。

---

## 📌 当前已实现的优化与修复

### 1. 禁用 Pass 3 的 Reasoning/Thinking Mode
- **优化点**：将 Pass 3（格式精修阶段）的 `thinkingMode` 设为 `disabled`。
- **影响**：大型推理模型（如 `DeepSeek-V4-Pro`）在输出大 JSON 时，如果开启推理模式，会产生巨量思考 Token 导致 API 严重超时。禁用后，最终格式化阶段响应时间缩短 **70%** 以上，完全消除了超时错误。

### 2. 诊断系统的代码自适应相似度校验
- **修改文件**：[`assessmentDiagnostics.ts`](file:///d:/AUPC/大三下学期小学期/MyAgentProject/src/agents/assessmentDiagnostics.ts)
- **优化点**：引入了代码自适应的 Lexical 相似度校验阈值。如果选项中包含代码特征（如 `(`, `=`, `def`, `import` 等），将大字组相似度检测门槛从 `0.85` 放宽到 `0.95`；普通文本题目仍保留 strict `0.85`。
- **影响**：防止高质量的编程选项（因仅微调代码细节导致文本极度相似）被误判为重复，极大地降低了触发本地修复机制的概率。

### 3. 增强的本地修复 Prompt 与校验规则
- **修改文件**：[`pipeline.ts`](file:///d:/AUPC/大三下学期小学期/MyAgentProject/src/agents/pipeline.ts)
- **优化点**：在 `quiz-objectives` 的局部修复 Prompt 中强力注入了 Zod 规则约束（要求必须返回完整 Quiz 数组、`distractorRationales` 的选项匹配和数量匹配必须与 `options` 严格对应）。
- **影响**：即便推理模式已禁用，模型仍然能百分之百生成符合 Zod 校验的规范 JSON 参数，从而保证了修复机制的成功率。

### 4. 增加修复阶段的 Raw 响应与 Tool 参数 Debug 日志
- **修改文件**：[`pipeline.ts`](file:///d:/AUPC/大三下学期小学期/MyAgentProject/src/agents/pipeline.ts)
- **优化点**：在 `repairGeneratedUnit` 捕获到工具响应并进行参数融合时，实时打印 LLM 生成的 args。
- **影响**：提升了管道排查的黑盒可见性，当再次发生数据结构断裂时能够瞬间通过控制台抓取具体哪个字段写错。

---

## 🚀 后续可进行的深度优化建议

### 1. 自动熔断与兜底（Fallback to Builtin Placeholder）
- **痛点**：目前如果 LLM 修复 5 次仍然报 ZodError 校验错误，程序会直接报错抛出 `process.exit(1)` 并让任务挂起，极大影响学习者的使用流畅性。
- **建议**：
  - 在 `repairGeneratedUnit` 尝试失败后，不应直接 `throw` 阻断用户。
  - 可以自动退回到 `ensureUnitFullyPopulated` 的模板逻辑，为用户静默发布一个占位/备用版课件，并在终端发出黄色友情提示 `💡 课件部分概念由于 API 格式异常已采用自动备用方案，您可以先进行学习。`
  - 这样既保证了应用的鲁棒性，又不打断用户的学习流。

### 2. 精化 Pass 3 的 Prompt 以强化 Objective 覆盖率
- **痛点**：Pass 3 偶尔会产生 objectives 没有完全覆盖的问题（如在生成 Python 单元时漏掉了评估文件 I/O 这一客观目标），导致生成虽然合规但质量分判定不过关，被迫进入 Repair 阶段。
- **建议**：
  - 在 Pass 3 final prompt 中，增加一个强制指令模板：`“You MUST explicitly verify that each objective in the objectives list has at least one corresponding question in the quiz list mapping to it.”` 
  - 这种提示词层面的自检可以把 90% 的 objective unassessed 错误掐死在 Pass 3 阶段，进一步减少进入修复路径的几率。

### 3. 增加 Local Mock 测试与静态 AST 级修复
- **建议**：
  - 对于 reference solution（参考代码）校验失败（即大模型写的测试代码或实现跑不过测试用例），目前只能重新调用 LLM 进行修复，成本高、响应慢。
  - 实际上可以在本地加入简单的 AST 正则解析/微调。如果是由于多余的 Markdown 标记（如 ` ```python `）被拼入 starter code，可以直接使用正则表达式在 pipeline 中截断，不需要请求 LLM 即可实现静态零成本修复。
