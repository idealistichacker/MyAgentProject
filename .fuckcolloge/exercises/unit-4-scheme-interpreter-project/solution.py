"""
🏰 Mini Scheme Interpreter — 圣殿骨架
完成所有 TODO 标记的部分，让你的 Scheme 活过来！
"""

import sys
import math

# ---------- 基础数据结构 ----------

class nil:
    """空链表标记"""
    def __repr__(self):
        return 'nil'
    def __eq__(self, other):
        return isinstance(other, nil)

nil = nil()  # 单例

class Pair:
    """Scheme 的 cons 单元"""
    def __init__(self, first, second):
        self.first = first
        self.second = second
    def __repr__(self):
        return f'Pair({self.first}, {self.second})'
    def __eq__(self, other):
        if not isinstance(other, Pair):
            return False
        return self.first == other.first and self.second == other.second

# ---------- 环境模型 ----------

class Frame:
    """一个帧，存储变量绑定，并链接到父帧"""
    def __init__(self, parent=None):
        self.bindings = {}   # 符号 → 值
        self.parent = parent # 父帧（词法作用域链）

    def define(self, symbol, value):
        """在当前帧绑定 symbol 到 value"""
        # *** YOUR CODE HERE *** (Phase 3)
        pass

    def lookup(self, symbol):
        """沿父帧链查找 symbol 的值；找不到则抛出 KeyError"""
        # *** YOUR CODE HERE *** (Phase 3)
        pass

    def make_child_frame(self, formals, args):
        """创建一个子帧，将形参 formals 绑定到实参 args，父帧为 self"""
        child = Frame(self)
        if len(formals) != len(args):
            raise Exception("参数数量不匹配")
        for f, a in zip(formals, args):
            child.define(f, a)
        return child

# ---------- 过程表示 ----------

class LambdaProcedure:
    """用户定义的 lambda 过程"""
    def __init__(self, formals, body, env):
        self.formals = formals  # 形参列表 (Pair)
        self.body = body        # 过程体 (Pair)
        self.env = env          # 定义时的环境（闭包关键！）

class PrimitiveProcedure:
    """内置过程，包装一个 Python 函数"""
    def __init__(self, fn, name='primitive'):
        self.fn = fn
        self.name = name
    def apply(self, args):
        return self.fn(*args)

# ---------- 简易 Reader（已提供） ----------

def tokenize(s):
    """将字符串转为 token 列表"""
    return s.replace('(', ' ( ').replace(')', ' ) ').split()

def read_tokens(tokens):
    """从 token 列表递归构建 Pair 结构"""
    if not tokens:
        raise SyntaxError('unexpected EOF')
    token = tokens.pop(0)
    if token == '(':
        L = []
        while tokens[0] != ')':
            L.append(read_tokens(tokens))
        tokens.pop(0)  # 弹出 ')'
        return make_list(L)
    elif token == ')':
        raise SyntaxError('unexpected )')
    else:
        return parse_atom(token)

def parse_atom(token):
    """将 token 转为 Python 原子值"""
    if token == '#t':
        return True
    if token == '#f':
        return False
    if token == 'nil':
        return nil
    try:
        return int(token)
    except ValueError:
        try:
            return float(token)
        except ValueError:
            return token  # 符号

def make_list(elements):
    """将 Python 列表转为 Pair 链表"""
    if not elements:
        return nil
    return Pair(elements[0], make_list(elements[1:]))

def read_line(s):
    """读取一行 Scheme 表达式，返回 Pair AST"""
    tokens = tokenize(s)
    if not tokens:
        return None
    expr = read_tokens(tokens)
    return expr

# ---------- 全局环境与内置过程 ----------

def make_global_env():
    """创建全局环境并注册内置过程"""
    env = Frame()
    # 算术
    env.define('+', PrimitiveProcedure(lambda *args: sum(args), '+'))
    env.define('-', PrimitiveProcedure(lambda x, *args: x - sum(args) if args else -x, '-'))
    env.define('*', PrimitiveProcedure(lambda *args: math.prod(args), '*'))
    env.define('/', PrimitiveProcedure(lambda x, y: x // y, '/'))
    # 比较
    env.define('=', PrimitiveProcedure(lambda x, y: x == y, '='))
    env.define('<', PrimitiveProcedure(lambda x, y: x < y, '<'))
    env.define('>', PrimitiveProcedure(lambda x, y: x > y, '>'))
    # 列表操作
    env.define('cons', PrimitiveProcedure(lambda x, y: Pair(x, y), 'cons'))
    env.define('car', PrimitiveProcedure(lambda p: p.first, 'car'))
    env.define('cdr', PrimitiveProcedure(lambda p: p.second, 'cdr'))
    env.define('list', PrimitiveProcedure(lambda *args: make_list(list(args)), 'list'))
    env.define('null?', PrimitiveProcedure(lambda x: x == nil, 'null?'))
    # 其他
    env.define('display', PrimitiveProcedure(lambda x: print(x), 'display'))
    env.define('begin', None)  # 特殊形式，占位
    return env

global_env = make_global_env()

# ---------- 特殊形式分发表 ----------

SPECIAL_FORMS = {}

def special_form(name):
    """装饰器：注册特殊形式"""
    def decorator(fn):
        SPECIAL_FORMS[name] = fn
        return fn
    return decorator

# ---------- 特殊形式实现（TODO） ----------

@special_form('quote')
def do_quote_form(expressions, env):
    """(quote expr) → 返回 expr 不求值"""
    # *** YOUR CODE HERE *** (Phase 2)
    pass

@special_form('define')
def do_define_form(expressions, env):
    """
    (define var expr) 或 (define (name params...) body...)
    """
    # *** YOUR CODE HERE *** (Phase 2)
    pass

@special_form('lambda')
def do_lambda_form(expressions, env):
    """
    (lambda (params...) body...) → LambdaProcedure
    务必捕获当前环境 env！
    """
    # *** YOUR CODE HERE *** (Phase 2)
    pass

@special_form('if')
def do_if_form(expressions, env):
    """
    (if pred conseq alt) → 短路求值
    """
    # *** YOUR CODE HERE *** (Phase 2)
    pass

@special_form('begin')
def do_begin_form(expressions, env):
    """顺序求值，返回最后一个的值"""
    return eval_all(expressions, env)

# ---------- 核心求值引擎（TODO） ----------

def scheme_eval(expr, env):
    """
    在环境 env 中求值表达式 expr。
    返回 Python 值。
    """
    # *** YOUR CODE HERE *** (Phase 1)
    # 提示：
    # - 自求值：int, float, bool, nil → 直接返回
    # - 符号：env.lookup(expr)
    # - Pair：检查首元素是否为特殊形式关键字，若是则分派；
    #   否则求值 operator 和 operands，调用 scheme_apply
    pass

def scheme_apply(procedure, args, env):
    """
    将过程 procedure 应用到实参列表 args。
    """
    # *** YOUR CODE HERE *** (Phase 1)
    # 提示：
    # - PrimitiveProcedure：调用 procedure.apply(args)
    # - LambdaProcedure：创建新帧（父帧为 procedure.env），
    #   绑定形参到实参，然后 eval_all 过程体
    pass

def eval_all(expressions, env):
    """依次求值 expressions 列表，返回最后一个的值"""
    if expressions == nil:
        return nil
    result = None
    while expressions != nil:
        result = scheme_eval(expressions.first, env)
        expressions = expressions.second
    return result

# ---------- 顶层入口 ----------

def eval_scheme(s: str):
    """读取并求值一个 Scheme 表达式字符串，返回结果"""
    expr = read_line(s)
    if expr is None:
        return None
    return scheme_eval(expr, global_env)

# 可选 REPL（用于本地调试）
if __name__ == '__main__':
    print("🏰 Mini Scheme REPL 已启动。输入 'exit' 退出。")
    while True:
        try:
            line = input('scm> ')
            if line.strip() == 'exit':
                break
            result = eval_scheme(line)
            if result is not None:
                print(result)
        except Exception as e:
            print(f'Error: {e}')