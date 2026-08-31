# 宿主机数据、初始化、备份与重置

生产 Compose 使用宿主机 bind mount，不再把正式数据只放在 Docker Desktop 的内部 volume 中。当前 Mac 的数据目录由 `.env.production` 的 `ITEMBACK_DATA_DIR` 决定：

```text
/Users/atikwang/Workspace/ItemBack/data/prod/
├── postgres/  PostgreSQL 物理数据
└── storage/   附件文件
```

删除或重建容器不会删除这里的数据；即使卸载 Docker Desktop，目录仍保留。但本机磁盘损坏、误删目录仍会造成丢失，因此必须保留数据库逻辑备份和附件备份。

## 初始化或正常启动

```bash
cd /Users/atikwang/Workspace/ItemBack
bash scripts/prod-init.sh
```

脚本创建数据目录、构建容器、初始化 PostgreSQL、执行 Prisma migrations 并启动服务。已有数据时不会清空。

## 创建一致性备份

```bash
bash scripts/prod-backup.sh
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
bash scripts/prod-reset.sh
```

自动化执行：

```bash
bash scripts/prod-reset.sh --yes
```

重置前会自动备份，然后清空业务数据库和全部附件，重新执行 migrations，并由 API 初始化管理员账号。不要把 `--yes` 放进日常启动脚本。

## 禁止事项

- 不要手工编辑 `data/prod/postgres/` 中的文件。
- 不要只备份 PostgreSQL 或只备份附件；二者必须成对保存。
- 不要把 `data/`、`backups/` 或 `.env.production` 提交到 Git。
- `docker compose down` 不会删除 bind mount 数据，但仍不要随意删除 `data/prod/`。
