#!/bin/bash
# Deploy script cho server tvhub.vn — kéo code moi nhat + restart sach (khong trung tien trinh).
# Cach dung: cd /home/tvr/tokinarc-erp-main && ./deploy.sh
set -e
cd "$(dirname "$0")"

BACKEND=Tokinarc_Autoss/Tokinarc_V6_dev2_merged/backend

echo "== 1. Kep code moi nhat tu GitHub =="
git fetch origin
git reset --hard origin/main

echo "== 2. Chay migration DB (neu co model/bang moi) =="
"$BACKEND/venv/bin/python" "$BACKEND/manage.py" migrate --settings=tokinarc.settings.dev

echo "== 3. Tat tien trinh cu (theo dung port, khong dung cho project khac tren server) =="
sudo fuser -k 5905/tcp 2>/dev/null || true
sudo fuser -k 8443/tcp 2>/dev/null || true
sudo fuser -k 8008/tcp 2>/dev/null || true
sleep 2

echo "== 4. Khoi dong lai =="
./start_all.sh

echo "== Xong. Kiem tra bang: =="
echo "   ps aux | grep -E 'gunicorn|vite|uvicorn' | grep -v grep"
