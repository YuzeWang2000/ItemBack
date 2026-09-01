# 宿主机数据、初始化、备份与重置

生产 Compose 使用宿主机 bind mount，不再把正式数据只放在 Docker Desktop 的内部 volume 中。实际数据目录由 `.env.production` 的 `ITEMBACK_DATA_DIR` 决定，例如：

```text
/srv/itemback-data/
├── postgres/  PostgreSQL 物理数据
└── storage/   附件文件
```

删除或重建容器不会删除这里的数据；即使卸载 Docker Desktop，目录仍保留。但本机磁盘损坏、误删目录仍会造成丢失，因此必须保留数据库逻辑备份和附件备份。

## 首次初始化

```bash
pnpm prod:init
```

脚本创建数据目录、构建容器、初始化 PostgreSQL、执行 Prisma migrations 并启动服务。已有数据时不会清空。

## 创建一致性备份

```bash
pnpm prod:backup
```

备份默认写入 `backups/manual-时间/`，包含：

```text
itemback.dump
storage.tar.gz
SHA256SUMS
```

备份时 Web/API 会短暂停止，结束后自动启动，以保证数据库记录和附件来自同一时间点。应定期把整个备份目录复制到另一块磁盘或可信备份服务。

## 重置数据库和附件

交互式执行：

```bash
pnpm prod:reset
```

确实需要在自动化环境中跳过交互确认时，可直接调用底层脚本：

```bash
bash scripts/prod-reset.sh --yes
```

重置前会自动备份，然后清空业务数据库和全部附件，重新执行 migrations，并由 API 初始化管理员账号。不要把 `--yes` 放进日常启动脚本。

## 禁止事项

- 不要手工编辑 `ITEMBACK_DATA_DIR/postgres/` 中的文件。
- 不要只备份 PostgreSQL 或只备份附件；二者必须成对保存。
- 不要把 `data/`、`backups/` 或 `.env.production` 提交到 Git。
- `docker compose down` 不会删除 bind mount 数据，但仍不要随意删除 `ITEMBACK_DATA_DIR`。

日常启动、正常停止和功能更新的完整顺序见 [`OPERATIONS.md`](OPERATIONS.md)。
