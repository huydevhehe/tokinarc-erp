# Thiết kế: Chuyển đổi giao diện Sáng/Tối

**Ngày**: 2026-07-23
**Yêu cầu từ**: sếp Huy — "giao diện có thêm được nền tối sáng, đang có tối rồi thiếu nền sáng thôi, áp dụng toàn trang, mọi ngóc ngách"

## Bối cảnh

Frontend (`frontend/src`) hiện chỉ có 1 theme tối, dựng bằng Tailwind CSS với các
màu ngữ nghĩa khai báo tĩnh trong `tailwind.config.js` (`ink`, `ink-2`, `ink-3`,
`line`, `txt`, `txt-2`, `flame`, `flame-hi`, `ok`, `warn`, `danger`) — mọi trang
(~80+ file) đều dùng đúng các tên class này (`bg-ink-2`, `text-txt-2`,
`border-line`...) thay vì mã màu trực tiếp. Chỉ có 2 chỗ code cứng mã màu ngoài
hệ thống token: `frontend/src/components/charts.tsx` (biểu đồ Recharts) và
`frontend/src/pages/crm/BotConversations.tsx`.

Chưa có bất kỳ cơ chế theme/dark-mode nào tồn tại (`data-theme`, `useTheme`,
`ThemeToggle`... — grep xác nhận 0 kết quả).

## Mục tiêu

Thêm theme **Sáng** bên cạnh theme **Tối** hiện có, áp dụng nhất quán toàn bộ
ứng dụng, đổi được bằng 1 nút bấm, không cần sửa lại từng trang riêng lẻ.

## Kiến trúc: biến CSS + `data-theme` (không dùng Tailwind `dark:` variant)

- Chuyển toàn bộ token màu trong `tailwind.config.js` từ mã hex tĩnh sang tham
  chiếu biến CSS theo mẫu Tailwind khuyến nghị:
  `ink: { 2: 'rgb(var(--ink-2) / <alpha-value>)' , ... }` — giữ nguyên được cú
  pháp opacity modifier đang dùng khắp nơi (`bg-flame/10`, `text-danger/90`...).
- `frontend/src/styles/index.css` định nghĩa 2 bộ giá trị RGB (mỗi kênh 1 số,
  cách nhau bằng khoảng trắng, đúng cú pháp Tailwind yêu cầu):
  - `:root, [data-theme="dark"]` → bộ giá trị tối (mặc định, giữ nguyên hiện tại).
  - `[data-theme="light"]` → bộ giá trị sáng mới.
- `data-theme` gắn lên thẻ `<html>`, đổi bằng JS.
- **Lý do chọn cách này thay vì Tailwind `dark:` variant**: `dark:` variant bắt
  buộc phải thêm class vào TỪNG chỗ dùng màu ở TỪNG file (Tailwind coi theme mặc
  định là sáng) — với quy mô "mọi ngóc ngách" của yêu cầu, cách đó tốn công gấp
  nhiều lần và rất dễ sót. Cách biến CSS đổi 1 chỗ, toàn bộ ~80+ trang đang dùng
  đúng tên class ngữ nghĩa sẽ tự động đổi theo, không cần sửa gì thêm.

## Bảng màu Sáng (đối chiếu bộ Tối hiện tại)

| Token | Tối (giữ nguyên) | Sáng (mới) |
|---|---|---|
| `ink` (nền chính) | `#0d1117` | `#ffffff` |
| `ink-2` (nền phụ) | `#161b22` | `#f6f8fa` |
| `ink-3` (nền panel) | `#21262d` | `#eaeef2` |
| `line` (viền) | `#30363d` | `#d0d7de` |
| `txt` (chữ chính) | `#e6edf3` | `#1f2328` |
| `txt-2` (chữ phụ) | `#8b949e` | `#656d76` |
| `flame` / `flame-hi` (cam thương hiệu) | `#e05c1b` / `#f97316` | giữ nguyên |
| `ok` | `#2ea043` | `#1a7f37` (đậm hơn — đủ tương phản trên nền trắng) |
| `warn` | `#d29922` | `#9a6700` |
| `danger` | `#f85149` | `#cf222e` |

Bộ màu tối/sáng lấy cảm hứng từ hệ màu GitHub Primer (đã kiểm chứng độ tương
phản/accessibility rộng rãi) — phù hợp tiêu chí "chuẩn doanh nghiệp".

## Component & lưu trạng thái

- Hook mới `frontend/src/lib/theme/store.ts` — `useTheme()`, state
  `'dark' | 'light'`, pattern giống `useAuth` (zustand) đang dùng. Đọc/ghi
  `localStorage` (key `tokinarc-theme`). Khi state đổi → set
  `document.documentElement.dataset.theme`.
- Component mới `frontend/src/components/ThemeToggle.tsx` — icon mặt
  trời/mặt trăng (lucide-react `Sun`/`Moon`, đã có sẵn trong dependencies).
  Đặt trong `Layout.tsx`, cạnh chuông thông báo trên header.
- **Mặc định** (chưa từng bấm, `localStorage` trống): **Tối** — giữ nguyên trải
  nghiệm hiện tại cho người dùng cũ, không đổi bất ngờ.
- Khởi tạo theme phải chạy TRƯỚC lần render đầu (đặt `data-theme` ngay trong
  `index.html` hoặc file khởi động app, tránh hiện tượng nháy sai theme 1 khung
  hình lúc tải trang — "FOUC").

## Các chỗ cần sửa thêm ngoài core token

- `charts.tsx`: mã màu cứng (`#30363d`, `#8b949e`, `PALETTE` cam/xanh...) → đổi
  sang đọc trực tiếp bằng `var(--line)`, `var(--txt-2)`... (SVG attribute nhận
  được giá trị CSS `var()` bình thường).
- `BotConversations.tsx`: rà lại các mã màu cứng, đổi sang class Tailwind
  tương ứng nếu có, hoặc `var(--x)` nếu là style inline.
- `index.css`: bỏ `color-scheme: dark` cứng ở `:root`, đổi thành đổi theo
  `data-theme` (để scrollbar/control gốc trình duyệt cũng đổi theo).

## Kiểm thử

- `tsc --noEmit` + `vite build` sạch.
- Kiểm tra bằng mắt (dev server) ở cả 2 theme cho vài trang đại diện: Dashboard,
  1 trang CRM (Leads/Customers), 1 trang Kho (Inbound/Outbound), Đơn mua hàng,
  trang Login (chưa đăng nhập) — đặc biệt các badge/tag màu ok/warn/danger có
  đủ tương phản trên nền trắng không.
- Playwright: 1 test bấm nút đổi theme → xác nhận `data-theme` đổi đúng +
  giá trị lưu lại đúng trong `localStorage`, tải lại trang vẫn giữ theme đã chọn.

## Ngoài phạm vi

- Không đổi theme theo tài khoản/DB (chỉ lưu trình duyệt, per-device).
- Không tự động theo `prefers-color-scheme` của hệ điều hành (mặc định luôn là
  Tối trừ khi người dùng tự bấm đổi).
