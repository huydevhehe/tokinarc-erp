#!/bin/bash
BASE=/home/tvr/tokinarc-erp-main/Tokinarc_Autoss/Tokinarc_V6_dev2_merged

cd $BASE/backend
nohup $BASE/backend/venv/bin/gunicorn tokinarc.wsgi:application \
  --bind 192.168.1.200:5905 --workers 3 \
  --env DJANGO_SETTINGS_MODULE=tokinarc.settings.dev \
  >> $BASE/backend/backend.log 2>&1 &
echo "Backend PID: $!"

# Frontend: khong chay process nua -- Nginx serve thang file tinh trong
# frontend/dist (build luc deploy.sh chay "npm run build"). Xem cau hinh
# tai /etc/nginx/sites-available/tvhub.vn (location /).

cd $BASE/chatbot
nohup $BASE/backend/venv/bin/uvicorn main:app \
  --host 0.0.0.0 --port 8008 \
  >> $BASE/chatbot/chatbot.log 2>&1 &
echo "Chatbot PID: $!"

echo "Done!"
