# 文件操作与代码解析：构建 LLM 友好的文件工具链

## 一、递归目录遍历与项目结构可视化

### 1.1 `pathlib` vs `os.walk`：选型与陷阱

`pathlib.Path.rglob()` 返回惰性生成器，适合现代代码；`os.walk()` 则提供三元组 `(dirpath, dirnames, filenames)`，其最大优势是**可在遍历中就地修改 `dirnames` 来剪枝**：

```python
import os
from pathlib import Path

def walk_safe(root: Path):
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        # 就地剪枝：跳过 .git、__pycache__、node_modules
        dirnames[:] = [d for d in dirnames if d not in {'.git', '__pycache__', 'node_modules', '.venv'}]
        for f in filenames:
            yield Path(dirpath) / f
```

**Gotcha #1：符号链接死循环。** `os.walk` 默认 `followlinks=False`，但 `Path.rglob()` 会跟随符号链接，可能在循环链接中无限递归。生产代码必须显式跟踪已访问的 `st_ino + st_dev` 集合，或限制递归深度。

**Gotcha #2：`rglob('*')` 同时返回目录与文件。** 必须用 `p.is_file()` 过滤；且 `is_file()` 会跟随符号链接，需配合 `is_symlink()` 判断。

**Gotcha #3：权限错误。** 遍历用户主目录时极易遇到 `PermissionError`。务必用 `try/except` 包裹，否则整个遍历会中断。

### 1.2 树状可视化

```python
def render_tree(root: Path, prefix: str = "", ignore: set[str] = {'.git'}):
    if not root.is_dir():
        return
    children = sorted([p for p in root.iterdir() if p.name not in ignore],
                      key=lambda p: (not p.is_dir(), p.name.lower()))
    for i, child in enumerate(children):
        is_last = (i == len(children) - 1)
        connector = "└── " if is_last else "├── "
        print(prefix + connector + child.name + ("/" if child.is_dir() else ""))
        if child.is_dir():
            extension = "    " if is_last else "│   "
            render_tree(child, prefix + extension, ignore)
```

注意：`iterdir()` 不保证顺序，必须显式排序以保证输出可复现（这对 LLM 的可重现工具调用尤为重要）。

---

## 二、AST 解析：提取 Python 代码摘要

### 2.1 核心节点类型

| 节点 | 含义 | 关键属性 |
|------|------|---------|
| `ast.Module` | 文件根 | `body` |
| `ast.FunctionDef` / `AsyncFunctionDef` | 函数 | `name`, `args`, `decorator_list`, `returns`, `body` |
| `ast.ClassDef` | 类 | `name`, `bases`, `decorator_list`, `body` |
| `ast.Import` | `import x` | `names` (每个有 `.name`, `.asname`) |
| `ast.ImportFrom` | `from x import y` | `module`, `names`, `level` (相对导入层数) |

### 2.2 使用 `NodeVisitor` 结构化遍历

```python
import ast

class SummaryVisitor(ast.NodeVisitor):
    def __init__(self):
        self.functions, self.classes, self.imports = [], [], []

    def visit_FunctionDef(self, node):
        args = [a.arg for a in node.args.args]
        ret = ast.unparse(node.returns) if node.returns else None
        self.functions.append({
            "name": node.name, "line": node.lineno,
            "end_line": node.end_lineno,  # Python 3.8+
            "args": args, "returns": ret,
            "docstring": ast.get_docstring(node),
        })
        self.generic_visit(node)  # 必须调用，否则不会进入嵌套定义

    def visit_ClassDef(self, node):
        self.classes.append({
            "name": node.name, "line": node.lineno,
            "bases": [ast.unparse(b) for b in node.bases],
            "docstring": ast.get_docstring(node),
        })
        self.generic_visit(node)

    def visit_Import(self, node):
        for n in node.names:
            self.imports.append(n.asname or n.name)
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        mod = "." * node.level + (node.module or "")
        for n in node.names:
            self.imports.append(f"{mod}.{n.name}")
        self.generic_visit(node)

def summarize(src: str):
    tree = ast.parse(src)  # 可能抛 SyntaxError、ValueError(空字符串)
    v = SummaryVisitor()
    v.visit(tree)
    return v
```

**Gotcha #4：忘记 `generic_visit`。** 不调用则不会递归到嵌套函数/类，导致摘要遗漏。`ast.walk` 是 BFS，不区分层级，适合"全量扫描"但丢失结构信息。

**Gotcha #5：`ast.get_docstring` 仅对模块/类/函数首条字符串字面量生效**，且需 `clean_indent=True`（默认）。

**Gotcha #6：装饰器与异步函数。** `async def` 是 `AsyncFunctionDef`，与 `FunctionDef` 不互为子类，必须分别 `visit`。

**Gotcha #7：`ast.unparse`（3.9+）才能把节点还原为源码字符串**；3.8 以下需用 `astor` 第三方库。

**Gotcha #8：SyntaxError 处理。** 解析任意用户文件时必须捕获 `SyntaxError` 并提取 `lineno`、`offset`、`msg`，否则 LLM 工具会因单个坏文件崩溃。

---

## 三、`read_file` / `write_file` 工具封装

### 3.1 read_file：为 LLM 优化的读取

```python
def read_file(path: str, start: int = 1, end: int | None = None,
              max_chars: int = 200_000) -> dict:
    p = _confine(path)
    raw = p.read_bytes()
    # 处理 BOM：utf-8-sig 自动剥离 BOM
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw.decode('latin-1', errors='replace')  # 兜底，绝不抛错
    lines = text.splitlines(keepends=True)
    end = end or len(lines)
    sliced = ''.join(lines[start-1:end])
    if len(sliced) > max_chars:
        sliced = sliced[:max_chars] + "\n...[truncated]"
    return {"path": str(p), "content": sliced,
            "total_lines": len(lines), "start": start, "end": end}
```

**Gotcha #9：行号从 1 开始。** LLM 引用代码时使用 1-based 行号，切片时记得 `start-1`。

**Gotcha #10：`splitlines()` 会把 `\r\n`、`\r`、`\n`、`\v`、`\f` 等都当换行符**，可能与源文件实际行号不一致。严格场景应使用 `splitlines(keepends=True)` 后只识别 `\n`。

**Gotcha #11：BOM 与编码。** Windows 上 Notepad 保存的 UTF-8 文件含 BOM (`\ufeff`)，直接 `decode('utf-8')` 会在首行留下不可见字符，导致 LLM 误判缩进。`utf-8-sig` 是解药。

### 3.2 write_file：原子写入

```python
import os, tempfile, shutil

def write_file(path: str, content: str, backup: bool = True) -> dict:
    p = _confine(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if backup and p.exists():
        bak = p.with_suffix(p.suffix + f'.bak.{int(time.time())}')
        shutil.copy2(p, bak)
    # 原子写：先写临时文件再 rename，避免崩溃留下半写文件
    fd, tmp = tempfile.mkstemp(dir=p.parent, prefix='.tmp_')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as f:
            f.write(content)
        os.replace(tmp, p)  # 原子操作（POSIX & Windows）
    except Exception:
        os.unlink(tmp); raise
    return {"path": str(p), "bytes": len(content.encode('utf-8'))}
```

**Gotcha #12：`newline='\n'`。** 不指定时 Python 默认 `newline=None` 会做 universal newline 转换，在 Windows 上把 `\n` 写成 `\r\n`，破坏哈希一致性。LLM 工具应强制 `newline='\n'`。

**Gotcha #13：`os.replace` vs `os.rename`。** `rename` 在 Windows 上目标存在时会失败；`replace` 跨平台原子覆盖。

---

## 四、安全边界设计

### 4.1 路径限制（核心防线）

```python
from pathlib import Path

WORKSPACE = Path('/workspace').resolve()

def _confine(user_path: str) -> Path:
    # 1. 拒绝 null 字节（C 层截断攻击）
    if '\x00' in user_path:
        raise ValueError("null byte in path")
    # 2. 拼接后 resolve，解析所有 .. 和符号链接
    candidate = (WORKSPACE / user_path).resolve(strict=False)
    # 3. 严格前缀检查
    try:
        candidate.relative_to(WORKSPACE)
    except ValueError:
        raise PermissionError(f"path escapes workspace: {candidate}")
    return candidate
```

**Gotcha #14：`resolve()` 会跟随符号链接。** 这正是安全所需——攻击者用 `workspace/evil_symlink -> /etc/passwd` 试图逃逸时，`resolve()` 会暴露真实路径。但 `strict=False` 必须设置，否则对不存在文件路径会抛 `FileNotFoundError`，导致 `write_file` 无法创建新文件。

**Gotcha #15：`is_relative_to` (3.9+) 等价于 `relative_to` + try/except**，但语义更清晰。

**Gotcha #16：TOCTOU 竞态。** "检查后使用"窗口期内符号链接可能被替换。高安全场景需用 `os.open` + `O_NOFOLLOW` 打开最终分量，或使用 `os.fwalk`。LLM 工具场景下风险较低，但应知晓。

### 4.2 防误删：软删除策略

```python
TRASH = WORKSPACE / '.trash'
TRASH.mkdir(exist_ok=True)

def safe_delete(path: str) -> dict:
    p = _confine(path)
    if p == WORKSPACE:
        raise PermissionError("refuse to delete workspace root")
    dest = TRASH / f"{p.name}.{int(time.time())}.{uuid.uuid4().hex[:6]}"
    shutil.move(str(p), str(dest))
    return {"moved_to": str(dest), "recoverable": True}
```

**Gotcha #17：拒绝删除工作区根目录。** 即使路径合法，也应硬编码拒绝根目录与 `.trash` 自身。

**Gotcha #18：`shutil.move` 跨文件系统会退化为 copy+delete**，大文件可能很慢且非原子；同分区移动才是原子的 `rename`。

### 4.3 备份机制

- **版本化备份**：`file.py.bak.<unix_ts>`，保留最近 N 份。
- **内容寻址**：对写入前内容计算 `sha256`，存入 `.trash/sha256/`，去重节省空间。
- **回滚接口**：暴露 `restore(path, version='latest')` 给 LLM，使其能自我纠错。

---

## 五、综合实践：项目摘要工具

将上述模块组合，可构建一个供 LLM 调用的 `project_summary` 工具：

```python
def project_summary(root: str) -> dict:
    r = _confine(root)
    tree = render_tree(r)  # 字符串形式
    py_files = [p for p in walk_safe(r) if p.suffix == '.py']
    summaries = {}
    for pf in py_files[:200]:  # 上限保护
        try:
            summaries[str(pf.relative_to(r))] = summarize(pf.read_text('utf-8')).__dict__
        except (SyntaxError, UnicodeDecodeError) as e:
            summaries[str(pf.relative_to(r))] = {"error": str(e)}
    return {"tree": tree, "files": summaries, "total_py": len(py_files)}
```

此设计满足 CS61A 风格的工程严谨性：**惰性求值、显式错误处理、可复现输出、最小权限原则**。LLM 拿到结构化摘要后，可自主决定 `read_file` 哪一段、`write_file` 改哪一行，形成 agentic 闭环。