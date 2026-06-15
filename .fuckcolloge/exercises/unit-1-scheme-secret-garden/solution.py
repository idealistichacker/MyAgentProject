def eval_prefix(expr: str) -> int:
    """
    Evaluate a fully parenthesized prefix arithmetic expression.

    The expression contains only integers and the operators '+', '-', '*', '/'.
    Division is integer division (truncating toward zero).
    You may assume the input is syntactically valid.

    Examples:
    >>> eval_prefix("(+ 1 2)")
    3
    >>> eval_prefix("(* (+ 2 3) 4)")
    20
    >>> eval_prefix("(/ 10 3)")
    3
    >>> eval_prefix("(+ -5 (* 2 3))")
    1
    >>> eval_prefix("(+ 1 2 3 4)")
    10

    :param expr: string of the prefix expression, e.g. "(+ 1 2)"
    :return: integer result of evaluating the expression
    """
    # Step 1: Tokenize the input string.
    # Replace '(' with ' ( ' and ')' with ' ) ' so that split() works cleanly.
    # TODO: tokenize expr into a list of strings (tokens)
    tokens = []

    # Step 2: Parse the flat token list into a nested list structure (AST).
    # Use a recursive helper that consumes tokens from an iterator.
    # TODO: implement parse_tokens(tokens_iter) that returns a list or an int atom
    def parse_tokens(it):
        # TODO: get next token
        # if token is '(', start a new list and collect items until ')'
        # if token is ')', should not happen at top level (or you can raise error)
        # otherwise, it's an atom: try to convert to int, else keep as string (operator)
        pass

    # Step 3: Evaluate the parsed AST recursively.
    # TODO: implement eval_ast(ast)
    # If ast is an int, return it.
    # If ast is a list, first element is the operator, rest are operands.
    # Recursively evaluate operands, then apply the operator (use a loop or reduce).
    def eval_ast(ast):
        pass

    # Step 4: Wire everything together.
    # TODO: tokenize, parse, then evaluate and return the result.
    return 0