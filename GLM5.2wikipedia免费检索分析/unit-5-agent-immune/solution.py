def diagnose_error(exc):
    """
    造物主的诊断之眼 —— 异常分类与根因追溯

    你正在构建自我修复 Agent 的"视觉皮层"。当 Agent 执行代码并捕获异常时，
    此函数负责将异常分类并追溯根因，为后续的修复策略选择提供决策依据。

    这是 ReAct 循环中 Observe 阶段的核心组件——没有准确的诊断，
    后续的 Think 和 Act 就是无的放矢。

    分类规则（四层模型）：
    - "syntax":  SyntaxError 及其子类（IndentationError, TabError）
    - "import":  ImportError 及其子类（ModuleNotFoundError）
    - "runtime": Exception 树下的其他运行时异常（NameError, TypeError 等）
    - "system":  BaseException 的非 Exception 子类（SystemExit, KeyboardInterrupt）

    根因追溯规则：
    - 优先沿 __cause__ 链（显式 raise ... from）追溯
    - 若 __cause__ 为 None，沿 __context__ 链（隐式）追溯
    - 若两者皆无，根因即为异常本身

    返回字典格式：
    {
        "category": str,          # 分类标签
        "error_type": str,        # 异常类名
        "message": str,           # 异常消息（str(exc)）
        "root_cause_type": str,   # 根因异常类名
    }

    Examples:
    >>> diagnose_error(SyntaxError("oops"))
    {'category': 'syntax', 'error_type': 'SyntaxError', 'message': 'oops', 'root_cause_type': 'SyntaxError'}

    >>> diagnose_error(ModuleNotFoundError("no module"))
    {'category': 'import', 'error_type': 'ModuleNotFoundError', 'message': 'no module', 'root_cause_type': 'ModuleNotFoundError'}

    >>> diagnose_error(SystemExit(1))
    {'category': 'system', 'error_type': 'SystemExit', 'message': '1', 'root_cause_type': 'SystemExit'}

    >>> root = KeyError("missing")
    >>> wrapper = ValueError("bad")
    >>> wrapper.__cause__ = root
    >>> diagnose_error(wrapper)
    {'category': 'runtime', 'error_type': 'ValueError', 'message': 'bad', 'root_cause_type': 'KeyError'}
    """
    # TODO: Step 1 — 确定异常分类
    # 提示：注意继承层次！判断顺序至关重要：
    #   先判 SyntaxError（覆盖 IndentationError/TabError 子类）
    #   再判 ImportError（覆盖 ModuleNotFoundError 子类）
    #   再判 Exception（覆盖所有普通运行时异常）
    #   最后兜底——属于 BaseException 但不属于 Exception（SystemExit/KeyboardInterrupt）
    # 务必使用 isinstance 而非 type() is，否则子类漏判！
    category = None

    # TODO: Step 2 — 提取异常类型名与消息
    # 提示：type(exc).__name__ 获取类名，str(exc) 获取消息
    error_type = None
    message = None

    # TODO: Step 3 — 追溯根因
    # 提示：先沿 __cause__ 链追溯（显式链，raise...from 产生），
    #       若 __cause__ 为 None，再沿 __context__ 链追溯（隐式链）。
    #       用 while 循环走到链的尽头——根因的 __cause__ 和 __context__ 都为 None。
    #       安全访问：使用 getattr(exc, "__cause__", None)
    #       注意：__cause__ 可能是 None（未设置），也可能是一个异常对象。
    #             只有当它是一个异常对象时，才继续追溯。
    root_cause = exc  # 默认根因是自身

    # TODO: Step 4 — 组装并返回诊断报告
    return {
        "category": category,
        "error_type": error_type,
        "message": message,
        "root_cause_type": type(root_cause).__name__,
    }