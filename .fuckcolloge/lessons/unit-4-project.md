# CS61A 进阶专题：自主调试 Agent 的设计与实现

本课程将引导你构建一个能够自主发现并修复 Python 代码中 Bug 的智能体。这不仅是一个工程项目，更是对抽象屏障、状态机模型以及解释器设计的深度实践。我们将采用 ReAct (Reason + Act) 框架，将 LLM 的推理能力与本地代码执行环境相整合。

## 1. ReAct 主循环：推理与行动的闭环

ReAct 模式的本质是一个状态机。Agent 的运行过程可以抽象为以下状态转移方程：
$S_{t+1} = \text{Transition}(S_t, \text{LLM}(S_t, O_t))$

其中 $S_t$ 是当前内部状态，$O_t$ 是外部环境的观察结果。在每一轮迭代中，Agent 接收观察，进行推理，并产出行动。

### 架构设计

```python
def react_loop(agent_state):
    while not agent_state.is_done():
        # 1. 观察: 获取环境反馈或初始任务
        observation = agent_state.get_latest_observation()
        
        # 2. 推理: LLM 分析当前状态，决定下一步行动
        prompt = build_prompt(agent_state, observation)
        llm_response = llm_client.complete(prompt)
        
        # 3. 解析与行动: 提取工具调用并执行
        try:
            tool_name, args = parse_response(llm_response)
            result = tool_registry.execute(tool_name, args)
            agent_state.add_history(role="tool", content=result)
        except ParseError as e:
            agent_state.add_history(role="error", content=str(e))
            
        # 4. 状态更新: 检查重试次数与终止条件
        agent_state.update_state()
```

**Gotcha（陷阱）与边缘情况：**
- **JSON 解析失败**：LLM 输出的 JSON 可能包含 Markdown 代码块标记（如 ` ```json `）。解析前必须使用正则表达式进行清洗。
- **无限循环**：Agent 可能陷入"尝试修复 → 失败 → 尝试相同修复"的死循环。必须在状态管理中实现**重复行为检测**——若连续 3 次执行相同 Action，则强制注入提示词要求改变策略。

## 2. 统一工具注册表

为了实现 LLM 与执行环境的解耦，我们需要建立一个统一的 Tool Registry。这类似于 CS61A 中的 Scheme 解释器环境：每个工具是一个绑定到名称的 Lambda 过程。

### 接口设计

每个工具必须具备三个属性：`name`（LLM 调用时的名称）、`signature`（描述参数类型）、`description`（语义说明）。

```python
class ToolRegistry:
    def __init__(self):
        self.tools = {}
        
    def register(self, name, func, signature, description):
        self.tools[name] = {
            "func": func,
            "schema": {"signature": signature, "description": description}
        }
    
    def execute(self, name, args):
        if name not in self.tools:
            return f"Error: Tool {name} not found."
        return self.tools[name]["func"](**args)
```

### 核心工具集实现细节

1. **`read_file(filepath)`**
   - *边缘情况*：文件过大导致超出 LLM 上下文窗口。实现时需加入行数限制（如最多返回 100 行），并提示 Agent 使用 `grep` 类工具缩小范围。

2. **`write_file(filepath, content)`**
   - *边缘情况*：覆盖原有代码导致状态丢失。必须实现**原子写入**：先写入 `.tmp` 文件，成功后再 `os.replace` 覆盖原文件。`os.replace` 是 POSIX 原子操作——目标文件要么是旧版本，要么是完整的新版本，绝不会是半写状态。

3. **`run_python(filepath)`**
   - *架构要求*：**绝对不能**在 Agent 主进程中直接使用 `exec()` 执行用户代码，否则 Bug 会导致 Agent 本身崩溃。必须使用 `subprocess.run` 在隔离子进程中运行，并捕获 `stdout`、`stderr` 和返回码。这是进程隔离原则——与 CS61A Scheme 解释器在沙盒中运行学生代码的理念一致。

## 3. Agent 状态管理

Agent 的状态构成了 LLM 的短期记忆。糟糕的状态管理会导致上下文爆炸或关键信息丢失。

状态对象需包含：
- `current_task`：原始任务描述及目标测试文件。
- `iteration_history`：按时间顺序排列的 (Reason, Action, Observation) 元组列表。
- `error_context`：最近一次执行失败的完整 Traceback。
- `retries_left`：最大重试限制（默认设为 10）。

**上下文窗口管理 Gotcha**：
随着迭代增加，History 会迅速超过 LLM 的 8k/16k Token 限制。不能简单截断历史，因为这会丢失对 Bug 根源的推理上下文。解决方案是**滑动窗口 + 摘要**：保留最近 5 轮的详细交互，对更早的历史调用 LLM 生成一段"已尝试过的失败方案摘要"，替换原始数据。这既压缩了 Token，又保留了因果推理链。

## 4. 端到端测试：CS61A 风格的 Bug 修复基准

为了验证 Agent 的能力，我们将提供一个包含 4 个典型 CS61A 风格 Bug 的 Python 项目。Agent 需自主修复至少 3 个（80%）。

### 测试项目：`scheme_buggy.py`

这是一个简化版的 Scheme 解释器片段，包含以下 Bug：

1. **可变默认参数**
   ```python
   def parse_tokens(tokens, tree=[]):  # Bug: tree 会在多次调用间共享
   ```
   *Agent 修复策略*：需通过 `read_file` 发现，推理出 Python 函数定义的陷阱，修改为 `tree=None` 并在函数内 `if tree is None: tree = []`。

2. **非局部变量未声明**
   ```python
   def make_counter():
       count = 0
       def counter():
           count += 1  # Bug: UnboundLocalError
           return count
       return counter
   ```
   *Agent 修复策略*：运行测试得到 Traceback，定位到该行，推理出需要添加 `nonlocal count`。

3. **递归基线条件错误**
   ```python
   def factorial(n):
       if n == 1:
           return 1
       return n * factorial(n)  # Bug: 无限递归
   ```
   *Agent 修复策略*：执行测试触发 `RecursionError`，分析调用栈，修正为 `factorial(n-1)`。

4. **环境链查找逻辑缺陷**
   ```python
   class Environment:
       def lookup(self, var):
           if var in self.bindings:
               return self.bindings[var]
           elif self.parent:
               return self.parent.lookup(var)
           else:
               return None  # Bug: 应该抛出 NameError
   ```

### 交互流程示例（Agent 视角）

1. **Observe**：任务是修复 `scheme_buggy.py` 使其通过 `test_scheme.py`。
2. **Reason**：我需要先运行测试看看哪里失败了。
3. **Act**：`run_python("test_scheme.py")`
4. **Observe**：`RecursionError: maximum recursion depth exceeded in factorial`
5. **Reason**：`factorial` 函数递归没有正确向基线条件收敛。我需要查看源码。
6. **Act**：`read_file("scheme_buggy.py", lines="10-15")`
7. **Observe**：看到 `return n * factorial(n)`
8. **Reason**：参数没有减小。应该改为 `factorial(n-1)`。
9. **Act**：`write_file(...)` 修复代码
10. **Act**：重新运行测试

## 总结

构建自主调试 Agent 的核心在于**严格的抽象屏障**。LLM 充当逻辑控制单元，Tool Registry 充当 I/O 接口，子进程充当隔离的执行环境。通过精细的状态管理防止上下文溢出与死循环，你将创造出一个能够真正理解并修复 CS61A 级别代码错误的智能体。

这是你从"Python 少侠"晋升为"Agent 造物主"的成人礼。