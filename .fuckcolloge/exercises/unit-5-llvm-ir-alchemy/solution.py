from llvmlite import ir

def translate_expr(expr, builder, env):
    """
    将 Scheme 算术表达式翻译为 LLVM IR 指令，并返回结果值 (ir.Value)。
    
    表达式以 Python 列表形式给出，例如 ['+', 3, 4] 代表 (+ 3 4)。
    支持：
    - 整数常量：直接返回 ir.Constant(ir.IntType(64), value)
    - 变量：字符串，从 env 字典中获取对应的 ir.Value
    - 算术操作：'+', '-', '*', '/'，操作数递归翻译后调用 builder 方法
    
    参数:
        expr: 表达式，可以是 int, str, 或 list
        builder: llvmlite.ir.IRBuilder 实例，用于生成指令
        env: dict，变量名到 ir.Value 的映射
    
    返回:
        ir.Value: 表达式对应的 LLVM 值
    
    示例（伪代码，因为需要完整的模块环境）:
        # 假设已有 module, func, builder, env = {'x': x_val}
        >>> translate_expr(3, builder, env)
        <ir.Constant type='i64' value=3>
        >>> translate_expr(['+', 3, 'x'], builder, env)
        <ir.Instruction 'addtmp' of type 'i64'>
    """
    # TODO: 步骤 1 - 如果 expr 是整数，创建并返回 i64 常量
    # 提示: 使用 isinstance(expr, int) 检查，然后用 ir.Constant(ir.IntType(64), expr)
    
    # TODO: 步骤 2 - 如果 expr 是字符串，从 env 字典中查找并返回对应的值
    # 提示: 使用 isinstance(expr, str) 检查，然后 return env[expr]
    
    # TODO: 步骤 3 - 如果 expr 是列表，提取操作符 (expr[0]) 和操作数 (expr[1:])
    # 操作符可能是 '+', '-', '*', '/'
    # 对每个操作数递归调用 translate_expr 得到 ir.Value
    
    # TODO: 步骤 4 - 根据操作符调用对应的 builder 方法:
    # '+' -> builder.add(left, right, name='addtmp')
    # '-' -> builder.sub(left, right, name='subtmp')
    # '*' -> builder.mul(left, right, name='multmp')
    # '/' -> builder.sdiv(left, right, name='divtmp')
    # 返回生成的指令（它本身也是 ir.Value）
    
    # 占位返回，防止语法错误
    raise NotImplementedError("请完成 translate_expr 的实现")