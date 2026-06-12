# 云原生入门与 Docker 基础

## 一、云原生：从方法论到基础设施

云原生不是简单“上云”，而是让应用从设计之初就充分利用云环境的弹性、自愈和自动化。CNCF 全景图以 Kubernetes 为圆心，向外辐射服务网格、可观测性、CI/CD 等数十个领域。新手只需抓住两条核心原则：

- **不可变基础设施**：运行中的实例永不修改，任何变更 = 构建新镜像 + 销毁旧容器 + 启动新容器。这消灭了配置漂移，保证环境一致性。
- **声明式 API**：你只需描述“期望状态”（如 3 个 Redis 副本），控制循环（Control Loop）持续将实际状态向期望状态调和。Kubernetes 的 YAML 正是这种思想的体现——这是理解 K8s 的第一性原理。

## 二、Docker 三要素：镜像、容器、仓库

类比面向对象：镜像 = 类（只读模板），容器 = 实例（运行态），仓库 = 对象存储（分发镜像）。

### 2.1 镜像分层与写时复制

Docker 镜像由多个**只读层**堆叠而成，每一条 `RUN`/`COPY`/`ADD` 指令生成一层。容器启动时，在镜像层之上添加一个**薄可写层（容器层）**。所有修改（新增、删除、更改）都写入该层，底层只读层永不改变——这就是**写时复制（Copy-on-Write）**。

```
容器层（可写，仅本容器可见，删除即丢失）
────────────────────
Layer 3: RUN pip install redis   ← 只读
Layer 2: COPY requirements.txt   ← 只读
Layer 1: FROM python:3.11-slim   ← 只读
```

**关键特性**：多个容器共享相同的只读层，因此启动 100 个 Redis 容器几乎不额外占用磁盘空间。但注意：修改大文件时，整个文件会被复制到可写层，可能导致磁盘膨胀。

### 2.2 容器生命周期

```
Created → Running → Paused → Stopped → Deleted
              ↓                    ↑
           Killed/OOM ─────────────┘
```

- `docker create`：分配文件系统、网络，进程未启动（Created）
- `docker start`：启动入口进程（Running）
- `docker pause`：冻结 cgroup，暂停 CPU 调度（Paused，进程不终止）
- `docker stop`：SIGTERM → 10s 超时 → SIGKILL（Stopped）
- `docker kill`：直接 SIGKILL（Stopped）
- `docker rm`：删除可写层，释放资源（Deleted）

**陷阱**：容器停止后，可写层数据**仍保留**，直到执行 `docker rm`。若容器被 OOM（内存溢出）杀死，退出码通常为 137（SIGKILL），可通过 `docker ps -a` 查看。

## 三、动手实践与常见陷阱

### 3.1 安装与验证

```bash
# macOS (推荐 OrbStack 或 Docker Desktop)
brew install --cask docker
# Linux
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # 免 sudo，需重新登录生效
```

`docker run hello-world` 背后流程：
1. 客户端请求 daemon
2. 本地无 `hello-world:latest` → 从 Docker Hub 拉取
3. 创建容器，输出文本，退出（exit 0）

### 3.2 核心命令与避坑指南

```bash
docker pull nginx:alpine       # 拉取镜像，注意 :latest 标签非固定版本，生产务必指定具体版本
docker images                  # 列出本地镜像
docker run -d -p 8080:80 \
  --name my-nginx nginx:alpine # 后台运行，端口映射（主机端口冲突会报错）
docker ps                      # 运行中容器
docker ps -a                   # 所有容器，含已停止，关注退出码
docker logs my-nginx           # 查看日志
docker exec -it my-nginx sh    # Alpine 无 bash，用 sh 进入
docker stop my-nginx           # 停止容器，可写层保留
docker rm my-nginx             # 删除容器，可写层数据永久丢失
docker rmi nginx:alpine        # 删除镜像（若有容器依赖需先删容器或 -f 强制）
```

**关键心智模型**：容器是无状态的，持久化数据必须通过 Volume 挂载（后续课程深入）。`--name` 必须唯一，否则冲突；`-p` 映射时确保主机端口空闲。

### 3.3 日常操作模式

```
docker pull → docker run → docker exec（调试）→ docker stop → docker rm
```

**陷阱**：`docker run` 默认前台运行，Ctrl+C 会发送 SIGINT 导致容器停止；使用 `-d` 后台运行。若容器内进程无前台任务（如 shell 脚本执行完），容器会立即退出。

## 四、为 Kubernetes 铺路

Docker 是单机容器运行时，Kubernetes 是集群编排器。对应关系：

| Docker | Kubernetes |
|--------|------------|
| 容器 | Pod 中的容器 |
| 镜像 | Pod spec 的 image 字段 |
| docker run | kubectl run / Deployment |
| docker-compose | Helm / Kustomize |
| Volume | PersistentVolume |

现在用 `docker run redis` 启动单实例，未来在 K8s 中只需声明 Deployment YAML，指定副本数即可。底层容器启动逻辑完全一致——扎实掌握 Docker 是理解 K8s 的必经之路。

**下一步**：本地运行 Redis 容器，用 `redis-cli` 连接并执行 `PING`。然后思考：容器挂了如何自动重启？答案就在 Kubernetes 的自愈机制中。