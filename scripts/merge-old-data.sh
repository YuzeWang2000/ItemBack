#!/usr/bin/env bash
set -Eeuo pipefail

workspace="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$workspace/docker-compose.prod.yml"
env_file="$workspace/.env.production"
apply=false

usage() {
  echo "用法: scripts/merge-old-data.sh <旧数据库.dump> <旧附件目录> [--apply]"
  echo "不加 --apply 时只恢复临时库并预检，不修改当前数据。"
}

if [[ $# -lt 2 || $# -gt 3 ]]; then usage; exit 2; fi
dump_path="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
storage_path="$(cd "$2" && pwd)"
if [[ "${3:-}" == "--apply" ]]; then apply=true
elif [[ $# -eq 3 ]]; then usage; exit 2
fi

[[ -f "$dump_path" ]] || { echo "找不到旧数据库备份: $dump_path" >&2; exit 1; }
[[ -d "$storage_path" ]] || { echo "找不到旧附件目录: $storage_path" >&2; exit 1; }
[[ -f "$env_file" ]] || { echo "找不到 $env_file" >&2; exit 1; }
command -v docker >/dev/null || { echo "找不到 docker" >&2; exit 1; }
docker compose version >/dev/null

cd "$workspace"
docker compose --env-file "$env_file" -f "$compose_file" up -d postgres
postgres_container="$(docker compose --env-file "$env_file" -f "$compose_file" ps -q postgres)"
[[ -n "$postgres_container" ]] || { echo "PostgreSQL 容器未运行" >&2; exit 1; }

cleanup() {
  docker exec "$postgres_container" sh -c \
    'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\''itemback_old_import'\'' AND pid <> pg_backend_pid()" >/dev/null; dropdb --if-exists -U "$POSTGRES_USER" itemback_old_import' \
    >/dev/null 2>&1 || true
  if [[ "$apply" == true ]]; then
    docker compose --env-file "$env_file" -f "$compose_file" up -d >/dev/null || true
  fi
}
trap cleanup EXIT

docker exec "$postgres_container" sh -c \
  'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\''itemback_old_import'\'' AND pid <> pg_backend_pid()" >/dev/null; dropdb --if-exists -U "$POSTGRES_USER" itemback_old_import; createdb -U "$POSTGRES_USER" itemback_old_import'
docker cp "$dump_path" "$postgres_container:/tmp/itemback-old.dump" >/dev/null

if docker exec "$postgres_container" sh -c \
  'pg_restore --list /tmp/itemback-old.dump >/dev/null 2>&1'; then
  docker exec "$postgres_container" sh -c \
    'pg_restore -U "$POSTGRES_USER" -d itemback_old_import --no-owner --no-acl --exit-on-error /tmp/itemback-old.dump'
else
  docker exec "$postgres_container" sh -c \
    'psql -U "$POSTGRES_USER" -d itemback_old_import -v ON_ERROR_STOP=1 -f /tmp/itemback-old.dump'
fi

old_url="postgresql://itemback:$(sed -n 's/^POSTGRES_PASSWORD=//p' "$env_file")@postgres:5432/itemback_old_import?schema=public"
docker compose --env-file "$env_file" -f "$compose_file" run --rm \
  -e "DATABASE_URL=$old_url" api ./node_modules/.bin/prisma migrate deploy

if [[ "$apply" == true ]]; then
  backup_dir="$workspace/backups/pre-merge-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$backup_dir/storage"
  echo "停止 Web/API 并备份当前数据到 $backup_dir"
  docker compose --env-file "$env_file" -f "$compose_file" stop web api
  docker exec "$postgres_container" sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl -f /tmp/itemback-current.dump'
  docker cp "$postgres_container:/tmp/itemback-current.dump" "$backup_dir/itemback-current.dump" >/dev/null
  api_container="$(docker compose --env-file "$env_file" -f "$compose_file" ps -aq api)"
  [[ -n "$api_container" ]] || { echo "找不到 API 容器" >&2; exit 1; }
  docker cp "$api_container:/data/storage/." "$backup_dir/storage" >/dev/null
fi

merge_command=(
  docker compose --env-file "$env_file" -f "$compose_file" run --rm
  -e "OLD_DATABASE_URL=$old_url"
  -e OLD_STORAGE_DIR=/import/storage
  -e STORAGE_DIR=/data/storage
  -v "$storage_path:/import/storage:ro"
  -v "$workspace/scripts/merge-old-data.mjs:/app/apps/api/merge-old-data.mjs:ro"
  api node merge-old-data.mjs
)
if [[ "$apply" == true ]]; then
  "${merge_command[@]}" --apply
else
  "${merge_command[@]}"
fi

if [[ "$apply" == true ]]; then
  echo "合并完成，当前数据备份位于: $backup_dir"
fi
