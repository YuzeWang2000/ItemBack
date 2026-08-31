#!/usr/bin/env bash
set -Eeuo pipefail

workspace="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$workspace/.env.production"
compose_file="$workspace/docker-compose.prod.yml"
stamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="${1:-$workspace/backups/manual-$stamp}"
if [[ "$backup_dir" != /* ]]; then backup_dir="$PWD/$backup_dir"; fi

[[ -f "$env_file" ]] || { echo "找不到 $env_file" >&2; exit 1; }
data_dir="$(sed -n 's/^ITEMBACK_DATA_DIR=//p' "$env_file" | tail -n 1)"
[[ "$data_dir" = /* && "$data_dir" != "/" && "$data_dir" != "$HOME" ]] || {
  echo "ITEMBACK_DATA_DIR 不安全或不是绝对路径。" >&2; exit 1;
}
[[ ! -e "$backup_dir" ]] || { echo "备份目标已存在: $backup_dir" >&2; exit 1; }

mkdir -p "$backup_dir"
cd "$workspace"
docker compose --env-file "$env_file" -f "$compose_file" up -d postgres
docker compose --env-file "$env_file" -f "$compose_file" stop web api >/dev/null

restart_services() {
  docker compose --env-file "$env_file" -f "$compose_file" up -d api web >/dev/null || true
}
trap restart_services EXIT

postgres_container="$(docker compose --env-file "$env_file" -f "$compose_file" ps -q postgres)"
docker exec "$postgres_container" sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl -f /tmp/itemback-backup.dump'
docker cp "$postgres_container:/tmp/itemback-backup.dump" "$backup_dir/itemback.dump" >/dev/null
tar -czf "$backup_dir/storage.tar.gz" -C "$data_dir/storage" .
shasum -a 256 "$backup_dir/itemback.dump" "$backup_dir/storage.tar.gz" > "$backup_dir/SHA256SUMS"

echo "备份完成: $backup_dir"
