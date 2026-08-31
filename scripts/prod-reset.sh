#!/usr/bin/env bash
set -Eeuo pipefail

workspace="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$workspace/.env.production"
compose_file="$workspace/docker-compose.prod.yml"

if [[ "${1:-}" != "--yes" ]]; then
  echo "警告：这会清空当前 ItemBack 数据库和全部附件。"
  echo "执行前会自动创建备份。"
  read -r -p '请输入 RESET ITEMBACK 继续: ' confirmation
  [[ "$confirmation" == "RESET ITEMBACK" ]] || { echo "已取消。"; exit 1; }
fi

backup_dir="$workspace/backups/pre-reset-$(date +%Y%m%d-%H%M%S)"
"$workspace/scripts/prod-backup.sh" "$backup_dir"

cd "$workspace"
docker compose --env-file "$env_file" -f "$compose_file" stop web api >/dev/null
postgres_container="$(docker compose --env-file "$env_file" -f "$compose_file" ps -q postgres)"
docker exec "$postgres_container" sh -c \
  'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\''$POSTGRES_DB'\'' AND pid <> pg_backend_pid()" >/dev/null; dropdb -U "$POSTGRES_USER" "$POSTGRES_DB"; createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose --env-file "$env_file" -f "$compose_file" run --rm --no-deps api \
  sh -c 'find /data/storage -mindepth 1 -delete'
docker compose --env-file "$env_file" -f "$compose_file" up -d api web

echo "重置完成。重置前备份: $backup_dir"
