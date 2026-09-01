# ItemBack 运行与更新手册

本文是 ItemBack 启动、停止、更新、备份和子系统生命周期的操作基线。所有命令都在仓库根目录执行。架构设计见 [`ARCHITECTURE.md`](ARCHITECTURE.md)，生产数据安全细节见 [`LOCAL_DATA.md`](LOCAL_DATA.md)，Apple Vision 的实现边界见 [`LOCAL_BACKGROUND_REMOVAL.md`](LOCAL_BACKGROUND_REMOVAL.md)。

## 运行模式

ItemBack 有两种运行模式：

- 本地开发：PostgreSQL 在 Docker 中，API 和 Web 由 `pnpm dev` 在宿主机运行。Apple Vision 使用命令模式，由 API 按任务临时启动 Swift 子进程。
- 生产 Docker：`postgres`、`api`、`web` 都在 Docker 中。Apple Vision 无法在 Linux API 容器内运行，因此 Swift 助手作为 macOS 宿主机上的前台进程单独运行。

## 本地开发

### 首次准备

环境要求是 Node.js 22 或 24、pnpm 11、Docker Desktop / Docker Engine。需要本地抠图时，还需要 macOS 14 及完整 Xcode 工具链。

```bash
cp .env.example .env
pnpm install
docker compose up -d --wait postgres
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

修改 `.env` 中的数据库密码和管理员密码，并确保 `POSTGRES_PASSWORD` 与 `DATABASE_URL` 中的密码一致。首次使用 Apple Vision 时再执行：

```bash
pnpm vision:build
```

### 启动与确认

```bash
pnpm dev
```

启动成功后：

- Web：<http://localhost:5173>
- API 健康检查：<http://localhost:3000/api/v1/health>
- Swagger：<http://localhost:3000/api/docs>

### 停止

在运行 `pnpm dev` 的终端按 `Ctrl+C`，API 与 Web 会一起退出。开发环境的 Apple Vision 使用临时子进程，不需要另行停止。若暂时不再开发，可停止 PostgreSQL：

```bash
docker compose stop postgres
```

该命令保留开发数据库 volume；不要使用 `docker compose down -v`，除非明确要删除开发数据。

## 生产 Docker

### 首次部署

1. 从 `.env.production.example` 创建不会提交到 Git 的 `.env.production`。
2. 设置 URL 安全的数据库密码，并保持 `POSTGRES_PASSWORD` 与 `DATABASE_URL` 一致；`DATABASE_URL` 的主机必须是 `postgres`。
3. 把 `ITEMBACK_DATA_DIR` 设置为宿主机绝对路径。该目录保存 PostgreSQL 数据和全部附件，不得指向 `/` 或用户主目录。
4. `WEB_ORIGIN` 必须与用户实际访问的源完全一致。HTTPS 使用 `COOKIE_SECURE=true`；只有可信局域网 HTTP 才使用 `false`。
5. 如需 Apple Vision，设置 `VISION_HELPER_MODE=http`、`VISION_HELPER_URL=http://host.docker.internal:43118/remove-background`，并为 `VISION_HELPER_TOKEN` 生成至少 32 字符的随机密钥。

先构建并启动 Apple Vision 助手，再启动容器：

```bash
pnpm vision:build
export ITEMBACK_VISION_TOKEN='与 .env.production 中 VISION_HELPER_TOKEN 相同的密钥'
pnpm vision:serve
```

`pnpm vision:serve` 会占用当前终端。保持它运行，在第二个终端执行：

```bash
pnpm prod:init
```

`prod:init` 会创建或检查数据目录、启动 PostgreSQL、构建 API/Web 镜像、应用 Prisma migrations 并启动服务。它不会清空已有数据库或附件。

### 日常启动

Mac 重启或所有进程均已停止后：

1. 在第一个终端设置 `ITEMBACK_VISION_TOKEN`，执行 `pnpm vision:serve`。
2. 在第二个终端执行 `pnpm prod:start`，使用已有镜像启动 `postgres`、`api` 和 `web`。
3. 执行 `pnpm prod:status`，确认三个容器均为运行状态且健康检查没有失败。

如果不需要抠图，可以不启动 Swift 助手；物品、附件、搜索等功能仍可使用，只有移除背景会报告不可用。

### 正常停止

先在第二个终端停止 Docker 服务：

```bash
pnpm prod:stop
```

该命令删除容器和 Compose 网络，但保留 `ITEMBACK_DATA_DIR` 中的 PostgreSQL 与附件数据。随后回到运行 Apple Vision 助手的第一个终端，按 `Ctrl+C` 停止 Swift 进程。

不要为生产停止命令添加 `-v`，也不要删除 `ITEMBACK_DATA_DIR`。

## 发布功能更新

代码合并前在独立测试环境执行：

```bash
pnpm verify
```

在生产机器的仓库根目录获取已经审核的代码，然后执行一条更新命令：

```bash
git pull --ff-only origin main
pnpm prod:update
```

`prod:update` 会拒绝包含未提交或未跟踪文件的工作区，并先运行文档一致性检查；随后调用 `pnpm prod:backup`，生成同一时间点的数据库 dump 和附件压缩包，再重新构建镜像、应用 migrations 并启动服务。更新期间 Web/API 会短暂停止。更新脚本不执行 `git pull`，因此必须先确认目标提交正确。

如果本次更新修改了 `native/background-removal-helper/` 或 Xcode/Swift 构建配置，还需要：

1. 在助手终端按 `Ctrl+C` 停止旧助手。
2. 执行 `pnpm vision:build`。
3. 重新设置 `ITEMBACK_VISION_TOKEN` 并执行 `pnpm vision:serve`。

普通 Web/API 功能更新不需要重新构建 Swift 助手。

### 更新后确认

```bash
pnpm prod:status
pnpm prod:logs
```

随后至少完成以下冒烟检查：

1. 打开实际生产网址并成功登录。
2. 打开 `/api/v1/health`，确认返回成功。
3. 创建或打开一件物品，确认本次更新涉及的主要流程可用。
4. 上传并下载一个小型测试附件。
5. 如果启用了 Apple Vision，执行一次移除背景并确认生成新图片。

如果容器没有正常启动，不要重置数据。先查看 `pnpm prod:logs`，保留 `pnpm prod:update` 创建的备份，再根据错误修复配置或回退代码。数据库 migration 可能不支持仅靠回退 Git 提交撤销；需要恢复数据时，应同时使用同一次备份中的数据库和附件，不能只恢复其中一项。

## 备份与状态

手动创建数据库与附件的一致性备份：

```bash
pnpm prod:backup
```

备份位于 `backups/manual-日期时间/`，包含 `itemback.dump`、`storage.tar.gz` 和 `SHA256SUMS`。备份期间 Web/API 会短暂停止，并在结束后自动启动。

查看容器状态和最近日志：

```bash
pnpm prod:status
pnpm prod:logs
```

## 子系统生命周期

| 子系统                  | 启动方式                                                                                  | 停止方式                                                       | 不可用时的影响                       |
| ----------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------ |
| `postgres`              | 本地开发用 `docker compose up -d --wait postgres`；生产用 `pnpm prod:start` / `prod:init` | 本地用 `docker compose stop postgres`；生产用 `pnpm prod:stop` | API 无法读取或保存任何业务数据       |
| `api`                   | 本地随 `pnpm dev`；生产随 `pnpm prod:start` / `prod:init`                                 | 本地终端按 `Ctrl+C`；生产用 `pnpm prod:stop`                   | 登录、数据和附件接口不可用           |
| `web`                   | 本地随 `pnpm dev`；生产随 `pnpm prod:start` / `prod:init`                                 | 本地终端按 `Ctrl+C`；生产用 `pnpm prod:stop`                   | 浏览器界面不可访问，API 和数据仍保留 |
| Apple Vision Swift 助手 | 开发模式由 API 临时启动；生产在 Mac 执行 `pnpm vision:serve`                              | 开发模式随 API 退出；生产在助手终端按 `Ctrl+C`                 | 仅移除背景不可用，其他功能不受影响   |

生产助手默认只监听 `127.0.0.1:43118`，使用 `ITEMBACK_VISION_TOKEN` 鉴权。可在 Mac 上执行 `lsof -nP -iTCP:43118 -sTCP:LISTEN` 确认它正在监听；不要把该端口公开到局域网或公网。

## 文档同步检查

每次修改功能、命令、Compose 服务、环境变量、端口、migration 或子系统生命周期后，都要同步更新本手册及相关文档，并执行：

```bash
pnpm docs:check
```

该检查会核对运行命令是否真实存在、生产 Compose 的核心服务、关键生产环境变量、Apple Vision 的启动方式和默认端口，以及 README/项目约束是否仍指向本手册。
