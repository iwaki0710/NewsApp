#!/bin/sh
set -eu

# Prefer Codex's bundled modern Node.js when the system Node is too old.
codex_node="${CODEX_NODE:-$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
system_node="$(command -v node 2>/dev/null || true)"

if [ -n "$system_node" ]; then
  system_major="$($system_node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
else
  system_major=0
fi

if [ "$system_major" -ge 22 ]; then
  runtime_node="$system_node"
elif [ -x "$codex_node" ]; then
  runtime_node="$codex_node"
else
  echo "Node.js 22.13.0 以上が必要です（現在: $(node -v 2>/dev/null || echo '未インストール')）。" >&2
  echo "Node.jsを更新してから、もう一度 npm run $1 を実行してください。" >&2
  exit 1
fi

exec "$runtime_node" ./node_modules/vinext/dist/cli.js "$@"
