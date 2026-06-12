def run_layered_fs(commands):
    """
    模拟 Docker 分层文件系统的写时复制行为。

    参数:
        commands: 一个列表，每个元素为表示命令的元组/列表。
            支持的命令:
                ('init', [base_layers])  - 初始化，base_layers 为从底到顶的只读层字典列表。
                ('read', path)           - 读取文件，返回内容字符串或 None。
                ('write', path, content) - 写入文件，触发写时复制。
                ('delete', path)         - 删除文件，在可写层标记删除。
                ('inspect_base', index)  - 返回第 index 个基础层字典（用于测试不可变性）。

    返回:
        一个列表，包含每条命令的返回值（init/write/delete 返回 None，
        read 返回内容或 None，inspect_base 返回字典）。

    示例:
        >>> cmds = [
        ...     ('init', [{'a.txt': 'hello'}]),
        ...     ('read', 'a.txt'),
        ...     ('write', 'a.txt', 'new'),
        ...     ('read', 'a.txt'),
        ...     ('inspect_base', 0)
        ... ]
        >>> run_layered_fs(cmds)
        [None, 'hello', None, 'new', {'a.txt': 'hello'}]
    """
    # Step 1: 定义内部类 LayeredFS，封装可写层和基础层列表
    class LayeredFS:
        def __init__(self, base_layers):
            # TODO: 初始化可写层字典（空）和基础层列表（从底到顶）
            pass

        def read(self, path):
            # TODO: 实现读取逻辑
            # 1. 检查可写层：若键存在且值不是删除标记，返回该值；若是删除标记，返回 None
            # 2. 逆序遍历基础层（从顶到底），返回第一个存在的值
            # 3. 若都不存在，返回 None
            pass

        def write(self, path, content):
            # TODO: 实现写入逻辑（写时复制）
            # 1. 若文件存在于任何基础层，先将原内容复制到可写层（若可写层尚无该键）
            # 2. 更新可写层中的内容
            pass

        def delete(self, path):
            # TODO: 实现删除逻辑
            # 在可写层中设置一个特殊标记（如 None）表示文件已删除
            pass

        def inspect_base(self, index):
            # TODO: 返回基础层列表的第 index 个元素
            pass

    # Step 2: 解析命令并调用 LayeredFS 方法，收集结果
    fs = None
    results = []
    for cmd in commands:
        op = cmd[0]
        if op == 'init':
            # TODO: 创建 LayeredFS 实例，传入 cmd[1]
            pass
        elif op == 'read':
            # TODO: 调用 fs.read(cmd[1])，追加结果
            pass
        elif op == 'write':
            # TODO: 调用 fs.write(cmd[1], cmd[2])，追加 None
            pass
        elif op == 'delete':
            # TODO: 调用 fs.delete(cmd[1])，追加 None
            pass
        elif op == 'inspect_base':
            # TODO: 调用 fs.inspect_base(cmd[1])，追加结果
            pass
    return results