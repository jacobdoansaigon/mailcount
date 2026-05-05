#!/usr/bin/env bash
# Nối service mailcount với MongoDB Railway (variable reference).
# Điều kiện: đã `railway login`, đã tạo database Mongo trong cùng project.
# Cách dùng: ./scripts/railway-multiuser-wire-mongo.sh [TênServiceMongo]
# Mặc định tên service Mongo trên project anh: mailcountdb
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MONGO_SERVICE="${1:-mailcountdb}"
railway variable set -s mailcount -e production "MONGODB_URI=\${{${MONGO_SERVICE}.MONGO_URL}}"
echo "Đã đặt MONGODB_URI → \${{${MONGO_SERVICE}.MONGO_URL}}"
echo "Đặt thêm SMTP_USER + SMTP_PASS trên service mailcount (gửi magic link)."
