# 运维基础与 JavaScript 自动化入门（修订版）

## 课程目标

完成本课程后，学生应能：

1. 使用 Linux 命令观察文件系统、权限、进程、网络与日志；
2. 按“现象 → 状态 → 证据 → 最近变更 → 修复 → 验证”的流程排障；
3. 编写 Shell 脚本完成备份、日志清理、服务检查；
4. 使用 JavaScript / Node.js 做文件读取、文本处理、批量任务和 HTTP 检查；
5. 交付 3–5 个可测试、可回滚、可记录的小型自动化项目。

---

## 1. Linux 状态模型：一切皆可观察

Linux 中“一切皆文件”，但文件只是状态的一种表示。运维首先要问：

> 当前系统处于什么状态？证据在哪里？失败后能否恢复？

### 常用命令

```bash
pwd
ls -lah
find . -maxdepth 2 -type f -name "*.log"
du -sh .
df -h
```

### 路径要点

- `/` 是根目录；
- 相对路径依赖当前目录，绝对路径从 `/` 开始；
- `.` 表示当前目录，`..` 表示上一级目录。

### Gotchas

- `cp` 默认不保留权限和时间戳，备份常用 `cp -a`；
- `mv` 跨文件系统时本质是“复制 + 删除”；
- `rm` 删除文件主要看父目录是否有写权限，而不是文件本身是否可写。

---

## 2. 权限与文件安全

权限字段示例：

```bash
-rwxr-xr-- app.sh
```

含义：

```text
文件类型：- 表示普通文件
所有者：rwx
所属组：r-x
其他人：r--
```

数字表示：

```text
r = 4, w = 2, x = 1
755 = rwxr-xr-x
644 = rw-r--r--
```

### 常用命令

```bash
chmod 755 app.sh
chmod +x app.sh
chown alice:devops app.sh
sudo -u alice command
```

### Gotchas

- 目录的 `x` 表示“可进入、可遍历”，不是执行；
- 脚本有 `+x` 还不够，第一行 `#!/usr/bin/env bash` 要正确；
- `sudo` 会改变环境变量，尤其是 `PATH` 和 `HOME`；
- 生产环境不要随意 `chmod 777`。

---

## 3. 进程与服务

进程是正在运行的程序。每个进程有：

```text
PID：进程编号
PPID：父进程编号
状态：运行、睡眠、僵尸等
资源：CPU、内存、文件描述符
```

### 常用命令

```bash
ps aux
ps -eo pid,ppid,stat,comm,args | less
top
pgrep nginx
kill 1234
kill -TERM 1234
kill -KILL 1234
```

### systemd 管理服务

```bash
systemctl status nginx
systemctl start nginx
systemctl restart nginx
systemctl reload nginx
systemctl enable nginx
```

### Gotchas

- `enable` 只设置开机启动，不会立即启动服务；
- `restart` 会重启，`reload` 通常只重新加载配置；
- `kill` 默认发送 `SIGTERM`，不是立刻强杀；
- `SIGKILL` 是最后手段，进程无法清理现场。

---

## 4. 日志与排障流程

日志是排障证据，不是装饰。

### 常见日志

```bash
/var/log/syslog
/var/log/messages
/var/log/nginx/access.log
/var/log/nginx/error.log
journalctl -u nginx
```

### 常用查看方式

```bash
tail -n 200 app.log
tail -F app.log
grep -RniE "ERROR|Exception" .
journalctl -u nginx -b -p warning..err --since "1 hour ago"
awk '{print $1}' access.log | sort | uniq -c | sort -nr | head
```

### 推荐流程

```text
1. 复现问题，确认影响范围
2. 检查服务状态：systemctl status
3. 检查进程和资源：ps / top / free
4. 检查端口：ss -lntp
5. 查看日志：journalctl / tail / grep
6. 回溯最近变更：发布、配置、权限、磁盘、时间
7. 修复、验证、记录
```

### Gotchas

- 日志可能被 logrotate 切割或压缩；
- 服务器时间、时区不一致会导致误判；
- `journalctl` 默认日志可能重启后丢失，需配置持久化；
- `200 OK` 不代表业务正确，还要检查响应体。

---

## 5. 网络基础与运维命令

### 核心概念

```text
IP：主机地址
端口：进程通信入口
DNS：域名到 IP 的解析
TCP：面向连接、可靠传输
UDP：无连接、低开销、可能丢包
HTTP：基于请求/响应的应用层协议
```

### 常用命令

```bash
ip addr
ip route
ping example.com
ss -lntp
curl -I https://example.com
curl -sS -o /dev/null -w "%{http_code} %{time_total}\n" URL
dig +short example.com
traceroute example.com
```

### Gotchas

- 服务监听 `127.0.0.1` 时，外部机器无法访问；
- 防火墙、安全组、云厂商规则可能阻断连接；
- DNS 有缓存，修改解析后不一定立即生效；
- TCP 连接成功不等于 HTTP 业务成功；
- UDP 没有握手，排查常依赖应用日志。

---

## 6. Shell 脚本：把流程变成契约

好脚本应满足：

```text
输入明确
失败有退出码
关键变量加引号
操作可回滚
重要步骤写日志
危险动作先 dry-run
```

### 示例：备份并生成校验值

```bash
#!/usr/bin/env bash
set -euo pipefail

SRC=${1:?用法: backup.sh /path/to/dir}
DEST=${2:-/tmp/backup_$(date +%F_%H%M%S).tar.gz}

mkdir -p "$(dirname "$DEST")"
tar -czf "$DEST" "$SRC"
sha256sum "$DEST" > "$DEST.sha256"

echo "backup ok: $DEST"
```

### 清理 7 天前日志

```bash
find /var/log/myapp -name "*.log" -mtime +7 -delete
```

### Gotchas

- `"$VAR"` 防止空格和通配符问题；
- `set -e` 在 `if` 条件中有特殊行为，要理解退出码；
- `find ... -print0 | xargs -0` 能安全处理含空格的文件名；
- cron 环境变量很少，脚本中最好显式指定 `PATH`。

---

## 7. JavaScript 与 Node.js 自动化

### JavaScript 基础

```js
let count = 0;
const host = "127.0.0.1";

const server = {
  host,
  port: 8080,
  healthy: true
};

const services = ["nginx", "redis", "mysql"];
```

### 要点

- `let` 可重新赋值，`const` 绑定不可重新赋值；
- `const obj = {}` 中对象内容仍可修改；
- 使用 `===`，避免 `==` 的隐式转换；
- `null` 表示空值，`undefined` 表示未定义；
- 数组常用：`map`、`filter`、`reduce`、`find`。

### Node.js 日志分析示例

```js
const fs = require("fs/promises");

async function analyze(file) {
  const text = await fs.readFile(file, "utf8");
  const counts = { ERROR: 0, WARN: 0 };

  for (const line of text.split(/\r?\n/)) {
    if (/ERROR/.test(line)) counts.ERROR++;
    if (/WARN/.test(line)) counts.WARN++;
  }

  console.table(counts);
}

analyze(process.argv[2] || "app.log").catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
```

### Gotchas

- `process.argv[2]` 才是第一个用户参数；
- 大文件不要一次性 `readFile`，应使用 stream；
- 异步错误要用 `try/catch` 或 `.catch()`；
- CLI 工具应设置正确 `process.exitCode`。

---

## 8. 实践项目

### 1. 日志分析器

统计 ERROR/WARN，输出 top IP、top 错误消息，支持 JSON/CSV。

### 2. 服务健康检查器

检查 `systemctl` 状态、端口监听、HTTP 响应，失败重试并写日志。

### 3. 备份与轮换工具

使用 `tar.gz`、`sha256sum`，保留最近 N 天备份，失败时退出非零。

### 4. 批量文件处理器

遍历目录、重命名、压缩、归档，默认支持 `--dry-run`。

### 5. HTTP 状态监控器

读取 URL 列表，记录状态码、响应时间、超时和 DNS 错误。

### 评估标准

```text
正确性 > 可读性 > 可测试性 > 可恢复性 > 性能优化
```

像 CS61A 一样思考：先定义接口和不变量，再实现；先写小样例，再处理边界；先让失败可见，再追求自动化。