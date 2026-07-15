# import json
# import re


# def parse_llm_response(raw_text: str) -> dict:
#     """
#     【造物主的神经通路 · 第一层：感知】
#     从 LLM（你的造物 "Adam"）的原始文本输出中提取并解析 JSON。
#     Adam 有时会用 Markdown 代码块包裹 JSON，有时会输出不完整的 JSON。
#     你需要像一个严谨的造物主一样，从混沌中提取秩序。

#     当解析成功时，返回解析后的字典。
#     当解析失败时，返回 {"action": "error", "message": "JSON 解析失败: ..."}。

#     Examples:
#     >>> parse_llm_response('{"action": "finish", "summary": "done"}')
#     {'action': 'finish', 'summary': 'done'}
#     >>> parse_llm_response('\\n{"action": "write_code", "code": "x=1"}\\n')
#     {'action': 'write_code', 'code': 'x=1'}
#     >>> parse_llm_response('\\n{"action": "explain_concept", "explanation": "hi"}\\n')
#     {'action': 'explain_concept', 'explanation': 'hi'}
#     >>> parse_llm_response('not json at all')
#     {'action': 'error', 'message': 'JSON 解析失败: ...'}
#     """
#     # TODO: Step 1 - 清理 Markdown 代码块包裹
#     # 使用正则表达式匹配  ...  或  ...  格式
#     # 关键提示：JSON 内部可能包含换行符，必须使用 [\s\S]*? 进行非贪婪匹配
#     # 如果匹配成功，将 raw_text 替换为提取出的纯 JSON 文本

#     # TODO: Step 2 - 尝试使用 json.loads() 解析清理后的文本
#     # 记得先 .strip() 去除首尾空白

#     # TODO: Step 3 - 如果 json.loads 抛出 JSONDecodeError，捕获异常
#     # 返回错误字典：{"action": "error", "message": f"JSON 解析失败: {str(e)}. 原始输出: {raw_text[:100]}"}

#     pass


# def execute_action(action_dict: dict) -> str:
#     """
#     【造物主的神经通路 · 第二层：行动】
#     根据解析出的行动字典，分发到对应的处理函数并返回执行结果。
#     这是 Agent 的"运动神经"——将思维转化为行动。

#     支持的行动类型：
#     - "write_code": 返回 "已成功生成 {language} 代码，共 {n} 行。"
#       其中 language 从 "language" 字段获取（默认 "python"），
#       n 是 "code" 字段按 splitlines() 分割后的行数
#     - "explain_concept": 返回 "概念解释：{explanation}"
#       explanation 从 "explanation" 字段获取（默认 "无内容"）
#     - "finish": 返回 "任务完成：{summary}"
#       summary 从 "summary" 字段获取（默认空字符串）
#     - 未知类型: 返回 "未知行动类型: {action}"

#     Examples:
#     >>> execute_action({"action": "write_code", "language": "python", "code": "print(1)\\nprint(2)"})
#     '已成功生成 python 代码，共 2 行。'
#     >>> execute_action({"action": "finish", "summary": "所有bug已修复"})
#     '任务完成：所有bug已修复'
#     >>> execute_action({"action": "explain_concept", "explanation": "递归是函数调用自身"})
#     '概念解释：递归是函数调用自身'
#     >>> execute_action({"action": "dance"})
#     '未知行动类型: dance'
#     """
#     # TODO: Step 1 - 从 action_dict 中获取 "action" 字段
#     # 提示：使用 .get() 方法，默认值设为空字符串

#     # TODO: Step 2 - 根据 action 类型进行分发处理
#     # 你可以用 if/elif/else 链，也可以用字典分发模式（更优雅）
#     # 推荐尝试字典分发：定义一个 {action_type: handler_function} 的映射

#     # TODO: Step 3 - 对每种行动类型，提取所需字段并构造返回字符串
#     # write_code: 需要 "language"（默认 "python"）和 "code"（默认 ""）
#     # explain_concept: 需要 "explanation"（默认 "无内容"）
#     # finish: 需要 "summary"（默认 ""）

#     # TODO: Step 4 - 处理未知行动类型，返回 "未知行动类型: {action}"

#     pass


import json
import re


def parse_llm_response(raw_text: str) -> dict:
    """
    【造物主的神经通路 · 第一层：感知】
    从 LLM（你的造物 "Adam"）的原始文本输出中提取并解析 JSON。
    """
    # TODO: Step 1 - 清理 Markdown 代码块包裹
    # 使用正则表达式匹配 ```json ... ``` 或 ``` ... ``` 格式
    # [\s\S]*? 表示匹配包含换行符在内的任意字符，且为非贪婪匹配
    pattern = r"```(?:json)?\s*([\s\S]*?)\s*```"
    match = re.search(pattern, raw_text)

    if match:
        # 如果匹配成功，提取出捕获组里的纯 JSON 文本
        json_text = match.group(1)
    else:
        # 如果没有 Markdown 包裹，则直接使用原始文本
        json_text = raw_text

    # TODO: Step 2 - 尝试使用 json.loads() 解析清理后的文本
    # 记得先 .strip() 去除首尾空白
    clean_text = json_text.strip()

    try:
        return json.loads(clean_text)
    # TODO: Step 3 - 如果 json.loads 抛出 JSONDecodeError，捕获异常
    except json.JSONDecodeError as e:
        # 返回错误字典，并截取前100个字符避免日志过长
        return {
            "action": "error",
            "message": f"JSON 解析失败: {str(e)}. 原始输出: {raw_text[:100]}",
        }


def execute_action(action_dict: dict) -> str:
    """
    【造物主的神经通路 · 第二层：行动】
    根据解析出的行动字典，分发到对应的处理函数并返回执行结果。
    """
    # TODO: Step 1 - 从 action_dict 中获取 "action" 字段
    action_type = action_dict.get("action", "")

    # TODO: Step 3 - 对每种行动类型，提取所需字段并构造返回字符串
    # 我们先定义好各个具体 Action 的处理器（Handlers）
    def handle_write_code(data: dict) -> str:
        language = data.get("language", "python")
        code = data.get("code", "")
        # 按 splitlines() 分割后计算行数，如果是空字符串则行数为 0
        lines_count = len(code.splitlines()) if code else 0
        return f"已成功生成 {language} 代码，共 {lines_count} 行。"

    def handle_explain_concept(data: dict) -> str:
        explanation = data.get("explanation", "无内容")
        return f"概念解释：{explanation}"

    def handle_finish(data: dict) -> str:
        summary = data.get("summary", "")
        return f"任务完成：{summary}"

    # TODO: Step 2 - 使用字典分发模式（优雅地映射 action_type -> handler）
    handler_map = {
        "write_code": handle_write_code,
        "explain_concept": handle_explain_concept,
        "finish": handle_finish,
    }

    # 执行分发逻辑
    handler = handler_map.get(action_type)

    if handler:
        return handler(action_dict)
    else:
        # TODO: Step 4 - 处理未知行动类型
        return f"未知行动类型: {action_type}"