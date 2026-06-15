import re
from typing import List, Tuple, Any

def tokenize(code: str) -> List[Tuple[str, Any]]:
    """
    将 Scheme 源代码字符串转换为 Token 列表。

    每个 Token 表示为 (类型, 值) 的元组。支持的类型：
    - 'LPAREN' : '('
    - 'RPAREN' : ')'
    - 'QUOTE'  : "'"
    - 'NUMBER' : 整数 (int) 或浮点数 (float)
    - 'BOOLEAN': True (#t) 或 False (#f)
    - 'IDENTIFIER' : 变量名或操作符 (如 +, square)

    忽略空格、制表符和以分号 ';' 开头的行注释。

    Examples:
        >>> tokenize("(define x 42)")
        [('LPAREN', '('), ('IDENTIFIER', 'define'), ('IDENTIFIER', 'x'), ('NUMBER', 42), ('RPAREN', ')')]

        >>> tokenize("'#t")
        [('QUOTE', "'"), ('BOOLEAN', True)]

        >>> tokenize("; comment\\n(+ 1 2)")
        [('LPAREN', '('), ('IDENTIFIER', '+'), ('NUMBER', 1), ('NUMBER', 2), ('RPAREN', ')')]

        >>> tokenize("-3.14")
        [('NUMBER', -3.14)]
    """
    tokens = []
    # 定义所有 Token 的正则表达式模式，顺序很重要！
    # TODO: 步骤 1 - 定义模式列表，每个元素为 (类型, 正则表达式, 后处理函数或 None)
    # 提示：数字模式 r'-?\d+\.?\d*'，布尔模式 r'#t|#f'，标识符模式 r'[a-zA-Z+\-*/<=>!?][a-zA-Z0-9+\-*/<=>!?]*'
    # 注意：布尔和数字必须放在标识符之前，否则会被标识符抢先匹配。
    patterns = [
        # (类型, 正则, 转换函数)
        # 例如: ('LPAREN', r'\(', None),
        #       ('NUMBER', r'-?\d+\.?\d*', lambda v: float(v) if '.' in v else int(v)),
        # ...
    ]

    # TODO: 步骤 2 - 编译所有正则表达式，并构建一个大的匹配模式（用 '|' 连接），同时记录分组索引与类型的对应关系。
    # 提示：使用 re.compile，并为每个子模式用括号分组。

    # TODO: 步骤 3 - 使用编译后的模式在 code 中迭代查找匹配项（re.finditer 或手动循环）。
    # 对于每个匹配，确定是哪个分组匹配了（group(i) 非空），然后根据类型进行值转换，添加到 tokens 列表。
    # 注意：跳过空白和注释（可以在模式中直接包含注释模式，匹配后不添加到 tokens）。

    # TODO: 步骤 4 - 返回 tokens 列表。
    return tokens