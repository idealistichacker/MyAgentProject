"""
造物主的试炼 —— 自主调试 Agent 核心骨架
=====================================
Phase 1: 统一工具注册表 + 三大核心工具 (read_file / write_file / run_python)
Phase 2: Agent 状态管理 + ReAct 主循环

这是最终项目「手搓一个能自我修复的编程 Agent」的地基。
完成本骨架后，你的 Agent 将能够：
  - 读取项目文件（带行数限制，防止上下文爆炸）
  - 原子写入代码文件（防止崩溃导致文件损坏）
  - 在隔离子进程中执行 Python 并捕获 stdout/stderr
  - 通过 ReAct 循环自主推理、行动、观察，直到修复 Bug 或耗尽重试次数
"""

import os
import re
import json
import subprocess
import tempfile
from typing import Callable, Any, Optional


# ============================================================
# Phase 1: Tool Registry & Core Tools
# ============================================================

class ToolRegistry:
    """统一工具注册表 —— 类似 Scheme 解释器的环境帧。
    
    每个工具是一个绑定 to 名称的可调用过程。
    LLM 通过名称调用工具，Registry 负责查找并执行。
    """
    
    def __init__(self):
        self.tools = {}
    
    def register(self, name: str, func: Callable, description: str, signature: dict = None) -> None:
        """注册一个工具。
        
        Args:
            name: 工具名称（LLM 调用时使用，如 "read_file"）
            func: 可调用对象，接受 kwargs 并返回 str
            description: 工具的语义说明（会出现在 LLM prompt 中）
            signature: 参数类型描述，如 {"filepath": "str", "content": "str"}
        """
        self.tools[name] = {
            "func": func,
            "schema": {
                "name": name,
                "description": description,
                "signature": signature or {}
            }
        }
    
    def execute(self, name: str, args: dict) -> str:
        """按名称执行工具。
        
        如果工具不存在，返回错误字符串（不要抛异常，让 Agent 能继续推理）。
        如果工具内部抛异常，捕获并返回错误字符串。
        
        Returns:
            工具执行结果字符串，或错误信息字符串。
        """
        if name not in self.tools:
            return f"Error: Tool '{name}' not found. Available: {list(self.tools.keys())}"
        try:
            return self.tools[name]["func"](**args)
        except Exception as e:
            return f"Error executing tool '{name}': {str(e)}"
    
    def get_schemas(self) -> list:
        """返回所有工具的 schema 列表，用于构建 LLM prompt。
        
        Returns:
            [{"name": ..., "description": ..., "signature": ...}, ...]
        """
        return [info["schema"] for info in self.tools.values()]


def make_read_file_tool(max_lines: int = 100) -> Callable:
    """工厂函数：返回一个带行数限制的 read_file 工具。
    
    边缘情况处理：
    - 文件不存在 → 返回错误字符串
    - 文件超过 max_lines 且未指定 end_line → 截断并附加提示
    - 返回带行号的内容，方便 LLM 定位
    """
    def read_file(filepath: str, start_line: int = 1, end_line: int = None) -> str:
        """读取文件内容，带行号。
        
        Args:
            filepath: 文件路径
            start_line: 起始行号（从 1 开始）
            end_line: 结束行号（None 表示读到文件末尾）
        
        Returns:
            带行号的内容字符串。如果被截断，附加提示：
            "[TRUNCATED] File has N lines. Use start_line/end_line to read specific sections."
        """
        if not os.path.exists(filepath):
            return f"Error: File '{filepath}' not found."
        
        try:
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
        except Exception as e:
            return f"Error reading file '{filepath}': {str(e)}"
            
        total_lines = len(lines)
        if start_line < 1:
            start_line = 1
            
        if start_line > total_lines:
            return f"[INFO] File has {total_lines} lines. start_line {start_line} is out of range."
            
        if end_line is None:
            end_line = start_line + max_lines - 1
            is_truncated = (total_lines > end_line)
        else:
            if end_line > total_lines:
                end_line = total_lines
            is_truncated = False
            
        if end_line < start_line:
            end_line = start_line
            
        sliced_lines = lines[start_line - 1 : end_line]
        output_lines = []
        for idx, line in enumerate(sliced_lines):
            line_num = start_line + idx
            clean_line = line.rstrip('\r\n')
            output_lines.append(f"  {line_num}| {clean_line}")
            
        result = "\n".join(output_lines)
        if is_truncated:
            result += f"\n[TRUNCATED] File has {total_lines} lines. Use start_line/end_line to read specific sections."
        return result
    
    return read_file


def make_write_file_tool() -> Callable:
    """工厂函数：返回一个带原子写入的 write_file 工具。
    
    原子写入策略：
    1. 写入同目录下的临时文件（.tmp 后缀）
    2. 调用 os.replace(tmp, target) 原子替换
    os.replace 是 POSIX 原子操作，确保目标文件要么是旧内容要么是完整新内容。
    """
    def write_file(filepath: str, content: str) -> str:
        """原子写入文件。
        
        Args:
            filepath: 目标文件路径
            content: 要写入的内容
        
        Returns:
            确认消息，如 "Successfully wrote N bytes to {filepath}"
        """
        try:
            dir_name = os.path.dirname(os.path.abspath(filepath))
            if not os.path.exists(dir_name):
                os.makedirs(dir_name, exist_ok=True)
                
            # NamedTemporaryFile delete=False, and close it manually to avoid file locks on Windows
            with tempfile.NamedTemporaryFile('w', dir=dir_name, delete=False, suffix='.tmp', encoding='utf-8') as tmp_file:
                tmp_file.write(content)
                tmp_path = tmp_file.name
                
            os.replace(tmp_path, filepath)
            bytes_written = len(content.encode('utf-8'))
            return f"Successfully wrote {bytes_written} bytes to {filepath}"
        except Exception as e:
            return f"Error writing file '{filepath}': {str(e)}"
    
    return write_file


def make_run_python_tool(timeout: int = 10) -> Callable:
    """工厂函数：返回一个在隔离子进程中执行 Python 的工具。
    
    架构要求：绝对不能在 Agent 主进程中使用 exec()！
    必须使用 subprocess.run 在独立进程中执行。
    """
    def run_python(filepath: str) -> str:
        """在子进程中执行 Python 文件。
        
        Args:
            filepath: 要执行的 .py 文件路径
        
        Returns:
            格式化的执行结果字符串：
            "EXIT_CODE: {code}\nSTDOUT:\n{stdout}\nSTDERR:\n{stderr}"
            
        如果超时，返回超时错误信息。
        """
        import sys
        if not os.path.exists(filepath):
            return f"Error: File '{filepath}' not found."
            
        try:
            result = subprocess.run(
                [sys.executable, filepath],
                capture_output=True,
                text=True,
                timeout=timeout,
                errors='replace'
            )
            return f"EXIT_CODE: {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        except subprocess.TimeoutExpired as e:
            stdout = e.stdout or ""
            stderr = e.stderr or ""
            if isinstance(stdout, bytes):
                stdout = stdout.decode('utf-8', errors='replace')
            if isinstance(stderr, bytes):
                stderr = stderr.decode('utf-8', errors='replace')
            return f"Error: Execution timed out after {timeout} seconds. STDOUT:\n{stdout}\nSTDERR:\n{stderr}"
        except Exception as e:
            return f"Error running python script '{filepath}': {str(e)}"
            
    return run_python


def build_default_registry() -> ToolRegistry:
    """构建包含三大核心工具的默认注册表。
    
    Returns:
        配置好的 ToolRegistry 实例，包含:
        - "read_file": make_read_file_tool(max_lines=100)
        - "write_file": make_write_file_tool()
        - "run_python": make_run_python_tool(timeout=10)
    """
    registry = ToolRegistry()
    
    registry.register(
        name="read_file",
        func=make_read_file_tool(max_lines=100),
        description="Read a file with line numbers. Use start_line/end_line for large files.",
        signature={"filepath": "str", "start_line": "int", "end_line": "int"}
    )
    
    registry.register(
        name="write_file",
        func=make_write_file_tool(),
        description="Write content to a file atomically.",
        signature={"filepath": "str", "content": "str"}
    )
    
    registry.register(
        name="run_python",
        func=make_run_python_tool(timeout=10),
        description="Execute a Python file in an isolated subprocess and return stdout/stderr.",
        signature={"filepath": "str"}
    )
    
    return registry


# ============================================================
# Phase 2: Agent State & ReAct Loop
# ============================================================

class AgentState:
    """Agent 的短期记忆与状态管理。
    
    核心职责：
    1. 维护迭代历史（Reason, Action, Observation 序列）
    2. 滑动窗口管理（防止上下文爆炸）
    3. 重复行为检测（防止死循环）
    4. 终止条件判断（重试耗尽或任务完成）
    """
    
    def __init__(self, task: str, max_retries: int = 10, window_size: int = 5):
        self.current_task = task
        self.max_retries = max_retries
        self.retries_left = max_retries
        self.window_size = window_size
        self.history = []          # [{"role": "observation"|"action"|"error"|"summary", "content": ...}]
        self.last_actions = []     # 最近 N 个 action 签名，用于重复检测
        self._done = False         # 任务是否完成
    
    def add_observation(self, content: str) -> None:
        """添加一条观察记录到历史。"""
        self.history.append({"role": "observation", "content": content})
    
    def add_action(self, tool_name: str, args: dict, result: str) -> None:
        """记录一次完整的 Action（工具调用 + 结果），并更新重复检测缓冲区。
        
        同时递减 retries_left。
        """
        self.history.append({"role": "action", "content": json.dumps({"tool": tool_name, "args": args})})
        self.history.append({"role": "observation", "content": result})
        
        sig = json.dumps({"tool": tool_name, "args": args}, sort_keys=True)
        self.last_actions.append(sig)
        if len(self.last_actions) > 10:
            self.last_actions = self.last_actions[-10:]
            
        self.retries_left -= 1
    
    def mark_done(self) -> None:
        """标记任务完成。"""
        self._done = True
    
    def is_done(self) -> bool:
        """判断 Agent 是否应停止循环。
        
        终止条件：
        1. _done 被标记为 True
        2. retries_left <= 0
        """
        return self._done or self.retries_left <= 0
    
    def detect_repeat(self, threshold: int = 3) -> bool:
        """检测最近 threshold 次 action 是否完全相同。
        
        Args:
            threshold: 连续重复多少次触发检测
        
        Returns:
            True 如果最近 threshold 个 action 签名完全相同
        """
        if len(self.last_actions) < threshold:
            return False
        recent = self.last_actions[-threshold:]
        return len(set(recent)) == 1
    
    def get_context_for_llm(self) -> list:
        """返回经过滑动窗口处理 of history，用于构建 LLM prompt。
        
        策略：
        - 保留最近 window_size*2 条记录（每轮交互约 2 条：action + observation）
        - 更早的历史替换为一条摘要记录（这里用占位符，实际项目可调用 LLM 生成摘要）
        
        Returns:
            处理后的 history 列表
        """
        if len(self.history) <= self.window_size * 2:
            return self.history.copy()
            
        omitted_count = len(self.history) - self.window_size * 2
        summary_entry = {
            "role": "summary",
            "content": f"[Earlier history: {omitted_count} entries omitted]"
        }
        return [summary_entry] + self.history[-self.window_size*2:]


def parse_llm_response(response: str) -> tuple:
    """解析 LLM 响应，提取工具调用。
    
    处理以下情况：
    1. 响应包含  ...  代码块 → 提取 JSON
    2. 响应直接是 JSON 字符串 → 直接解析
    3. 响应不包含工具调用 → 返回 (None, None)
    
    JSON 格式期望: {"tool": "tool_name", "args": {...}}
    
    Returns:
        (tool_name, args_dict) 或 (None, None)
    
    Raises:
        ValueError: 如果找到 JSON 但格式不合法
    """
    # 提取 Markdown 格式的代码块
    match = re.search(r'```(?:json)?\s*(.*?)\s*```', response, re.DOTALL)
    if match:
        json_str = match.group(1).strip()
        try:
            data = json.loads(json_str)
            return data.get("tool"), data.get("args", {})
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON format in code block: {e}")
            
    if '{' in response:
        try:
            data = json.loads(response.strip())
            return data.get("tool"), data.get("args", {})
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON format: {e}")
            
    return None, None


def build_prompt(state: AgentState, registry: ToolRegistry) -> str:
    """构建发送给 LLM 的 prompt。
    
    Prompt 结构：
    1. System: 你是一个自主调试 Agent。当前任务: {task}
    2. 可用工具列表（从 registry.get_schemas() 获取）
    3. 历史交互（从 state.get_context_for_llm() 获取）
    4. 指令: 分析当前状态，决定下一步行动。返回 JSON: {"tool": "...", "args": {...}}
            如果任务已完成，返回纯文本说明（不包含 JSON）。
    """
    prompt_parts = []
    prompt_parts.append(f"System: 你是一个自主调试 Agent。当前任务: {state.current_task}")
    
    prompt_parts.append("\n可用工具列表:")
    schemas = registry.get_schemas()
    for s in schemas:
        prompt_parts.append(f"- 名称: {s['name']}\n  描述: {s['description']}\n  参数签名: {s['signature']}")
        
    prompt_parts.append("\n历史交互:")
    context = state.get_context_for_llm()
    for entry in context:
        role = entry["role"]
        content = entry["content"]
        prompt_parts.append(f"[{role.upper()}]: {content}")
        
    prompt_parts.append(
        "\n指令: 分析当前状态，决定下一步行动。返回包含工具调用的 JSON 格式:\n"
        "```json\n"
        "{\n"
        "  \"tool\": \"工具名称\",\n"
        "  \"args\": {\"参数名\": \"参数值\"}\n"
        "}\n"
        "```\n"
        "如果任务已完成且无需调用工具，请直接返回纯文本说明（不包含 JSON）。"
    )
    
    return "\n".join(prompt_parts)


def react_loop(state: AgentState, registry: ToolRegistry, llm_client: Callable[[str], str],
               max_iterations: int = 10) -> AgentState:
    """ReAct 主循环：Observe → Think → Act → Observe。
    
    这是 Agent 的心脏。每一轮迭代：
    1. 构建 prompt（当前状态 + 工具列表 + 历史）
    2. 调用 LLM 获取响应
    3. 解析响应，提取工具调用
    4. 如果没有工具调用 → LLM 认为任务完成，标记 done
    5. 如果有工具调用 → 通过 registry 执行
    6. 将结果记录到 state
    7. 检查重复行为 → 如果检测到重复，注入策略变更提示
    8. 检查终止条件 → is_done() 或达到 max_iterations
    
    Args:
        state: Agent 状态对象
        registry: 工具注册表
        llm_client: 接受 prompt 字符串、返回响应字符串的可调用对象
        max_iterations: 安全阀，防止无限循环
    
    Returns:
        最终的 AgentState
    """
    for iteration in range(max_iterations):
        if state.is_done():
            break
            
        # 1. 构建 prompt
        prompt = build_prompt(state, registry)
        
        # 2. 调用 LLM
        response = llm_client(prompt)
        
        # 3. 解析响应
        try:
            tool_name, args = parse_llm_response(response)
        except ValueError as e:
            state.add_observation(f"Error parsing LLM response: {e}")
            continue
            
        # 4. 没有工具调用 → 任务完成
        if tool_name is None:
            state.mark_done()
            break
            
        # 5. 执行工具
        result = registry.execute(tool_name, args)
        
        # 6. 记录到状态
        state.add_action(tool_name, args, result)
        
        # 7. 重复检测
        if state.detect_repeat(threshold=3):
            state.add_observation(
                "[SYSTEM] You have repeated the same action 3 times. "
                "Try a completely different debugging strategy."
            )
            
        # 8. 终止检查
        if state.is_done():
            break
            
    return state
