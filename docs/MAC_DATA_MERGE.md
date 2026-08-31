# 旧 Windows 数据合并到 Mac 部署

本流程合并而不是覆盖：Mac 上新增的数据保留，旧节点、附件和移动记录使用新 UUID 导入；同名标签按标准化名称复用。旧用户和登录会话不会导入，继续使用 Mac 当前管理员账号。

## 需要准备

- PostgreSQL 备份：推荐 `pg_dump --format=custom` 生成的 `.dump`；也支持纯 SQL。
- 与该备份同一时间点的完整附件目录。目录下应直接包含 `YYYY/MM/<UUID>.bin`，不要额外多套一层 `storage`。
- 旧备份必须来自与当前项目兼容的 ItemBack schema。工具会先在临时数据库执行当前 migrations。

示例放置位置：

```text
migration/old/itemback.dump
migration/old/storage/2026/08/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.bin
```

## 执行清单

1. 保留旧备份原件，再复制一份用于本次操作。
2. 确认当前项目可以登录，并随机打开一个现有附件。
3. 只读预检：

   ```bash
   cd /Users/atikwang/Workspace/ItemBack
   bash scripts/merge-old-data.sh migration/old/itemback.dump migration/old/storage
   ```

4. 检查输出的旧数据数量、当前数据数量和附件校验结果。预检不会修改当前业务数据。
5. 正式合并：

   ```bash
   bash scripts/merge-old-data.sh migration/old/itemback.dump migration/old/storage --apply
   ```

6. 正式执行会停止 Web/API，在 `backups/pre-merge-时间/` 自动保存当前数据库和附件，然后执行事务合并并重新启动服务。
7. 登录后核对空间、物品、标签、移动历史、图片和文档。
8. 保留自动备份和旧迁移包，确认稳定后再转移到离线备份介质。

## 合并规则

- 所有旧节点、附件、移动记录生成新 UUID，所以不会覆盖 Mac 记录。
- 旧目录树关系和移动关系同步映射。
- 同一 `normalizedName` 的标签复用当前标签；其他标签新增。
- 每个旧附件验证文件存在、大小和 SHA-256，然后以新存储键复制。
- 封面附件在附件导入后重新关联。
- 旧账号、密码和会话不导入。
- 每份旧数据生成指纹清单；相同数据不能重复执行，防止重复导入。

## 回滚原则

不要手工删除部分导入记录。若验收失败，保持服务停止，使用正式执行前生成的 `itemback-current.dump` 和 `storage/` 整体恢复。恢复前先另外保存失败现场，避免丢失诊断信息。
