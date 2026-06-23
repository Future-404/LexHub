#!/usr/bin/env bash
# ===================================================================
#  LexHub — Go CLI Launcher Auto-Compiler Wrapper
# ===================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ ! -f ./lh ]; then
    echo "[LexHub Wrapper] 正在编译 Go 引导/管理程序..."
    go build -o lh .
fi

exec ./lh "$@"
