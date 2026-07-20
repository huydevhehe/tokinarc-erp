# Tokinarc ERP

Distribution-management ERP for a welding-gun/parts distributor in Vietnam — CRM, warehouse (WMS), executive dashboards (CEO), and admin, built on a Django backend + React frontend, with a role-gated internal AI assistant and a separate customer-facing chatbot.

## Repo layout

This repo root is **not** the app root. The actual codebase lives in [`Tokinarc_Autoss/Tokinarc_V6_dev2_merged/`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/):

- [`backend/`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/backend/) — Django REST API (CRM, WMS, sales, purchasing, catalog, analytics, accounts)
- [`frontend/`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/frontend/) — React/Vite SPA
- [`chatbot/`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/chatbot/) — standalone FastAPI customer chatbot (isolated, own data/index, no access to internal DB)
- [`docs/`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/docs/) — architecture + dev guides
- [`infra/`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/infra/) — Docker/deployment

Start here: [`Tokinarc_Autoss/Tokinarc_V6_dev2_merged/README.md`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/README.md) and [`docs/dev/DEV_SETUP.md`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/docs/dev/DEV_SETUP.md).

## Quick start

```bash
# Backend (Django)
cd Tokinarc_Autoss/Tokinarc_V6_dev2_merged/backend
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver

# Frontend (React/Vite)
cd Tokinarc_Autoss/Tokinarc_V6_dev2_merged/frontend
npm install
npm run dev
```

Requires Postgres with the `pgvector` extension for semantic part search (SQLite works for most local dev, but skips vector search / LISTEN-NOTIFY / materialized views). See [`docs/dev/DEV_SETUP.md`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/docs/dev/DEV_SETUP.md).

## Security boundary

The internal assistant (inside the Django backend, JWT + role-gated) and the public customer chatbot (separate FastAPI service, `X-API-Key`) are completely isolated from each other — the customer chatbot never touches internal DB, cost/margin data, or debt records.

---

# Tokinarc ERP (Tiếng Việt)

Hệ thống ERP quản lý phân phối cho nhà phân phối súng hàn/phụ tùng tại Việt Nam — CRM, quản lý kho (WMS), dashboard điều hành (CEO) và admin, xây trên Django backend + React frontend, kèm trợ lý AI nội bộ phân quyền theo vai trò và 1 chatbot khách hàng riêng biệt.

## Cấu trúc repo

Gốc repo này **không phải** gốc ứng dụng thật. Code thật nằm trong [`Tokinarc_Autoss/Tokinarc_V6_dev2_merged/`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/):

- [`backend/`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/backend/) — API Django (CRM, WMS, bán hàng, mua hàng, catalog, analytics, accounts)
- [`frontend/`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/frontend/) — SPA React/Vite
- [`chatbot/`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/chatbot/) — chatbot khách hàng FastAPI độc lập (tách biệt hoàn toàn, tự có data/index riêng, không truy cập DB nội bộ)
- [`docs/`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/docs/) — tài liệu kiến trúc + hướng dẫn dev
- [`infra/`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/infra/) — Docker/deploy

Bắt đầu từ: [`Tokinarc_Autoss/Tokinarc_V6_dev2_merged/README.md`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/README.md) và [`docs/dev/DEV_SETUP.md`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/docs/dev/DEV_SETUP.md).

## Chạy nhanh

```bash
# Backend (Django)
cd Tokinarc_Autoss/Tokinarc_V6_dev2_merged/backend
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver

# Frontend (React/Vite)
cd Tokinarc_Autoss/Tokinarc_V6_dev2_merged/frontend
npm install
npm run dev
```

Cần Postgres có extension `pgvector` để tìm kiếm ngữ nghĩa phụ tùng (SQLite chạy được cho hầu hết dev local, nhưng bỏ qua vector search / LISTEN-NOTIFY / materialized view). Xem [`docs/dev/DEV_SETUP.md`](Tokinarc_Autoss/Tokinarc_V6_dev2_merged/docs/dev/DEV_SETUP.md).

## Ranh giới bảo mật

Trợ lý nội bộ (nằm trong Django backend, JWT + phân quyền theo vai trò) và chatbot khách hàng công khai (service FastAPI riêng, `X-API-Key`) hoàn toàn tách biệt — chatbot khách hàng không bao giờ chạm vào DB nội bộ, dữ liệu giá vốn/lợi nhuận, hay công nợ.
