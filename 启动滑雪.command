#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "请先安装 Node.js 20.19+ 或 22.12+：https://nodejs.org/"
  echo "安装后，重新双击此文件即可。"
  read -r -p "按回车关闭…"
  exit 1
fi
node scripts/start.mjs
status=$?
if [ "$status" -ne 0 ]; then read -r -p "按回车关闭…"; fi
exit "$status"
