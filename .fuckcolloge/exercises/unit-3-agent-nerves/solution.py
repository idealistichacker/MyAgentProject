import subprocess
import tempfile
import os


def run_code_safely(source: str, timeout: float = 5.0) -> dict:
    """在隔离的子进程中执行 Python 代码，返回结构化执行结果。

    这是你的自我修复 Agent 的执行引擎核心——"造物主的双手"。
    Agent 将用它来运行 LLM 生成的代码，捕获结果，
    并将反馈送回 ReAct 循环的 Observe 阶段。

    返回字典包含以下键：
        - stdout: str     子进程标准输出（截断至最后 8000 字符）
        - stderr: str     子进程标准错误（截断至最后 8000 字符）
        - exit_code: int  进程返回码；超时时为 -1
        - timed_out: bool 是否因超时被终止

    Examples:
        >>> result = run_code_safely("print('hello')")
        >>> result['stdout'].strip()
        'hello'
        >>> result['exit_code']
        0
        >>> result['timed_out']
        False

        >>> result = run_code_safely("while True:\\n    pass", timeout=1.0)
        >>> result['timed_out']
        True
        >>> result['exit_code']
        -1

        >>> result = run_code_safely("raise ValueError('oops')")
        >>> result['exit_code']
        1
        >>> 'ValueError' in result['stderr']
        True
    """
    # Step 1: 将源代码写入临时文件
    # 使用 tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False)
    # delete=False 让你在关闭文件后仍能通过 path 访问它
    # TODO: 创建临时文件，写入 source，保存 path

    # Step 2: 使用 subprocess.run 执行子进程
    # 关键参数（缺一不可）：
    #   - 命令: ["python3", "-I", "-u", path]
    #     -I = 隔离模式（不加载用户 site-packages）
    #     -u = 无缓冲（防止 print 输出丢失）
    #   - capture_output=True, text=True
    #   - timeout=timeout
    #   - stdin=subprocess.DEVNULL  ← 防止 input() 阻塞！
    #   - env={"PATH": os.environ["PATH"], "PYTHONIOENCODING": "utf-8"}
    # TODO: 调用 subprocess.run，捕获结果

    # Step 3: 捕获 subprocess.TimeoutExpired 异常
    # 超时时返回 {"stdout": ..., "stderr": ..., "exit_code": -1, "timed_out": True}
    # 注意：TimeoutExpired 异常对象的 .stdout / .stderr 属性可能为 None
    #       需要用 (e.stdout or "") 做空值保护
    # TODO: except subprocess.TimeoutExpired as e: ...

    # Step 4: 正常返回时，截断 stdout 和 stderr 至最后 8000 字符
    # 提示：用切片 result[-8000:] 截断，防止超大输出爆 LLM 上下文
    # 返回 {"stdout": ..., "stderr": ..., "exit_code": ..., "timed_out": False}
    # TODO: 构造并返回结果字典

    # Step 5: 在 finally 块中删除临时文件
    # 使用 os.unlink(path) 清理，防止 /tmp 堆积
    # TODO: finally: os.unlink(path)

    pass