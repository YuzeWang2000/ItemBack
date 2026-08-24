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
scripts/               隔离 PostgreSQL 集成/E2E 测试启动器
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

先确认 Docker Desktop 已启动，并在终端中验证：

```powershell
docker --version
docker compose version
```

如果本机已安装 Docker Desktop，但 PowerShell 提示找不到 `docker`，可先为当前终端补充安装目录：

```powershell
$env:Path += ";$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin"
```

## 本地启动

1. 创建环境文件并修改密码：

   ```powershell
   Copy-Item .env.example .env
   ```

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

首次运行浏览器测试前需安装 Chromium：

```bash
pnpm exec playwright install chromium
```

测试命令会通过 `embedded-postgres` 自动启动与停止独立的真实 PostgreSQL，端口固定为 55432/55433，并且只会清理仓库内 `.test-data/` 下的专用目录。运行环境必须允许启动本机子进程；包管理器会按 Windows、Linux 或 macOS 的当前平台安装对应二进制。

## 数据库重置与备份

开发环境完全重置：

```bash
pnpm db:reset
```

该命令不可恢复。日常备份建议同时保存 PostgreSQL dump 和 `STORAGE_DIR` 指向的附件目录；只备份其中一方会造成附件记录与文件不一致。

## 环境变量

完整清单和安全默认说明见 [.env.example](.env.example)。重要项：

- `DATABASE_URL`：PostgreSQL 连接串
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`：单用户首次初始化账号
- `WEB_ORIGIN`：允许携带 Cookie 调用 API 的精确前端源
- `STORAGE_DIR`：后端私有附件目录，不应由 Nginx/静态服务器公开
- `MAX_FILE_SIZE_MB`：单文件大小上限，默认 25 MiB
- `SESSION_DAYS`：会话有效天数
- `VITE_API_URL`：浏览器访问的 API 根地址；本地默认 `/api/v1`，由 Vite 代理到 API

## 生产部署参考

仓库提供 [docker-compose.prod.yml](docker-compose.prod.yml)、[API Dockerfile](Dockerfile.api) 与 [Web Dockerfile](Dockerfile.web)。在可信服务器上：

1. 从 `.env.production.example` 创建不提交版本库的 `.env.production`，使用随机高强度数据库与管理员密码；保持 `POSTGRES_PASSWORD` 与 `DATABASE_URL` 内经 URL 编码的密码一致。生产 `DATABASE_URL` 的主机必须是 Compose 服务名 `postgres`，并把 `WEB_ORIGIN` 设置为实际 HTTPS 站点。
2. 为 `itemback_postgres_prod` 和 `itemback_storage_prod` 配置持久化备份。
3. 执行 `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build`。
4. 在公网入口终止 TLS；不要直接暴露 PostgreSQL 端口。
5. 部署前先在独立数据库运行 `pnpm verify`，并保留数据库与附件目录的同一时间点备份。

Web 容器会把 `/api/` 反向代理到 API；API 容器启动前执行 `prisma migrate deploy`。本参考是单机部署基线，高可用环境应把 PostgreSQL 和附件存储换成托管数据库与实现同一 `FileStorage` 接口的对象存储。

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
