#!/bin/bash
# Deploy script cho server tvhub.vn — keo code moi nhat + build frontend + restart sach.
# Cach dung: cd /home/tvr/tokinarc-erp-main && ./deploy.sh

set -e
cd "$(dirname "$0")"

BACKEND=Tokinarc_Autoss/Tokinarc_V6_dev2_merged/backend
FRONTEND=Tokinarc_Autoss/Tokinarc_V6_dev2_merged/frontend

echo "== 1. Kep code moi nhat tu GitHub =="
git fetch origin
git reset --hard origin/main

echo "== 2. Build frontend (ban tinh, Nginx serve truc tiep tu dist/) =="
(cd "$FRONTEND" && npm run build)

echo "== 3. Chay migration DB (neu co model/bang moi) =="
"$BACKEND/venv/bin/python" "$BACKEND/manage.py" migrate --settings=tokinarc.settings.dev

echo "== 4. Tat tien trinh cu (theo dung port, khong dung cho project khac tren server) =="
sudo fuser -k 5905/tcp 2>/dev/null || true
sudo fuser -k 8008/tcp 2>/dev/null || true
sleep 2

echo "== 5. Khoi dong lai =="
# Goi qua "bash" thay vi "./start_all.sh" — khong phu thuoc bit thuc thi (+x)
# cua file, tranh lap lai loi "Permission denied" neu file bi mat quyen +x
# sau lan checkout/reset tiep theo (VD do commit tu may Windows).
chmod +x start_all.sh 2>/dev/null || true
bash start_all.sh

echo "== Xong. Kiem tra bang: =="
echo "  ps aux | grep -E 'gunicorn|uvicorn' | grep -v grep"
