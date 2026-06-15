def eval_simple(expr, env):
    """
    Evaluate a simple Scheme-like expression using Python lists as AST.
    
    Supports:
    - integers (self-evaluating)
    - strings (symbols, looked up in env dict)
    - lists of the form [operator, operand1, operand2] where operator is a string
      for '+', '-', '*', '/'. Operands can be integers, symbols, or nested lists.
    
    Examples:
    >>> eval_simple(42, {})
    42
    >>> eval_simple('x', {'x': 10})
    10
    >>> eval_simple(['+', 1, 2], {})
    3
    >>> eval_simple(['+', 1, ['*', 2, 3]], {})
    7
    """
    # Step 1: 如果 expr 是整数，直接返回（自求值）
    if isinstance(expr, int):
        return expr
    
    # Step 2: 如果 expr 是字符串，从 env 字典中查找并返回
    if isinstance(expr, str):
        return env[expr]  # 假设符号一定存在，否则 KeyError
    
    # Step 3: 如果 expr 是列表（组合表达式）
    if isinstance(expr, list):
        # a. 提取操作符和操作数
        op = expr[0]
        operands = expr[1:]
        
        # b. 递归求值所有操作数
        args = [eval_simple(e, env) for e in operands]
        
        # c. 根据操作符执行相应的 Python 运算
        if op == '+':
            return args[0] + args[1]
        elif op == '-':
            return args[0] - args[1]
        elif op == '*':
            return args[0] * args[1]
        elif op == '/':
            return args[0] / args[1]  # 浮点除法
        else:
            raise ValueError(f"Unknown operator: {op}")
    
    # Step 4: 未知类型，抛出异常
    raise TypeError(f"Cannot evaluate: {expr}")