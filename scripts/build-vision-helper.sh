#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/../native/background-removal-helper" && pwd)"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
export CLANG_MODULE_CACHE_PATH="${TMPDIR:-/tmp}/itemback-clang-cache"
export SWIFTPM_MODULECACHE_OVERRIDE="${TMPDIR:-/tmp}/itemback-swift-cache"

swift build --package-path "$project_dir" -c release
echo "$project_dir/.build/release/itemback-vision-helper"
