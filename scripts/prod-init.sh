#!/usr/bin/env bash
set -Eeuo pipefail

workspace="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$workspace/.env.production"
compose_file="$workspace/docker-compose.prod.yml"

[[ -f "$env_file" ]] || { echo "找不到 $env_file，请先从 .env.production.example 创建。" >&2; exit 1; }
command -v docker >/dev/null || { echo "找不到 docker。" >&2; exit 1; }
docker compose version >/dev/null

data_dir="$(sed -n 's/^ITEMBACK_DATA_DIR=//p' "$env_file" | tail -n 1)"
[[ "$data_dir" = /* ]] || { echo "ITEMBACK_DATA_DIR 必须是绝对路径。" >&2; exit 1; }
[[ "$data_dir" != "/" && "$data_dir" != "$HOME" ]] || { echo "拒绝使用危险的数据目录: $data_dir" >&2; exit 1; }

mkdir -p "$data_dir/postgres" "$data_dir/storage"
chmod 700 "$data_dir/postgres" "$data_dir/storage"

cd "$workspace"
docker compose --env-file "$env_file" -f "$compose_file" up -d postgres
postgres_container="$(docker compose --env-file "$env_file" -f "$compose_file" ps -q postgres)"
for _attempt in $(seq 1 60); do
  if docker exec "$postgres_container" sh -c 'pg_isready -U "$POSTGRES_USER" -d postgres' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$postgres_container" sh -c 'pg_isready -U "$POSTGRES_USER" -d postgres' >/dev/null
docker exec "$postgres_container" sh -c \
  'psql -U "$POSTGRES_USER" -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '\''$POSTGRES_DB'\''" | grep -q 1 || createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose --env-file "$env_file" -f "$compose_file" up -d --build api web
web_port="$(sed -n 's/^WEB_PORT=//p' "$env_file" | tail -n 1)"
web_port="${web_port:-80}"
if command -v scutil >/dev/null 2>&1; then
  local_host="$(scutil --get LocalHostName 2>/dev/null || hostname)"
  [[ "$web_port" = "80" ]] && access_url="http://${local_host}.local" || access_url="http://${local_host}.local:${web_port}"
else
  [[ "$web_port" = "80" ]] && access_url="http://localhost" || access_url="http://localhost:${web_port}"
fi
echo "初始化完成。数据目录: $data_dir"
echo "访问地址: $access_url"
