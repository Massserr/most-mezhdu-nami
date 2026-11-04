#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  printf 'Установите Node.js 22 или новее с https://nodejs.org/\n'
  read -r reply
  exit 1
fi
node scripts/server.cjs
