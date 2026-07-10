# 驯服你的第一只 API 神兽

欢迎来到 Agent 造物主的第一车间。在接下来的几周里，我们将打造一个名为"铁甲钢拳"的全自动编程 Agent。但罗马不是一天建成的，Agent 也不是一出生就能自己写代码、跑测试、改 Bug 的。

在 Agent 学会"思考"（ReAct 循环）和"使用工具"（Function Calling）之前，它必须先学会**沟通**。本单元，我们将赋予 Agent 它的"嘴巴"、"耳朵"和"记忆"——掌握 Python 与外部世界沟通的四大法宝：`requests`、`JSON`、文件 I/O 和异常处理。

---

## 1. HTTP 与 requests：Agent 的"嘴巴"与"耳朵"

要让 Agent 调用 LLM，本质上是向 LLM 的服务器发送一个 HTTP 请求。HTTP 是一种基于请求-响应模型的协议：客户端发起请求，服务器返回响应。

### GET 与 POST 的本质区别

- **GET**：参数附加在 URL 查询字符串中（`?name=value&age=3`），有长度限制，语义为"读取资源"。用 `params` 参数传递。
- **POST**：数据放在请求体中，无长度限制，语义为"提交数据"。用 `json` 或 `data` 参数传递。

```python
import requests

# GET 请求：params 会被自动拼接到 URL
response = requests.get(
    "https://api.example.com/search",
    params={"q": "python tutorial", "page": 1},
    timeout=10  # 务必设置超时！否则网络挂起时程序会永久阻塞
)
# 实际请求 URL: https://api.example.com/search?q=python+tutorial&page=1

# POST 请求：json 参数会自动序列化为 JSON 并设置 Content-Type 头
payload = {"prompt": "写一个贪吃蛇游戏的Python代码", "max_tokens": 2048}
response = requests.post("https://api.example-llm.com/v1/chat", json=payload, timeout=30)
```

> **Gotcha**：`json=payload` 和 `data=payload` 的区别至关重要。`json=` 会自动调用 `json.dumps()` 序列化数据并设置 `Content-Type: application/json`；而 `data=` 发送的是表单数据（`application/x-www-form-urlencoded`）。混用会导致服务器返回 415 Unsupported Media Type。

### 响应对象的三种读取方式

```python
response = requests.post(url, json=payload, timeout=30)

# 1. response.text —— 返回字符串（自动推测编码，偶尔会乱码）
# 2. response.json() —— 将响应体解析为 Python 字典/列表（内部调用 json.loads）
# 3. response.content —— 返回原始 bytes（用于下载图片等二进制数据）

# 状态码家族：2xx 成功 | 3xx 重定向 | 4xx 客户端错误 | 5xx 服务器错误
if response.status_code == 200:
    data = response.json()  # 如果响应体不是合法 JSON，这里会抛出 json.JSONDecodeError
    print(data["choices"][0]["message"]["content"])
```

> **Gotcha**：`response.json()` 不会自动检查状态码。即使服务器返回 500 错误，只要响应体碰巧是合法 JSON，它也不会报错。务必先检查 `response.status_code` 或调用 `response.raise_for_status()`。

---

## 2. JSON：数字世界的"世界语"

JSON 是 Agent 与 LLM 之间的数据交换格式。理解 JSON 与 Python 类型之间的映射关系是基本功：

| JSON 类型    | Python 类型         | 注意事项                        |
| ------------ | ------------------- | ------------------------------- |
| object`{}` | `dict`            | JSON 键必须是字符串             |
| array`[]`  | `list`            | —                              |
| string       | `str`             | JSON 不支持单引号               |
| number       | `int` / `float` | —                              |
| boolean      | `bool`            | JSON 中是小写`true`/`false` |
| null         | `None`            | —                              |

> **关键限制**：JSON 不支持 Python 的 `tuple`、`set`、`datetime`、`bytes`。`json.dumps((1, 2))` 会将元组转为 JSON 数组 `[1, 2]`，反序列化后变成列表，类型信息丢失。

```python
import json

# 解析：JSON 字符串 -> Python 对象
llm_response_text = '{"action": "write_file", "filename": "snake.py", "code": "print(1)"}'
try:
    parsed = json.loads(llm_response_text)
    # 链式索引提取嵌套数据——这是后续从 LLM 响应中提取代码的核心技能
    code = parsed["code"]
except json.JSONDecodeError as e:
    print(f"LLM 返回的不是合法 JSON: {e}")

# 序列化：Python 对象 -> JSON 字符串
my_data = {"test_result": "failed", "error_log": "NameError on line 10"}
# ensure_ascii=False 允许输出中文；indent=2 使输出带缩进、可读
json_string = json.dumps(my_data, ensure_ascii=False, indent=2)
```

> **Gotcha**：默认 `json.dumps()` 会将中文字符转义为 `\uXXXX`。处理含中文的 LLM 响应时，务必加 `ensure_ascii=False`，否则日志和调试输出会变成乱码。

---

## 3. 文件 I/O：给 Agent 发一支"笔"

LLM 在内存里生成的代码，如果不持久化到硬盘，程序结束就灰飞烟灭。Python 的 `with` 语句（上下文管理器）是文件操作的标准范式——它保证无论中间是否抛异常，`__exit__` 都会被调用，文件句柄必然关闭。

```python
# 写入：'w' 覆盖写入 | 'a' 追加写入 | 'r' 只读 | 'b' 二进制模式
code_content = "print('Hello, Agent!')"
with open("agent_output.py", "w", encoding="utf-8") as f:
    f.write(code_content)

# 读取
with open("agent_output.py", "r", encoding="utf-8") as f:
    content = f.read()  # 一次性读取全部内容
```

> **Gotcha 1**：永远显式指定 `encoding="utf-8"`。Windows 默认编码是 GBK，Linux/macOS 是 UTF-8。不指定编码会导致同一份代码在不同系统上运行时抛出 `UnicodeDecodeError`。

> **Gotcha 2**：`'w'` 模式会在打开瞬间清空文件。如果 Agent 在写入过程中崩溃，原文件内容已经丢失。安全做法是先写入临时文件，再 `os.replace()` 原子替换。

> **Gotcha 3**：`f.read()` 一次性将整个文件载入内存。处理大日志文件时，用 `for line in f:` 逐行迭代更安全。

现代 Python 推荐使用 `pathlib.Path` 替代 `os.path`，它提供了更优雅的面向对象接口：

```python
from pathlib import Path

output_dir = Path("output")
output_dir.mkdir(exist_ok=True)  # 目录不存在则创建，已存在不报错
(output_dir / "snake.py").write_text(code_content, encoding="utf-8")
```

---

## 4. 异常处理：给 Agent 穿上"防弹衣"

网络会断开，API Key 会过期，文件路径会写错。`try/except` 让程序在遇到错误时不崩溃，而是执行备用逻辑。理解 Python 异常继承层次是精准捕获的前提：

```
BaseException
├── SystemExit / KeyboardInterrupt  （不要捕获这些）
└── Exception
    ├── ValueError / TypeError / KeyError / FileNotFoundError ...
    └── requests.exceptions.RequestException
        ├── ConnectionError
        ├── Timeout
        ├── HTTPError
        └── TooManyRedirects
```

```python
import requests

try:
    response = requests.post(url, json=payload, timeout=10)
    response.raise_for_status()  # 4xx/5xx 时抛出 HTTPError
    data = response.json()
except requests.exceptions.Timeout:
    print("请求超时，Agent 决定稍后重试...")
except requests.exceptions.ConnectionError:
    print("网络连接失败，请检查网络或 DNS")
except requests.exceptions.HTTPError as e:
    # 4xx: 客户端错误（如 401 未授权、429 限流）| 5xx: 服务器错误
    print(f"HTTP 错误 {e.response.status_code}: {e}")
except json.JSONDecodeError:
    print("响应体不是合法 JSON，LLM 可能返回了错误页面")
except Exception as e:
    # 兜底：捕获所有未预料到的异常，避免 Agent 静默崩溃
    print(f"未预期错误: {type(e).__name__}: {e}")
else:
    # try 块没有抛出任何异常时才执行
    print("请求成功，开始处理数据...")
finally:
    # 无论是否异常都会执行（适合清理资源）
    print("本次请求流程结束")
```

> **Gotcha**：异常捕获顺序必须**从具体到宽泛**。`Timeout` 是 `RequestException` 的子类，如果先写 `except RequestException`，`Timeout` 永远不会被捕获到。把 `Exception` 放最后做兜底。

> **CS61A 深度提示**：在"铁甲钢拳"的 ReAct 循环中，Agent 执行代码时抛出的异常会被捕获，其 `stderr` 作为上下文喂回 LLM 进行自我修复。没有 `try/except`，Agent 跑一次就死机，根本谈不上"迭代"。

---

## 5. API Key 认证：别把家门钥匙藏在门口地垫下

调用 LLM API 是要花钱的，服务商要求提供 API Key 验证身份。新手常犯的致命错误：把 Key 硬编码在代码里。一旦推送到 GitHub，爬虫会在数秒内盗刷你的余额。

**正确做法：使用环境变量。** 环境变量存在于操作系统进程中，代码只读取引用，不携带明文。

```python
import os

# 方式一：os.environ.get() —— Key 不存在时返回 None（或指定的默认值），不崩溃
api_key = os.environ.get("MY_LLM_API_KEY")
if not api_key:
    raise RuntimeError("找不到 API Key！请在终端执行: export MY_LLM_API_KEY='sk-xxx'")

# 方式二：os.environ[] —— Key 不存在时直接抛出 KeyError（fail fast）
api_key = os.environ["MY_LLM_API_KEY"]

# 带上认证头发起请求
headers = {"Authorization": f"Bearer {api_key}"}
response = requests.post(url, json=payload, headers=headers, timeout=30)
```

> **Gotcha**：`os.environ.get("KEY")` 返回 `None` 时，`if not api_key` 能正确捕获。但若环境变量设为空字符串 `""`，`os.environ.get()` 返回 `""`，`if not api_key` 同样为 `True`——这正是我们想要的，因为空字符串不是合法 Key。

### 项目级管理：.env 文件与 python-dotenv

在团队协作中，更规范的做法是将环境变量写入项目根目录的 `.env` 文件（**务必加入 `.gitignore`**），再用 `python-dotenv` 库加载：

```python
# .env 文件内容（不要提交到 Git！）
# MY_LLM_API_KEY=sk-xxxxxxxxxxxx

from dotenv import load_dotenv
load_dotenv()  # 将 .env 文件中的变量加载到 os.environ
api_key = os.environ["MY_LLM_API_KEY"]
```

---

## 结语：通信地基已打好

你已掌握 Agent 与世界交互的全部底层协议：用 `requests` 发起 HTTP 对话，用 `JSON` 编解码通信语言，用文件 I/O 持久化记忆，用 `try/except` 抵御意外，用环境变量保护密钥。这些看似基础的语法，正是构建"铁甲钢拳"的通信地基。下一单元，我们将在此基础上给 Agent 装上"大脑"——Function Calling，让它学会主动调用这些技能！
