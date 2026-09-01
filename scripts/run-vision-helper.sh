#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/../native/background-removal-helper" && pwd)"
helper="$project_dir/.build/release/itemback-vision-helper"
token="${ITEMBACK_VISION_TOKEN:-}"

if [[ ${#token} -lt 32 ]]; then
  echo "请先设置至少 32 字符的 ITEMBACK_VISION_TOKEN" >&2
  exit 2
fi
if [[ ! -x "$helper" ]]; then
  echo "助手尚未构建，请先运行 scripts/build-vision-helper.sh" >&2
  exit 2
fi
exec "$helper" --serve
