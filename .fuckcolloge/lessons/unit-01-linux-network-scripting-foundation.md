# Linux、网络与脚本自动化基础（修订版）

## 0. 学习目标

完成本单元后，你应能：

- 用“文件系统—权限—进程—服务—日志—网络栈”的模型解释 Linux 行为。
- 排查 CPU、内存、磁盘、网络、服务不可用等常见故障。
- 理解 TCP/IP、DNS、HTTP/HTTPS、端口、防火墙与 NAT 的基本交互。
- 编写安全、可重复、可测试的 Shell/Python 脚本完成日志清理、批量处理、服务巡检。

---

## 1. 文件系统：路径、inode 与挂载点

Linux 将许多资源抽象为“文件”，但不仅是普通文件：还有目录、设备文件、管道、socket、`/proc`、`/sys` 等伪文件系统。

常用目录：

```bash
/          # 根目录
/bin       # 基础命令
/etc       # 配置文件
/var       # 日志、缓存、动态数据
/home      # 用户目录
/proc      # 进程与内核信息的伪文件系统
/tmp       # 临时文件，通常有 sticky bit
```

关键概念：

- **路径**：绝对路径从 `/` 开始，相对路径依赖当前目录。
- **inode**：记录文件元数据；目录项将文件名映射到 inode。
- **硬链接/软链接**：硬链接指向同一 inode，软链接是另一个路径文件。
- **挂载点**：目录背后可能挂接了不同磁盘或网络文件系统。

Gotcha：

```bash
rm file        # 删除目录项，不一定立即释放磁盘
df -h          # 看块使用
df -i          # 看 inode 使用
lsof +L1       # 查找已删除但仍被进程打开的文件
```

---

## 2. 权限与用户：最小权限原则

权限字符串：

```bash
-rwxr-xr-- 1 alice dev 1234 app.sh
```

含义：

- `r` 可读，`w` 可写，`x` 可执行。
- 对目录而言，`x` 表示可进入/搜索目录；没有 `x` 即使有 `r` 也可能无法访问子项。
- 删除文件主要依赖**父目录的写权限**，不是文件自身权限。

常用命令：

```bash
chmod 755 app.sh
chmod u+x app.sh
chown alice:dev app.sh
sudo -u alice command
id
groups
```

Gotcha：

- `chmod 777` 通常不是修复方案，而是安全漏洞。
- 脚本可执行不代表内容正确；还需要 shebang，如 `#!/usr/bin/env bash`。
- 生产环境优先使用普通用户 + `sudo` 精确授权。
- 注意 `umask` 会影响新建文件默认权限。

---

## 3. 进程、服务与日志

进程是运行中的程序；服务通常是长期运行、由 init/systemd 管理的进程。

常用命令：

```bash
ps aux
pgrep -a nginx
top
htop
kill -TERM PID
kill -KILL PID
```

Gotcha：

- `kill PID` 默认发送 `SIGTERM`，应优先优雅退出。
- `kill -9` 只用于无法终止的进程；它不执行清理逻辑。
- 僵尸进程不能被 `kill -9` 清除，需要父进程回收或重启父进程。

systemd 服务：

```bash
systemctl status nginx
systemctl is-active nginx
systemctl restart nginx
systemctl enable nginx
journalctl -u nginx -n 100 --no-pager
journalctl -u nginx -f
```

Gotcha：

- `systemctl status` 显示的是 unit 状态，不等同于进程一定不存在。
- 日志可能在 `journalctl`，也可能在 `/var/log/`，还可能在应用自己的日志目录。
- 排查时先看最近日志：`journalctl -u 服务名 -n 200 --no-pager`。

---

## 4. 资源排查：CPU、内存、磁盘、网络

### CPU

```bash
uptime
top
mpstat 1
```

重点：

- `load average` 要按 CPU 核数解释：8 核机器 load=4 未必严重，2 核机器 load=4 已很危险。
- `wa` 高通常表示 I/O 等待，不一定是 CPU 忙。
- 单核打满可能阻塞事件循环或主线程。

### 内存

```bash
free -h
vmstat 1
```

Gotcha：

- Linux 会利用空闲内存做 cache/buffer，所以 `free` 小不一定异常。
- 更应关注 `available`、swap 使用、OOM 日志：

```bash
dmesg -T | grep -i oom
journalctl -k | grep -i oom
```

### 磁盘

```bash
df -h
df -i
du -xh --max-depth=1 /var/log
find /var/log -type f -size +100M -ls
```

常见故障：

- 块空间满：大日志、备份文件、核心转储。
- inode 满：大量小文件。
- I/O 瓶颈：`iostat -x 1` 看 `%util`、`await`。
- 删除文件后空间不释放：进程仍持有文件句柄。

### 网络

```bash
ip -br addr
ip route
ss -tulnp
ss -tan state established
ping example.com
traceroute example.com
curl -v https://example.com
dig example.com
tcpdump -i eth0 port 80
```

Gotcha：

- `ss -tulnp` 中 `-t/-u` 是 TCP/UDP，`-l` 是监听，`-n` 不解析名称，`-p` 显示进程。
- 服务监听 `127.0.0.1:8080` 时，只能本机访问；远程访问需要监听 `0.0.0.0` 或具体网卡地址。
- `tcpdump` 通常需要 root 或 cap_net_raw。

---

## 5. 网络模型与故障分层

网络通信可按层排查：

```text
域名解析 → 路由可达 → 端口开放 → 防火墙放行 → 服务监听 → 应用响应
```

### TCP/IP

- IP：定位主机。
- 端口：定位主机上的服务。
- TCP：面向连接，保证可靠传输、顺序、重传。
- UDP：无连接，延迟低，但可能丢包、乱序。

### DNS

```bash
dig example.com A
dig example.com AAAA
dig +trace example.com
```

Gotcha：

- `A` 是 IPv4，`AAAA` 是 IPv6。
- DNS 常用 UDP/53；响应过大或区域传输会用到 TCP/53。
- 缓存和 TTL 会导致“刚修改 DNS 但还没生效”。

### HTTP/HTTPS

```bash
curl -v http://example.com:8080/
curl -I http://example.com/
```

Gotcha：

- `curl -I` 发送 `HEAD` 请求，不是 `GET`；有些服务对 HEAD 支持不好。
- HTTPS = HTTP + TLS；证书过期、域名不匹配、代理配置错误都会导致失败。
- 常见状态码：
  - `200` 成功
  - `301/302` 跳转
  - `401/403` 认证或权限
  - `404` 不存在
  - `500` 服务端错误
  - `502/503/504` 网关、服务不可用、超时

### 防火墙

```bash
ufw status
iptables -L -n
firewall-cmd --list-all
nft list ruleset
```

Gotcha：

- 云主机还可能有安全组、负载均衡、NAT 网关。
- 本机监听正常，不代表外部可达。
- 排查顺序不要只盯着防火墙：先看服务，再看端口，再看路由和 DNS。

---

## 6. 综合排查：服务不可访问

假设 `https://api.example.com` 不可访问：

```bash
# 1. 客户端侧：DNS 是否正确
dig api.example.com A
dig api.example.com AAAA

# 2. 端口是否可达
curl -v https://api.example.com/
nc -vz api.example.com 443

# 3. 服务端侧：服务是否监听
ss -ltnp | grep ':443\|:80'

# 4. 服务状态与日志
systemctl status nginx
journalctl -u nginx -n 200 --no-pager

# 5. 资源是否异常
df -h
df -i
top
free -h
iostat -x 1

# 6. 防火墙与安全组
ufw status
iptables -L -n
```

核心原则：先定位故障层，再执行修复；不要凭感觉重启。

---

## 7. Shell 自动化：安全、幂等、可回滚

Shell 适合串联系统命令，但必须避免误删。

安全清理 7 天前日志：

```bash
#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="/var/log/myapp"

find "$LOG_DIR" -type f -name "*.log" -mtime +7 -print
# 确认无误后再执行：
# find "$LOG_DIR" -type f -name "*.log" -mtime +7 -print0 | xargs -0 rm -f
```

Gotcha：

- 变量必须加引号：`"$LOG_DIR"`。
- `set -e` 不是万能保险；条件语句、管道、后台任务中行为复杂。
- `pipefail` 可让管道中任一命令失败时整体失败。
- 删除、重启、覆盖配置前必须 dry-run、备份、确认影响范围。
- 脚本应可重复执行：执行一次和执行多次结果一致。

---

## 8. Python 自动化：结构化输出与错误处理

Python 更适合复杂逻辑、JSON 输出、跨平台任务和测试。

服务巡检示例：

```python
#!/usr/bin/env python3
import subprocess, sys, json

services = sys.argv[1:] or ["nginx", "mysql"]

for svc in services:
    try:
        r = subprocess.run(
            ["systemctl", "is-active", svc],
            text=True,
            capture_output=True,
            timeout=5
        )
        status = r.stdout.strip()
        print(json.dumps({
            "service": svc,
            "status": status,
            "ok": status == "active",
            "returncode": r.returncode
        }, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({
            "service": svc,
            "status": "error",
            "ok": False,
            "error": str(e)
        }, ensure_ascii=False))
```

脚本设计原则：

- 输入明确，输出可解析。
- 失败可追踪，错误信息可诊断。
- 默认不修改系统；修改前备份。
- 生产脚本要记录日志、限制权限、可被测试。