#!/usr/bin/env bash
set -Eeuo pipefail

workspace="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$workspace"
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "拒绝更新：生产工作区存在未提交或未跟踪的文件。请先确认、提交或清理这些变更。" >&2
  exit 2
fi
echo "准备发布提交: $(git rev-parse --short HEAD)"
node scripts/check-docs.mjs
echo "步骤 1/2：备份当前生产数据库和附件。"
bash scripts/prod-backup.sh
echo "步骤 2/2：重新构建镜像、应用 migrations 并启动服务。"
bash scripts/prod-init.sh
echo "生产更新完成。请运行 pnpm prod:status，并按 docs/OPERATIONS.md 完成冒烟检查。"
