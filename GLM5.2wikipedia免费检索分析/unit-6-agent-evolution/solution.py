class ContextManager:
    """Agent的工作记忆管理器——滑动窗口+摘要压缩的核心引擎。

    在ReAct循环中，Agent每轮产生 Thought→Action→Observation。
    当对话堆积，早期关键决策会被挤出上下文窗口——Agent"失忆"了。
    ContextManager 让Agent保留近期消息原文，将旧消息压缩为摘要，
    确保关键决策不被遗忘。

    简化说明：
        - token计数：1 word = 1 token，每条消息额外 +4 tokens 结构开销
        - 压缩格式："[role] content[:50]"，多条用 " -> " 连接
        - 摘要作为 system 消息注入，content 以 "[SUMMARY] " 开头

    Examples:
        >>> cm = ContextManager(max_recent_tokens=1000)
        >>> cm.add({"role": "user", "content": "Fix bug in main.py"})
        >>> cm.add({"role": "assistant", "content": "Reading main.py"})
        >>> ctx = cm.build_context()
        >>> len(ctx)
        2

        >>> cm = ContextManager(max_recent_tokens=15)
        >>> cm.add({"role": "user", "content": "hello world from agent"})
        >>> cm.add({"role": "assistant", "content": "I will help"})
        >>> cm.add({"role": "user", "content": "please fix it"})
        >>> cm.summary != ""
        True

        >>> cm2 = ContextManager()
        >>> cm2.recent_messages = [{"role": "user", "content": "old msg"}, {"role": "assistant", "content": "old reply"}]
        >>> cm2._compress()
        >>> cm2.summary
        '[user] old msg -> [assistant] old reply'
    """

    def __init__(self, max_recent_tokens: int = 4000):
        self.recent_messages: list[dict] = []
        self.summary: str = ""
        self.max_recent_tokens = max_recent_tokens

    def _count_tokens(self, messages: list[dict]) -> int:
        """计算消息列表的token数。

        规则：每条消息的 token 数 = content 的单词数 + 4（结构开销）。
        对所有消息求和返回总数。

        Examples:
            >>> cm = ContextManager()
            >>> cm._count_tokens([{"role": "user", "content": "hello world"}])
            6
            >>> cm._count_tokens([{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hey"}])
            10
        """
        # TODO: Step 1 - 遍历 messages 中每条消息
        # TODO: Step 2 - 对每条消息，计算 content.split() 的单词数，再加 4
        # TODO: Step 3 - 累加所有消息的 token 数并返回
        pass

    def add(self, message: dict):
        """添加一条消息到工作记忆。如果总 token 数超过上限，触发压缩。

        压缩循环：只要 token 数超限且 recent_messages 超过2条，
        就持续调用 _compress()，直到不超限或只剩2条以下。

        Examples:
            >>> cm = ContextManager(max_recent_tokens=100)
            >>> cm.add({"role": "user", "content": "test"})
            >>> len(cm.recent_messages)
            1
            >>> cm.summary
            ''
        """
        # TODO: Step 1 - 将 message 追加到 self.recent_messages
        # TODO: Step 2 - 进入 while 循环：条件为 _count_tokens(self.recent_messages) > self.max_recent_tokens 且 len(self.recent_messages) > 2
        # TODO: Step 3 - 循环体内调用 self._compress()
        pass

    def _compress(self):
        """将最旧的2条消息压缩进摘要，从 recent_messages 中移除。

        压缩格式：每条消息格式化为 "[role] content[:50]"，
        多条之间用 " -> " 连接。
        如果已有摘要，新压缩内容追加到旧摘要后面（用 " -> " 连接）。

        Examples:
            >>> cm = ContextManager()
            >>> cm.recent_messages = [{"role": "user", "content": "old msg"}, {"role": "assistant", "content": "old reply"}]
            >>> cm._compress()
            >>> cm.summary
            '[user] old msg -> [assistant] old reply'
            >>> len(cm.recent_messages)
            0

            >>> cm2 = ContextManager()
            >>> cm2.summary = "[user] first"
            >>> cm2.recent_messages = [{"role": "assistant", "content": "second"}, {"role": "user", "content": "third"}]
            >>> cm2._compress()
            >>> cm2.summary
            '[user] first -> [assistant] second -> [user] third'
        """
        # TODO: Step 1 - 取出 self.recent_messages 的前2条作为待压缩消息
        # TODO: Step 2 - 从 self.recent_messages 中移除这2条（保留剩余的）
        # TODO: Step 3 - 将待压缩消息格式化：每条变为 "[role] content[:50]"
        # TODO: Step 4 - 用 " -> " 连接所有格式化后的字符串，得到 new_part
        # TODO: Step 5 - 如果 self.summary 非空，设为 self.summary + " -> " + new_part；否则设为 new_part
        pass

    def build_context(self) -> list[dict]:
        """构建最终发送给LLM的上下文消息列表。

        结构：如果摘要非空，第一条为 system 消息 {"role": "system", "content": "[SUMMARY] {摘要}"}，
        然后依次追加 recent_messages 中的所有消息。

        Examples:
            >>> cm = ContextManager()
            >>> cm.add({"role": "user", "content": "hello"})
            >>> ctx = cm.build_context()
            >>> len(ctx)
            1
            >>> ctx[0]["role"]
            'user'

            >>> cm2 = ContextManager()
            >>> cm2.summary = "previous context"
            >>> cm2.recent_messages = [{"role": "user", "content": "new msg"}]
            >>> ctx2 = cm2.build_context()
            >>> ctx2[0]["role"]
            'system'
            >>> "[SUMMARY]" in ctx2[0]["content"]
            True
            >>> ctx2[1]["content"]
            'new msg'
        """
        # TODO: Step 1 - 创建空列表 context = []
        # TODO: Step 2 - 如果 self.summary 非空，追加 {"role": "system", "content": f"[SUMMARY] {self.summary}"}
        # TODO: Step 3 - 将 self.recent_messages 中的所有消息追加到 context
        # TODO: Step 4 - 返回 context
        pass