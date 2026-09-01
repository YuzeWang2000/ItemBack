# ItemBack 架构与关键业务规则

## 运行关系

```text
React / React Router / TanStack Query
               │ credentials: include
               ▼
       NestJS REST /api/v1
        │                 │
        ▼                 ▼
 Prisma + PostgreSQL   FileStorage interface
                          └─ LocalFileStorage（私有目录）
```

Web 不直接读取数据库或附件目录。API 是树规则、认证、成本派生字段、移动历史和附件授权的唯一边界。

## 认证

`User` 保存 bcrypt 哈希，`AuthSession` 只保存随机会话令牌的 SHA-256 哈希。原始令牌仅存在于 `itemback_session` Cookie 中，属性为 `HttpOnly`、`SameSite=Lax`，生产环境启用 `Secure`。全局 Guard 默认保护全部控制器，只有健康检查和登录显式公开。

退出会删除服务端会话并清理 Cookie。过期会话在认证时删除。API 错误不会返回堆栈、密码、数据库连接信息或文件路径。

## 位置树

所有空间和物品都在 `Node` 表中：

- `SPACE` 必须 `parentId = null`，业务服务创建时固定 `isContainer = true`。
- `ITEM` 必须有父节点；父节点只能是 `SPACE` 或 `isContainer = true` 的未归档 `ITEM`。
- 移动前从目标节点沿父链向上检查；遇到当前物品即拒绝，因此不能移动到自身或后代。
- 父链检查同时使用 visited set，数据库若因外部写入已损坏，也不会无限循环。
- 空间或容器只要仍有未归档直接子节点，归档/删除就返回 409；把容器改成普通物品使用相同保护。
- 移动节点更新和 `Movement` 创建位于同一事务中。

物品标签通过 `Tag` / `NodeTag` 多对多关系保存；同名标签按规范化名称复用，编辑物品时在事务中整体替换标签关联。未被任何物品使用的标签会清理。

应用不向用户提供物理删除物品的入口。空顶层空间的“删除”同样使用可恢复的归档语义。附件删除是明确操作，会先删除数据库记录，再尝试清理文件；清理异常进入服务端日志。上传先写入安全文件，再用事务创建所有记录；数据库失败会清理本批文件。

## 金额与自然日

`valueAmount` 使用 PostgreSQL `DECIMAL(19,4)` / Prisma `Decimal`，API 以字符串返回，前端只在显示阶段格式化。不同币种永不相加，仪表盘返回 `{ currency, amount }` 数组。

持有天数按 UTC 日期部分计算：

```text
holdingDays = max(1, endDate 或 today - acquiredDate + 1)
dailyCost   = valueAmount / holdingDays
```

缺少入手日期时两个派生值均为空；有日期但缺少价值时只返回持有天数，日均成本为空。结束日期和有效期均不得早于入手日期。

## 附件安全

- Multer 使用内存缓冲并限制单文件/总文件数，大小来自 `MAX_FILE_SIZE_MB`。
- `LocalFileStorage` 生成 `YYYY/MM/<uuid>.bin`，不使用用户文件名构造路径。
- 每次解析 storage key 都先做严格格式校验，再验证解析路径仍在基目录内。
- 原始文件名只作为元数据和下载文件名，移除控制字符及路径分隔符。
- 内容接口经过认证；磁盘目录从不注册为公开静态目录。
- 仅 JPEG/PNG/GIF/WebP/AVIF 可以 inline；SVG、HTML、PDF、文档和未知类型强制以 `application/octet-stream` + `attachment` 下载，并附带 `nosniff`。
- 每个附件保存 SHA-256 校验和，响应永不暴露 `storageKey` 或绝对路径。

## API 约定

所有业务路由位于 `/api/v1`。验证使用白名单模式，未知字段会被拒绝。错误结构统一为：

```json
{
  "statusCode": 409,
  "code": "MOVE_TO_DESCENDANT",
  "message": "不能把物品移动到自己的后代中",
  "timestamp": "2026-08-21T12:00:00.000Z",
  "path": "/api/v1/nodes/.../move"
}
```

搜索把连续空白规范成单个空格、限制 100 字符，按名称、品牌中文名或常用名、品牌英文名、型号、序列号、描述和标签进行大小写不敏感匹配，并返回分页信息和每项完整路径。`GET /items` 返回不受位置限制的全部物品，并支持状态与多标签交集筛选。

## 测试边界

- 单元：日期边界、当天、结束日、缺金额/日期、零金额、非法父节点、自身/后代移动、非空归档、存储 key 路径穿越。
- 集成：用原生 PostgreSQL 迁移后通过 Supertest 验证认证、创建、嵌套、成本、有效期、标签替换/筛选、空空间删除、循环拒绝、移动、搜索、统计、多附件和主动内容下载。
- E2E：在桌面 Chrome 和 Pixel 7 视口中完成真实 UI 流，刷新数据来自 PostgreSQL；额外验证未认证 API 访问。
