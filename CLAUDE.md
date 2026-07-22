# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

This repo root is **not** the app root. The actual codebase lives in
`Tokinarc_Autoss/Tokinarc_V6_dev2_merged/`. Everything below (`backend/`,
`frontend/`, `chatbot/`, `docs/`, `infra/`) is relative to that directory
unless stated otherwise.

Root-level items outside that folder:
- `Tokinarc_KienTruc_HuongDan_LuongNghiepVu.docx` — combined architecture +
  user guide + business-flow doc (Vietnamese), most authoritative single
  overview of the whole system.
- `tokinarc_ceo.html`, `tokinarc_crm.html`, `tokinarc_wms.html` — standalone,
  single-file dark-theme UI **mockups/prototypes**, not part of the real
  React app; don't confuse them with `frontend/`.

Inside `Tokinarc_Autoss/Tokinarc_V6_dev2_merged/`:
- `README.md`, `EXTENDING.md`, `DOC_STATUS.md`, `KIEN_TRUC_DU_AN.docx`,
  `HUONG_DAN_TOAN_BO.docx` — project docs (some numbers in `README.md`, e.g.
  test counts/roadmap, are stale vs. current code; trust code + `EXTENDING.md`
  over the README's roadmap table).
- `docs/dev/` — `DEV_SETUP.md`, `API_REFERENCE.md`, `FRONTEND_GUIDE.md`,
  `EVENTS_HANDLERS.md`, `CHATBOT_TOOL_GUIDE.md`, `TROUBLESHOOTING.md`.
- `docs/architecture/` — original B0–B6 design docs + LLD data-flow doc.

## What this system is

Tokinarc ERP (AUTOSS) — distribution management for a welding-gun/parts
distributor in Vietnam. Three software blocks share one database and one AI
service (Gemini):

1. **ERP web app** (Django backend + React frontend) — CRM, warehouse (WMS),
   executive dashboards (CEO), admin — used by staff.
2. **Internal assistant bot** — lives *inside* the Django backend
   (`apps/analytics/assistant.py`), role-gated, can query and (with
   preview-then-"ok" confirmation) write data.
3. **Customer chatbot** — separate FastAPI service (`chatbot/`), public-facing,
   product/stock/technical Q&A for customers only.

### Security boundary (important — don't blur this)

The two bots are **completely isolated**:
- Customer chatbot → only a narrow public API (stock availability, lead
  intake) via `X-API-Key`. It has its own self-contained data (JSON + FAISS
  vector index in `chatbot/data/` and `chatbot/indexes/`) and **never** calls
  Django or touches internal DB, cost/margin data, or debt.
- Staff → internal bot, gated by employee role via JWT; `sales` role can't see
  financials; `cost`/margin data is manager/CEO/admin only; write actions
  (create lead/quote/etc.) always show a preview and require explicit "ok"
  before committing.

## Commands

### Backend (Django, `backend/`)

```bash
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver

# Run all tests (dev/local uses SQLite; CI uses Postgres+pgvector)
pytest apps/ -q

# Run tests for a single app / single test
pytest apps/crm/tests/test_crm_ext.py -q
pytest apps/crm/tests/test_crm_ext.py::TestClassName::test_name -q

# Lint
ruff check .

# Migration drift check — MUST be clean before any model change is merged
python manage.py makemigrations --check --dry-run
```

Mandatory pre-merge checklist (from `EXTENDING.md` §8) — all four must pass:
```bash
cd backend
python manage.py makemigrations --check --dry-run
python manage.py migrate
pytest apps/ --create-db -q
ruff check .
```

### Frontend (React/Vite, `frontend/`)

```bash
npm install
npm run dev         # vite dev server, :5173
npm run build        # tsc --noEmit && vite build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src --ext .ts,.tsx
npm run test:e2e     # playwright
```

### Chatbot (FastAPI, `chatbot/`)

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8080

python _smoke_test_orch.py   # smoke tests
python run_eval.py           # full eval suite
```

### Docker / production (`infra/`)

```bash
bash infra/scripts/gen_keys.sh
cp infra/.env.example .env   # fill secrets
docker compose -f infra/docker-compose.yml --env-file .env up -d --build
docker compose exec django python manage.py migrate
docker compose exec django python manage.py seed_users_roles --admin-password=<strong>
docker compose exec django python manage.py seed_from_json data/tokinarc_data_v19.json
```

## Architecture

### Deployment shape

```
Employee (JWT) ──┐                     ┌── Customer (X-API-Key)
                  ▼                     ▼
             nginx (internal)      nginx (public)
                  │                     │
    Frontend (React :5173) ─/api(JWT)─► Django backend :8000
      CRM · WMS · CEO · admin           (apps: accounts crm sales wms
      + internal assistant widget        catalog analytics storage
                                          common learning purchasing)
                                                │
                                    PostgreSQL+pgvector · Redis · MinIO
                                          (worker: eventbus listener)

                                    Chatbot khách (FastAPI :4000/:8080)
                                    self-contained FAISS/BM25 KB + Gemini
                                    — isolated, no Django access
```

Both the internal assistant and the customer chatbot call **Gemini**
(function-calling) independently; they don't share a brain or a KB.

### Backend Django apps (`backend/apps/`)

One-way dependency graph — business apps point up, never down:

```
common  ←  catalog · accounts
   ↑            ↑
crm · wms · sales · purchasing · analytics · storage · learning
```

- `common` — `BaseModel` (UUID7 PK, `created_at/by`, `updated_at/by`),
  `SoftDeleteMixin`, `AuditLog`, `Notification`. Imports nothing else.
- `accounts` — users + JWT; **`roles.py` is the single source of truth** for
  role list, hierarchy, and capabilities (which roles can use which read/write
  tools, see finances, etc). Every other app's `permissions.py` must import
  from here, never redefine roles.
- `catalog` — `Part`, `Torch`, `Compatibility`, `TorchPartMapping`,
  `PartEmbedding` (vector). PKs are **strings**, not UUID (`Part.tokin_part_no`,
  `Torch.model_code`) — don't assume `BaseModel`-style UUID FKs here.
  **`pricing.py` is the single source** for price computation
  (`compute_line_total()`, `get_effective_price()`) — never hand-roll
  `price * qty * (1 - discount)`.
- `crm` — Customer/Contact/Lead/Opportunity/Quote(+Line, 2-level approval)/
  Contract/Visit/Activity/Ticket; Customer 360 + timeline endpoints.
- `sales` — `SalesOrder`(+Line), `Payment`; sign → deliver → auto-creates WMS
  outbound.
- `wms` — `Warehouse` > `Zone` > `Bin`; `InventoryItem`(FIFO), `Lot`(FEFO),
  `SerialNumber`; Inbound/Outbound, `PickListItem`, `StockMovement` (append-only
  ledger of every stock change), cycle count, barcode scan endpoints.
- `purchasing` — purchase orders + suppliers (feeds WMS inbound/ASN).
- `analytics` — CEO/manager reporting services (KPI, revenue, debt aging,
  inventory value, forecast) + `assistant.py` (the internal bot: hybrid
  Gemini planner + DB-reading tools + role-gated responder).
- `storage` — `FileObject` + MinIO upload.
- `learning` — QueryLog + Critic, worker-only.

Single-source files to know before changing behavior:
- `apps/accounts/roles.py` — roles/hierarchy/capabilities. After editing,
  regenerate downstream copies: `python manage.py dump_roles --format=py --out ../chatbot/roles_generated.py`
  and `--format=ts --out ../frontend/src/lib/auth/roles.ts`.
- `apps/catalog/pricing.py` — all price math.
- `tokinarc/eventbus/channels.py` — async event channel names (Postgres
  LISTEN/NOTIFY); add a `Channel` constant, never inline a channel string.

### Core business flow (spans crm → sales → wms → analytics)

```
Lead --convert--> Customer --> Opportunity --> Quote
  Quote: total < threshold → Manager approval (level 1) is enough
         total ≥ threshold → also needs CEO approval (level 2)
  Quote approved --> "Create Order" --> SalesOrder --> Sign --> Deliver
  Deliver --> auto-creates WMS Outbound --> scan/pick (FIFO/FEFO) --> stock decremented
  --> Invoice (MISA export) --> Receivables (debt)

Purchasing: PO (+ supplier) --> approval --> ASN (expected arrival)
  --> Inbound (create/from-PO --> scan/receive --> confirm)
  --> stock incremented (+ Lot/FEFO) + WAC cost update + payable to supplier

Cycle count: new session --> scan-count (code+bin+count) --> variance
  (system vs counted) --> warehouse manager "Apply" --> stock corrected

All stock changes write one StockMovement row (the ledger). CRM + WMS + Sales
all roll up into Analytics/CEO dashboards (read-only there).
```

Role scope (enforced server-side, this is the real gate — not the frontend):
`sales` (own CRM data only, no cost/margin) · `warehouse` (in/out/count, no
adjustments) · `wh_manager` (+ stock adjustments, approve cycle counts) ·
`service` (tickets) · `manager` (all CRM+WMS, level-1 quote approval,
reports) · `ceo` (+ level-2 approval, full financials) · `admin` (system
admin only — deliberately does *not* see business data).

### Known traps (see `EXTENDING.md` §9 for full detail)

- `catalog.PartEmbedding` uses `SeparateDatabaseAndState` to branch on DB
  vendor (real `vector`+HNSW on Postgres, plain text column on SQLite). Never
  let Django auto-generate a migration touching this model — it will emit
  Postgres-only DDL and break on SQLite. Write the migration by hand with an
  explicit vendor guard.
- Vector/semantic search only works on Postgres; SQLite test runs don't
  exercise that code path at all.
- Never edit a committed `0001_initial` migration — add a new migration
  instead; several apps depend on migration names.
- Every model change must come with a migration in the same PR; unnamed
  indexes cause migration drift (Django auto-generates a hash name that
  changes between runs) — always name indexes explicitly.
- Loose string keys vs. hard FKs are both in use on purpose (e.g.
  `wms.OutboundOrder.sales_order_code` as a string) when the target app isn't
  guaranteed to exist yet / to avoid seed-order coupling — don't "clean these
  up" into FKs without a deliberate migration (see `EXTENDING.md` §7).
