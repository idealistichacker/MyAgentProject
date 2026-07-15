# Agent的"进化之路"——上下文记忆、经验复用与实战部署

## 🧠 开场：你的Agent得了"金鱼脑"

上一单元你的Agent已能读文件、执行代码、根据报错修改——一个像样的ReAct循环跑起来了。但你可能遇到一个尴尬现象：

> 第7轮迭代时，Agent修好了bug A；第12轮，它又把bug A重新引入了。

这不是Agent"蠢"，而是它**失忆了**。LLM的上下文窗口有限——当对话轮次堆积，早期的关键决策被挤出窗口，Agent就像一条金鱼。

本单元我们给Agent装上**三层记忆系统**，然后打包成可日常使用的CLI工具。

---

## 一、上下文窗口管理：给Agent"工作记忆"

### 1.1 问题本质

ReAct循环每轮产生 `Thought → Action → Observation`。跑15轮，上下文轻松突破8K tokens。三种策略对比：

| 策略 | 思路 | 代价 |
|------|------|------|
| **截断** | 只保留最近N轮 | 丢失早期关键决策 |
| **摘要压缩** | 用LLM压缩旧对话 | 额外API调用，有信息损失 |
| **滑动窗口+摘要** | 混合策略 | 实现稍复杂，但效果最佳 |

### 1.2 滑动窗口+摘要压缩

核心思想：**近期对话保留原文，远期对话压缩为摘要**。

```python
import tiktoken

class ContextManager:
    def __init__(self, max_recent_tokens: int = 4000, 
                 max_summary_tokens: int = 800):
        self.recent_messages: list[dict] = []
        self.summary: str = ""
        self.max_recent_tokens = max_recent_tokens
        self.max_summary_tokens = max_summary_tokens
        self._enc = tiktoken.encoding_for_model("gpt-4o")

    def _count_tokens(self, messages: list[dict]) -> int:
        total = 0
        for msg in messages:
            total += len(self._enc.encode(msg["content"]))
            total += 4  # 每条消息的结构开销
        return total

    def add(self, message: dict):
        self.recent_messages.append(message)
        # 按token而非条数判断，避免长Observation撑爆窗口
        if self._count_tokens(self.recent_messages) > self.max_recent_tokens:
            self._compress()

    def _compress(self):
        """压缩最旧的2条消息到摘要中"""
        to_compress = self.recent_messages[:2]
        self.recent_messages = self.recent_messages[2:]
        
        # 将消息列表格式化为可读文本
        conv_text = "\n".join(
            f"[{m['role']}] {m['content'][:500]}" for m in to_compress
        )
        prompt = (f"当前摘要：{self.summary}\n\n新对话：\n{conv_text}\n\n"
                  f"请更新摘要（不超过{self.max_summary_tokens} tokens），"
                  f"保留：关键决策、已确认的根因、已尝试且失败的方案、"
                  f"已验证的修复。丢弃闲聊和冗余推理过程。")
        self.summary = llm_call(prompt)

    def build_context(self) -> list[dict]:
        context = []
        if self.summary:
            context.append({"role": "system",
                           "content": f"[历史摘要]\n{self.summary}"})
        context.extend(self.recent_messages)
        return context
```

> ⚠️ **Gotcha #1**：按消息条数管理窗口是常见陷阱。一条 `read_file` 的 Observation 可能包含2000+ tokens，而一条 Thought 可能只有50 tokens。**必须按token计数**，否则长输出会突然撑爆窗口。

> ⚠️ **Gotcha #2**：摘要本身也会膨胀。如果 `len(self.summary)` 超过 `max_summary_tokens`，需要对摘要再做一次压缩——即"摘要的摘要"。实现时加一个 `_trim_summary()` 方法，在 `_compress()` 末尾调用。

### 1.3 关键信息保留机制

不是所有信息都该被压缩。以下信息应**永久保留**，直接注入system prompt：

- **项目结构摘要**：文件树+关键模块职责
- **已确认的根因**：如"`divide()` 在 `x=0` 时未做检查"
- **已验证的修复**：如"已将 `return a/b` 改为 `return a/b if b != 0 else 0`，测试通过"
- **操作禁忌**：如"不要修改 `__init__.py`，它是自动生成的"

```python
KEY_INFO_TEMPLATE = """
[项目上下文]
{project_summary}

[已确认事实]
{confirmed_facts}

[操作禁忌]
{forbidden_actions}
"""
```

> 💡 **设计原则**：摘要负责"大概记得发生了什么"，关键信息保留负责"绝对不能忘的事实"。两者互补——摘要是**有损压缩**，关键信息是**无损锚点**。

> ⚠️ **Gotcha #3**：`confirmed_facts` 需要支持**追加和撤销**。如果Agent后来发现之前的"已确认根因"是错的，必须有机制更新它，否则错误信息会持续误导后续决策。实现一个 `update_fact(key, old_value, new_value)` 方法，并在摘要中记录"推翻了之前的判断X"。

---

## 二、经验知识库：让Agent"吃一堑，长一智"

### 2.1 核心思想

人类程序员修bug多了会形成**模式直觉**。我们让Agent也具备这种能力——**经验回放**。

每次成功修复后，存储以下结构化经验：

```python
@dataclass
class FixExperience:
    error_signature: str    # "KeyError: 'config' in parser.py:42"
    error_type: str          # "KeyError" —— 用于粗粒度匹配
    root_cause: str          # "字典key拼写错误，应为'configs'"
    fix_pattern: str         # "检查所有dict访问，使用.get()或校验key"
    fix_diff: str            # 具体代码改动
    project_language: str    # "python" —— 避免跨语言误匹配
    success: bool            # 是否通过测试
    timestamp: str           # ISO格式时间戳
```

### 2.2 存储与检索

```python
class ExperienceKB:
    def __init__(self, path: str = ".agent_memory/experiences.json"):
        self.path = Path(path)
        self.path.parent.mkdir(exist_ok=True)
        self.experiences: list[dict] = self._load()

    def save_experience(self, exp: FixExperience):
        # 去重：相同error_signature + root_cause不重复存储
        existing = {hash((e["error_signature"], e["root_cause"]))
                    for e in self.experiences}
        if hash((exp.error_signature, exp.root_cause)) not in existing:
            self.experiences.append(asdict(exp))
            self._flush()

    def retrieve(self, error_msg: str, language: str,
                 top_k: int = 3) -> list[dict]:
        """两阶段检索：先按error_type粗筛，再按关键词精排"""
        # 提取错误类型（如KeyError, TypeError）
        error_type = self._extract_error_type(error_msg)
        candidates = [e for e in self.experiences
                      if e["project_language"] == language
                      and e["error_type"] == error_type]
        
        scored = []
        error_words = set(error_msg.lower().split())
        for exp in candidates:
            sig_words = set(exp["error_signature"].lower().split())
            score = len(error_words & sig_words)  # 交集大小
            if score > 0:
                scored.append((score, exp))
        scored.sort(key=lambda x: -x[0])
        return [e for _, e in scored[:top_k]]
```

> ⚠️ **Gotcha #4**：朴素的字符串匹配会漏掉语义相似但措辞不同的错误。生产环境应升级为向量检索（如用 `sentence-transformers` 对 `error_signature` 编码，存入FAISS）。但作为教学起点，关键词匹配足够展示概念。

> ⚠️ **Gotcha #5**：经验库会无限增长。设置上限（如保留最近500条），或定期清理 `success=False` 的经验——失败模式价值低且可能误导。

### 2.3 注入Agent决策

```python
relevant = kb.retrieve(current_error, language="python")
if relevant:
    context.append({"role": "system", "content":
        f"[历史经验参考]\n{format_experiences(relevant)}\n"
        f"请参考但不要盲从——当前bug可能与历史case表面相似但根因不同。"})
```

> ⚠️ **Gotcha #6**：经验是**参考**而非**指令**。如果注入方式过于强势（如"你必须按此方案修复"），Agent会"拿着锤子看什么都是钉子"。用"参考但不要盲从"的措辞，让Agent保持独立判断。

---

## 三、CLI打包：从Demo到工具

### 3.1 配置文件驱动

```yaml
# .agent_config.yml
project:
  name: "my-flask-app"
  language: "python"
  test_command: "pytest tests/"
  entry_point: "app.py"

agent:
  max_iterations: 15
  model: "gpt-4o"
  context_strategy: "sliding_window"
  max_recent_tokens: 4000
  experience_kb: true

rules:
  forbidden_files: ["__init__.py", "migrations/"]
  preferred_fix_style: "minimal_diff"
```

### 3.2 CLI入口

```python
import argparse, yaml, logging, sys

def main():
    parser = argparse.ArgumentParser(description="🤖 自我修复编程Agent")
    parser.add_argument("--config", default=".agent_config.yml")
    parser.add_argument("--issue", required=True,
                       help="GitHub issue URL或本地文件路径")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--dry-run", action="store_true",
                       help="只分析不修改文件")
    args = parser.parse_args()

    try:
        config = yaml.safe_load(open(args.config))
    except FileNotFoundError:
        print(f"❌ 配置文件 {args.config} 不存在", file=sys.stderr)
        sys.exit(1)

    setup_logging(config, verbose=args.verbose)
    agent = CodingAgent(config, dry_run=args.dry_run)
    
    try:
        result = agent.run(issue=args.issue)
    except KeyboardInterrupt:
        print("\n⚠️ 用户中断，保存当前进度...")
        agent.save_checkpoint()
        sys.exit(130)
    
    print(f"\n{'✅' if result.success else '❌'} {result.summary}")
    print(f"📊 执行轨迹已保存至 .agent_memory/traces/{result.trace_id}.md")
```

> ⚠️ **Gotcha #7**：`--dry-run` 模式至关重要。Agent在分析阶段可能误判，dry-run让用户先审查方案再决定是否执行。生产级Agent应默认dry-run，需显式 `--apply` 才真正修改文件。

### 3.3 执行轨迹可视化

每轮迭代记录结构化日志：

```python
trace_entry = {
    "round": 3,
    "thought": "TypeError提示add()缺少参数，检查调用处...",
    "action": "read_file(main.py:15-20)",
    "observation": "add(x)  # 缺少第二个参数",
    "decision": "修改为 add(x, 0)",
    "context_tokens": 3200,
    "experience_used": True,
    "experience_source": "exp_0017",
    "elapsed_seconds": 4.2
}
```

跑完后生成Markdown报告，包含每轮思考链、操作、token消耗——这是Agent的"体检报告"。

> ⚠️ **Gotcha #8**：轨迹中记录 `experience_source` 极其重要。当Agent给出了错误修复，你需要追溯是哪条历史经验误导了它，然后从知识库中修正或删除该条目——形成闭环反馈。

---

## 四、最终实战：处理真实Issue

把一切组装起来，全流程为：

```
读取Issue → 理解问题描述 → 搜索相关代码 → 定位根因
→ 生成修复方案 → 应用修改 → 运行测试 → 验证通过 → 存入经验库
```

### 4.1 实战建议

1. **选对Issue**：从 `good-first-issue` 标签开始，选有明确报错信息的issue。模糊的"功能请求"不适合作为入门实战。

2. **分阶段验证**：不要让Agent一口气跑完15轮。前3轮观察它是否正确定位代码；如果方向偏了，及时中断并调整system prompt中的项目描述。

3. **失败也是数据**：即使Agent没修好，执行轨迹也能帮你定位瓶颈——是上下文丢失？经验没命中？还是推理偏差？将这些失败case也存入知识库，标记 `success=False`，它们同样有价值。

> 🎯 **这就是你的"成人礼"**：从手搓ReAct循环，到赋予记忆与进化能力，再到打包为可部署工具——你亲手造的不再是一个demo，而是一个**会学习、会记忆、会进化的编程搭档**。

---

## 📌 本单元核心要点

1. **滑动窗口+摘要压缩**需按token计数，关键信息单独无损保留，摘要本身也要有上限管理
2. **经验知识库**需去重、限长、两阶段检索，注入时措辞为"参考"而非"指令"
3. **CLI工具**需配置驱动、dry-run保护、中断恢复、结构化轨迹——这些是demo与工具的分水岭
4. 最终实战串联所有模块——这直接就是Final Project的核心交付物