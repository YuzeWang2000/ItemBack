# ItemBack v0.1

ItemBack 是一个面向长期持有的个人物品档案系统。它用空间与容器组成一棵现实位置树，记录物品价值、入手时间、日均成本、移动历史和私有附件。

当前版本是可实际运行的前后端分离 MVP：React Web 客户端通过 `/api/v1` REST API 访问 NestJS 服务，业务数据由 PostgreSQL 持久化，附件由后端保存在私有目录中并经过认证后提供。

## 已实现

- 单用户初始化、bcrypt 密码哈希、HttpOnly Cookie 会话、登录和退出
- `SPACE` / `ITEM` 统一节点模型，容器嵌套、面包屑与完整位置树
- 后端强制父节点、空容器归档、空顶层空间删除与循环检测规则
- Decimal 金额、包含首日的自然日持有天数、分币种价值及日均成本统计
- 全部物品卡片视图，支持状态与多标签组合筛选
- 物品有效期、多标签创建/选择/编辑，以及按标签搜索
- 多文件拖放/选择上传、Web 随手拍，图片预览，PDF/文档/压缩包下载，认证访问与安全存储名
- 移动历史、全字段物品编辑、归档、跨字段搜索与完整路径
- 响应式登录、仪表盘、空间浏览、表单、详情和搜索页面
- Swagger、数据库迁移、可重复 seed、结构化生产日志、健康检查
- 单元测试、真实 PostgreSQL API 集成测试、桌面/窄屏 Playwright 验收

详细设计见 [架构与业务规则](docs/ARCHITECTURE.md)。

## 目录

```text
apps/
  api/                 NestJS API、Prisma schema/迁移、私有文件存储
  web/                 React + Vite + Tailwind CSS Web 客户端
packages/
  contracts/           前后端共享的枚举与响应类型
scripts/               开发测试、生产初始化/备份/重置和旧数据合并脚本
tests/e2e/             Playwright 关键用户流
docs/                  架构和业务规则说明
docker-compose.yml     本地 PostgreSQL
docker-compose.prod.yml 生产容器参考
```

## 环境要求

- Node.js 22 或 24
- pnpm 11（根目录已声明准确版本）
- Docker Desktop / Docker Engine + Compose（常规本地开发）
- 支持当前平台的 embedded-postgres 二进制（自动化测试使用；不替代开发或生产数据库）

先确认 Docker Desktop / Docker Engine 已启动，并在终端中验证：

```powershell
docker --version
docker compose version
```

如果本机已安装 Docker Desktop，但 PowerShell 提示找不到 `docker`，可先为当前终端补充安装目录：

```powershell
$env:Path += ";$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin"
```

macOS 和 Linux 通常可直接在 Bash/Zsh 中执行本文的 `bash` 命令。Windows 建议使用 PowerShell；本地开发复制环境文件时分别使用：

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```bash
# macOS / Linux
cp .env.example .env
```

## 生产 Docker 快速使用

生产模式下，PostgreSQL、API 和 Web 都运行在 Docker 中。首次部署或代码、依赖、Docker 配置有变化时：

```bash
pnpm prod:init
```

也可绕过 pnpm，直接执行同一个脚本：

```bash
bash scripts/prod-init.sh
```

`prod:init` 会创建/检查宿主机数据目录、确保数据库存在、构建镜像、执行 Prisma migrations 并启动服务。它可以重复执行，不会清空已有数据。工作区已关闭 pnpm 的“运行脚本前自动安装依赖”，因此该命令不会先在宿主机下载整套开发依赖；构建镜像时仍会在 Docker 内安装当前 Linux 架构所需依赖。

日常启停的简单记忆：

```bash
# 停止并删除容器/网络；不删除宿主机数据
docker compose --env-file .env.production -f docker-compose.prod.yml down

# 代码没变：使用已有镜像快速启动
docker compose --env-file .env.production -f docker-compose.prod.yml up -d

# 代码、依赖或 Docker 配置有变化：重新检查、构建并启动
pnpm prod:init
```

查看状态和日志：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100
```

默认 Web 地址为 <http://localhost:8080>。同一局域网设备使用 `http://<Mac或服务器的局域网IP>:8080`；macOS 可用 `ipconfig getifaddr en0` 查询常见主网络接口地址。

不要在生产命令后添加 `-v`，不要删除 `ITEMBACK_DATA_DIR` 指向的目录。虽然 bind mount 数据不随容器消失，但仍需定期执行成对备份。

## 本地开发启动

1. 创建环境文件并修改密码：

   Windows PowerShell 使用 `Copy-Item .env.example .env`；macOS/Linux 使用 `cp .env.example .env`。

   至少修改 `POSTGRES_PASSWORD`、`DATABASE_URL` 中对应的密码，以及 `ADMIN_PASSWORD`。两个数据库密码必须一致；直接写入连接串时，请使用 URL 安全字符，或对特殊字符做 URL 编码。不要提交 `.env`。

2. 启动 PostgreSQL：

   ```bash
   docker compose up -d --wait postgres
   ```

3. 安装、生成客户端、迁移并写入示例数据：

   ```bash
   pnpm install
   pnpm db:generate
   pnpm db:migrate
   pnpm db:seed
   ```

4. 同时启动 API 与 Web：

   ```bash
   pnpm dev
   ```

5. 打开：

   - Web：<http://localhost:5173>
   - API 健康检查：<http://localhost:3000/api/v1/health>
   - Swagger：<http://localhost:3000/api/docs>

`ADMIN_EMAIL` / `ADMIN_PASSWORD` 是单用户初始化账号。API 首次启动时，如果邮箱不存在，会以 bcrypt cost 12 创建账号；之后修改环境变量不会静默重置现有密码。Seed 也会确保该邮箱存在，但不会覆盖已有密码。

## 示例数据

`pnpm db:seed` 可重复执行，并确保以下有效层级存在：

```text
家
└─ 通勤书包（容器，有价值和日期）
   └─ 技术书籍（无价值，有日期）
公司
└─ 机械键盘（有价值，缺少日期）
```

## 常用命令

| 命令                    | 作用                                                      |
| ----------------------- | --------------------------------------------------------- |
| `pnpm dev`              | 启动 API 与 Web 开发服务器                                |
| `pnpm lint`             | 检查全部 TypeScript 源码与测试                            |
| `pnpm test`             | 运行纯单元测试                                            |
| `pnpm build`            | 生成前后端生产构建                                        |
| `pnpm test:integration` | 启动隔离的真实 PostgreSQL 并运行 API 集成流程             |
| `pnpm test:e2e`         | 构建、迁移、seed、启动完整应用并用 Chromium 验收桌面/窄屏 |
| `pnpm verify`           | 顺序执行 lint、单元、构建、集成和 E2E                     |
| `pnpm db:migrate`       | 在开发数据库创建/应用迁移                                 |
| `pnpm db:seed`          | 可重复写入示例数据和初始化账号                            |
| `pnpm db:reset`         | **删除当前数据库全部数据**，重放迁移与 seed               |
| `pnpm prod:init`        | 检查宿主机数据目录、构建并启动生产 Docker 服务            |
| `pnpm prod:backup`      | 成对备份生产数据库和附件                                  |
| `pnpm prod:reset`       | 确认并备份后，重置生产数据库和全部附件                    |

首次运行浏览器测试前需安装 Chromium：

```bash
pnpm exec playwright install chromium
```

测试命令会通过 `embedded-postgres` 自动启动与停止独立的真实 PostgreSQL，端口固定为 55432/55433，并且只会清理仓库内 `.test-data/` 下的专用目录。运行环境必须允许启动本机子进程；包管理器会按 Windows、Linux 或 macOS 的当前平台安装对应二进制。

## 数据存储、备份与重置

生产 Compose 不把正式数据只放在 Docker Desktop 内部 volume，而是通过 bind mount 写入 `ITEMBACK_DATA_DIR`：

```text
ITEMBACK_DATA_DIR/
├── postgres/  PostgreSQL 物理数据（禁止手工编辑）
└── storage/   图片、PDF 和其他附件
```

删除或重建容器不会删除这些文件；卸载 Docker Desktop 也不会主动删除该宿主机目录。但是，误删目录、磁盘损坏或删除整个项目仍会丢失数据，所以必须保留独立备份。

创建数据库与附件同一时间点的一致性备份：

```bash
pnpm prod:backup
```

默认输出到 `backups/manual-日期时间/`，其中包含 `itemback.dump`、`storage.tar.gz` 和 `SHA256SUMS`。建议再复制到另一块磁盘、NAS 或可信备份服务。

重置生产数据：

```bash
pnpm prod:reset
```

脚本会先自动备份，并要求输入 `RESET ITEMBACK` 后才清空数据库与附件。自动化环境可显式使用 `bash scripts/prod-reset.sh --yes`，但不要将 `--yes` 放进日常启动流程。完整说明见 [宿主机数据维护](docs/LOCAL_DATA.md)。

拿到旧 PostgreSQL dump 和对应附件目录后，可先预检、再事务合并到当前数据；旧节点和附件会重映射 ID，不直接覆盖现有记录。完整步骤见 [旧 Windows 数据合并](docs/MAC_DATA_MERGE.md)。

开发环境完全重置：

```bash
pnpm db:reset
```

该命令不可恢复。开发和生产环境都必须同时保存 PostgreSQL dump 与附件；只备份其中一方会造成附件记录与文件不一致。

## 环境变量

完整清单和安全默认说明见 [.env.example](.env.example)。重要项：

- `DATABASE_URL`：PostgreSQL 连接串
- `ITEMBACK_DATA_DIR`：生产数据库和附件的宿主机绝对路径
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`：单用户首次初始化账号
- `WEB_ORIGIN`：允许携带 Cookie 调用 API 的精确前端源
- `COOKIE_SECURE`：HTTPS 部署保持 `true`；仅限可信局域网的 HTTP 部署设为 `false`
- `STORAGE_DIR`：后端私有附件目录，不应由 Nginx/静态服务器公开
- `MAX_FILE_SIZE_MB`：单文件大小上限，默认 25 MiB
- `SESSION_DAYS`：会话有效天数
- `VITE_API_URL`：浏览器访问的 API 根地址；本地默认 `/api/v1`，由 Vite 代理到 API

## 生产部署参考

仓库提供 [docker-compose.prod.yml](docker-compose.prod.yml)、[API Dockerfile](Dockerfile.api) 与 [Web Dockerfile](Dockerfile.web)。在可信服务器上：

1. 从 `.env.production.example` 创建不提交版本库的 `.env.production`，使用随机高强度数据库与管理员密码；保持 `POSTGRES_PASSWORD` 与 `DATABASE_URL` 内经 URL 编码的密码一致。生产 `DATABASE_URL` 的主机必须是 Compose 服务名 `postgres`，并把 `WEB_ORIGIN` 设置为实际 HTTPS 站点。
2. 把 `ITEMBACK_DATA_DIR` 设置为可信宿主机上的绝对路径，并为数据库和附件配置成对备份。
3. 执行 `pnpm prod:init`（或 `bash scripts/prod-init.sh`）。
4. 在公网入口终止 TLS；不要直接暴露 PostgreSQL 端口。
5. 部署前先在独立数据库运行 `pnpm verify`，并保留数据库与附件目录的同一时间点备份。

Web 容器会把 `/api/` 反向代理到 API；API 容器启动前执行 `prisma migrate deploy`。本参考是单机部署基线，高可用环境应把 PostgreSQL 和附件存储换成托管数据库与实现同一 `FileStorage` 接口的对象存储。

生产数据使用 `ITEMBACK_DATA_DIR` 指向的宿主机目录，不依赖 Docker Desktop 内部 volume。初始化、日常启停、成对备份和带确认的重置流程见 [宿主机数据维护](docs/LOCAL_DATA.md)。

## 当前有意保留的限制

- 单用户、无注册/找回密码/角色权限
- 本地私有附件目录；尚未接入 S3/R2/MinIO
- 搜索是数据库模糊匹配，没有全文索引和高级筛选
- 附件不做病毒扫描、OCR、AI 识别或内容转码
- 仪表盘按币种分别统计，不做汇率换算
- 归档后不在常规页面展示，v0.1 没有归档恢复界面
- 大型前端目前是单入口 bundle；MVP 规模下可接受，后续可按路由拆包

## 下一版本建议

优先考虑归档箱与恢复、标签与自定义字段、附件对象存储适配器、数据库全文搜索与筛选、备份/恢复向导，以及容器树的批量移动。OCR、AI 识别、多用户协作等仍应在基础档案可靠性稳定后再进入产品范围。
