# Biên bản cuộc họp — Phân công vận hành & Rà soát nghiệp vụ PMQL

**Chủ đề:** Phân công vận hành & Rà soát nghiệp vụ phần mềm quản lý (CRM – Bán hàng – Kho – Dịch vụ)

## A. Thông tin cuộc họp

- **Thời gian:** không ghi ngày cụ thể; họp cả buổi (nghỉ trưa, tiếp tục 16:00 cùng ngày).
- **Địa điểm:** văn phòng công ty, demo trực tiếp qua máy chiếu.
- **Thành phần tham dự:**
  - **Anh Nhơn** — chủ trì, ra quyết định phân quyền & phân công công việc.
  - **Anh Văn** — tư vấn quy trình nghiệp vụ ERP.
  - **Huy** — trình bày, demo phần mềm trực tiếp.
  - **Minh** — nêu yêu cầu, góp ý bổ sung chức năng còn thiếu.
  - **Thi, Khang** — nhân sự nội bộ, sẽ trực tiếp sử dụng phần mềm sau khi hoàn thiện.

## B. Nội dung chính

### 1. Tổng quan

Họp gồm 2 phần: (1) phân công vận hành PMQL (CRM–Bán hàng–Kho–Dịch vụ, tích hợp MISA như ERP thu gọn) cho Khang/Thi + demo toàn luồng Admin/phân quyền → CRM → Kho → Dịch vụ; (2) review chuyên sâu module Kho với đại diện nghiệp vụ thực tế, đối chiếu quy trình phần mềm với vận hành kho thật (nhập/xuất/mua hàng/vận chuyển).

### 2. Ý kiến / phản hồi nổi bật

**Phân quyền (Admin)**
- Đang phân quyền theo **nhóm** (sale, kho...) nhưng thực tế mỗi nhóm có nhiều vai trò khác nhau (VD: trưởng kho vs NV kho xem dữ liệu khác nhau) → cần chuyển sang phân quyền **theo chức năng (function-based)**.
- CEO không tự phân quyền; tạm giao quyền cao nhất cho đội vận hành để test, sau chỉnh lại.

**CRM / Bán hàng**
- Thiếu: phân trang (pagination), Import Excel hàng loạt, chức năng **Xóa** (hiện chỉ có Thêm/Sửa), bộ lọc theo trạng thái.
- Cần cơ chế check trùng khách hàng giữa các sale (đã có — cần xác nhận lại còn hoạt động đúng không).
- Mức duyệt giảm giá theo cấp: **Sale ≤5% → Trưởng phòng sale ≤10% → Giám đốc kinh doanh ≤15% → CEO ≤20%**; vượt mức phải chuyển cấp cao hơn.
- Người duyệt đơn hiện chỉ bấm ký mà **chưa xem được nội dung/chi tiết** trước khi duyệt → cần bổ sung.

**Dịch vụ / Ticket bảo hành**
- **Sale** (không phải khách hàng) là người tạo ticket khi khách phản ánh lỗi.
- Ticket cần gán đúng kỹ sư phụ trách + gửi thông báo; do là web app không rung noti → đề xuất **Telegram bot** (miễn phí) thay Zalo/FB/WhatsApp (tính phí).
- Cần phản hồi 2 chiều kỹ thuật ↔ kinh doanh; các lần sửa của **cùng một sự cố** phải gom về **1 mã ticket** (kèm lịch sử sửa lần 1, 2...), tránh tạo phiếu mới liên tục gây loạn mã.
- Kinh doanh cần xem được tình trạng bảo hành sản phẩm khi nhận ticket.

**Module Kho (review chuyên sâu)**
- Nhập kho tách 2 luồng: **(1) nội bộ** — hàng cũ/đã dùng, nhập tay, không giá; **(2) từ NCC** — đầy đủ đơn giá, thuế (8%/10%), có người giao + người nhận ký xác nhận.
- Bổ sung trường: **Đơn giá, Thuế, Danh mục sản phẩm, Nhóm sản phẩm** (theo hãng/loại) + Import Excel nạp danh mục hàng loạt.
- Mã vạch/QR: QR gắn theo **lô**, barcode gắn theo **thùng/hộp lẻ**; mã tối thiểu gồm mã sản phẩm + số lượng + số lô.
- Nhập thiếu số lượng theo đơn → ghi chú, tự khớp vào cùng mã đơn khi nhập bổ sung lần sau.
- Xuất kho **phải theo đơn có giá từ bán hàng** chuyển qua, không xuất tự do; kho chỉ xuất theo danh sách đã duyệt + quét mã xác nhận đúng SL. Lệch tồn (hệ thống báo còn, thực tế không có) → thủ kho báo quản lý để kiểm kê/điều chỉnh.
- Thống nhất **FIFO** cho giai đoạn hiện tại, **chưa** quản lý theo hạn sử dụng (FEFO).
- Cần xem tồn kho **theo nhóm hàng** (không chỉ theo mã lẻ) để lên đơn đặt hàng NCC.
- Cần nhãn trạng thái xuất kho: **"Hàng bán"** và **"Hàng xuất dự án"** (dự án lấy giá đầu vào để kế toán tính dự toán, không nhất thiết = giá bán).
- Bản đồ/vị trí kho chia theo **zone – kệ – mã hàng**; quản lý đa chi nhánh (HCM, Đà Nẵng, Bình Dương...) + chuyển kho liên chi nhánh — **tạm chưa triển khai**, để giai đoạn sau.
- Đơn mua hàng (PO): chỉ **Quản lý** (VD chị Xuân) được tạo; NV kho không có quyền. Duyệt rút gọn còn **1 cấp**; cần trường ghi chú (chính sách, điều kiện giao hàng theo đợt, điều kiện thanh toán).
- Địa chỉ NCC trong nước tự lấy theo **MST** qua API tra cứu; NCC nước ngoài nhập tay.
- Vận chuyển: 3 hình thức — **Nhất Tín Logistics**, **Grab/Ahamove** (đơn gấp), nhân sự công ty tự giao. Đề xuất tính năng "Xuất đơn – Giao hàng" tự đẩy dữ liệu (địa chỉ, người nhận) sang đơn vị vận chuyển qua API.
- Menu Kho cần đủ: **Nhập kho, Xuất kho, Tồn kho, Tra cứu, Lịch sử kho**.
- Chốt luồng chuẩn: **Tạo kho (mã kho, địa chỉ) → Nhập kho → Kiểm kê** (đối chiếu tồn thực tế) — **Kiểm kê hiện chưa được xây dựng** (theo biên bản).
- PO nên dùng chung luồng với nhập kho: 1 mã đơn có thể nhập bổ sung **nhiều lần** (NCC giao nhiều đợt); PO cần trường ghi chú.
- Cần xuất Excel riêng để tra cứu/truy xuất tồn theo nhóm sản phẩm.
- Cần lấy dữ liệu sản phẩm mẫu của khách hàng **Việt Đà** để import thử, kiểm tra độ đầy đủ trường dữ liệu trước khi triển khai chính thức.

### 3. Quyết định / kết luận chính

- **Huy** hoàn thiện các chức năng còn thiếu theo yêu cầu của Minh; **Thi, Khang** là người dùng vận hành chính thức sau khi hoàn thiện; **Minh** là đầu mối tổng hợp yêu cầu, làm việc với Huy/anh Văn khi cần.
- Chuyển phân quyền từ **theo nhóm** → **theo chức năng (function-based)**, áp dụng toàn hệ thống.
- Mức duyệt giảm giá: **Sale 5% → Trưởng phòng sale 10% → GĐ kinh doanh 15% → CEO 20%**.
- Bổ sung thông báo qua **Telegram bot** cho nghiệp vụ cần cảnh báo tức thời (VD ticket kỹ thuật).
- Áp dụng **FIFO** cho xuất/nhập kho giai đoạn hiện tại.
- Tách 2 luồng nhập kho: **nội bộ** (nhập tay, không giá) và **từ NCC** (đầy đủ giá/thuế, ký giao–nhận).
- Chỉ **Quản lý (chị Xuân)** có quyền tạo đơn mua hàng; NV kho không có quyền này.
- Huy ghi nhận toàn bộ yêu cầu của Minh, cập nhật trong **1–2 ngày**.
- Buổi sáng kết thúc; **16:00 cùng ngày** tiếp tục hướng dẫn phần mềm cho Thi/Khang. **Minh** phụ trách cài phần mềm lên server + đăng ký tài khoản Gemini để tích hợp chatbot web (tự thu thập SĐT khách, đổ về CRM).

## C. Kế hoạch hoạt động

### Mục tiêu sau cuộc họp

1. Hoàn thiện tính năng còn thiếu ở CRM (phân trang, import Excel, xóa, filter, xem lại trước khi duyệt) trong 1–2 ngày để vận hành thử.
2. Hoàn thiện module Kho (giá/thuế, nhóm sản phẩm, phân quyền theo chức năng, xử lý lệch tồn, nhãn xuất kho, PO...) đúng quy trình thực tế đã thống nhất.
3. Đào tạo Thi/Khang sử dụng thành thạo để triển khai + hướng dẫn lại các bộ phận khác.
4. Tích hợp thông báo Telegram, chuẩn bị chatbot AI (Gemini) trên website, làm việc với đơn vị vận chuyển để tích hợp API tự động giao hàng.

### Danh sách hành động chi tiết

| # | Hạng mục | Người phụ trách | Thời hạn / Ghi chú |
|---|---|---|---|
| 1 | Chuyển phân quyền theo chức năng (function-based) thay vì theo group, áp dụng toàn hệ thống (Kho, Sale...) | Huy | 1–2 ngày |
| 2 | Bổ sung phân trang (pagination) cho các bảng dữ liệu (đơn hàng, hóa đơn...) | Huy | 1–2 ngày |
| 3 | Khôi phục + bổ sung Import Excel (nhập hàng loạt) cho Sale và Kho | Huy | 1–2 ngày |
| 4 | Bổ sung chức năng Xóa (Delete) cho các module hiện chỉ có Thêm/Sửa | Huy | 1–2 ngày |
| 5 | Bổ sung bộ lọc (filter) theo trạng thái cho CRM và Kho | Huy | 1–2 ngày |
| 6 | Cho phép người ký duyệt xem lại nội dung đơn trước khi duyệt | Huy | 1–2 ngày |
| 7 | Kiểm tra lại cơ chế check trùng khách hàng giữa các sale | Huy | Xác nhận lại tính năng hiện có |
| 8 | Tích hợp thông báo Telegram bot cho ticket kỹ thuật thay vì chỉ noti web | Huy; Minh theo dõi | Sau khi hoàn thiện CRM |
| 9 | Gom các lần xử lý cùng 1 sự cố về 1 mã ticket duy nhất; bổ sung lịch sử sửa (lần 1, 2...) | Huy | 1–2 ngày |
| 10 | Bổ sung Đơn giá, Thuế (8%/10%), Danh mục sản phẩm, Nhóm sản phẩm cho module Kho | Huy | Ưu tiên cao |
| 11 | Hoàn thiện phiếu nhập kho theo 2 luồng (nội bộ / NCC) đủ trường người giao–người nhận–giá–thuế | Huy | 1–2 ngày |
| 12 | Rà soát + bổ sung giá trên phiếu xuất kho, đồng bộ với báo giá từ bán hàng | Huy | 1–2 ngày |
| 13 | Áp dụng FIFO cho xuất/nhập kho giai đoạn hiện tại | Huy | 1–2 ngày |
| 14 | Bổ sung xem tồn kho theo nhóm hàng (không chỉ theo mã lẻ) | Huy | 1–2 ngày |
| 15 | Phân nhãn trạng thái xuất kho: "Hàng bán" và "Hàng xuất dự án" | Huy | 1–2 ngày |
| 16 | Hoàn thiện PO: giới hạn quyền tạo đơn (chỉ Quản lý/Xuân), rút gọn duyệt còn 1 cấp, thêm trường ghi chú | Huy | 1–2 ngày |
| 17 | Làm việc với đơn vị vận chuyển (Nhất Tín, Ahamove) xin mở API tích hợp giao hàng | Anh Nhơn, Minh | Cần liên hệ đối tác vận chuyển |
| 18 | Cài đặt phần mềm lên server chính thức | Minh | Sau khi hoàn thiện các mục trên |
| 19 | Đăng ký + tích hợp Gemini cho chatbot website (tự đổ dữ liệu KH về CRM) | Minh; Huy hỗ trợ | Giai đoạn sau |
| 20 | Viết tài liệu hướng dẫn sử dụng + tài liệu kỹ thuật | Huy | Sau khi hệ thống ổn định |
| 21 | Đào tạo Thi, Khang sử dụng phần mềm | Huy, Minh hướng dẫn; Thi, Khang tiếp nhận | Sau khi hoàn thiện các mục trên |
| 22 | Xuất dữ liệu sản phẩm mẫu KH Việt Đà, import thử để kiểm tra đầy đủ dữ liệu | Thi, Minh, Huy | Cần thực hiện sớm để test |
| 23 | Bổ sung chức năng Kiểm kê kho; hoàn thiện luồng Tạo kho → Nhập kho → Kiểm kê | Huy | Cần chốt lại luồng thao tác |
| 24 | Xác nhận/cập nhật: PO dùng chung luồng với nhập kho (1 mã đơn nhập bổ sung nhiều lần); thêm trường ghi chú | Huy | Cần làm rõ & cập nhật |
| 25 | Bổ sung xuất Excel riêng để tra cứu/truy xuất tồn theo nhóm sản phẩm | Huy | 1–2 ngày |

---

## D. Đối chiếu với mã nguồn hiện tại (rà soát 2026-07-20)

> Chỉ đọc code, **chưa sửa gì**. Ký hiệu: ✅ Đã có đủ · 🟡 Có một phần / khác yêu cầu · ⛔ Chưa có · ⚠️ Biên bản có vẻ **lỗi thời** so với code.

### D.0 Tách nhanh — cái nào gác lại, cái nào làm trước

**✅ ĐÃ CÓ RỒI — gác lại, chỉ cần xác nhận lại chứ không cần code lại**

| # (mục họp) | Việc | Ghi chú |
|---|---|---|
| 13 | FIFO cho xuất/nhập kho | Đã có, kèm **cả FEFO** luôn (biên bản ghi thiếu FEFO — lỗi thời) |
| 23 | Kiểm kê kho (Cycle Count) | Đã xây đầy đủ: model + API + khóa nghiệp vụ + UI + test (biên bản ghi "chưa xây" — lỗi thời) |
| 24 | PO dùng chung luồng với nhập kho, nhập bổ sung nhiều lần | Đã có, hoạt động đúng ý |
| 5 (một phần) | Nhập thiếu SL → tự khớp cùng mã đơn khi nhập bổ sung | Đã có (`status=partial`) |
| 3 (phần Sale) | Import Excel cho CRM (KH/Lead/Hợp đồng/Đơn cũ) | Đã có đủ |
| 6 (đơn) | Người duyệt xem chi tiết trước khi duyệt | Đã có (Quote/PO/Contract đều có modal chi tiết) |
| — | Đa chi nhánh + chuyển kho liên chi nhánh | Đã hỗ trợ đầy đủ (biên bản ghi "để giai đoạn sau" — thực ra đã có) |
| — | Zone – kệ (rack) – mã hàng | Đã có cấu trúc này rồi |
| 16 (phần ghi chú) | PO có trường ghi chú chính sách/thanh toán | Đã có (`notes` + `payment_terms_note`) |
| — | Gán kỹ sư ticket + thông báo trong app | Đã có |

**🔧 CẦN LÀM TRƯỚC — thật sự còn thiếu/khác yêu cầu, ưu tiên xử lý**

| # (mục họp) | Việc | Đang thiếu gì |
|---|---|---|
| 1 | Phân quyền theo chức năng | Mới là role cố định, chưa "function-based" thật |
| 2 | Phân trang | Thiếu ở Contracts, Orders |
| 3 (phần Kho) | Import Excel cho **Kho** (danh mục sản phẩm) | Catalog đang 100% read-only, chưa có import |
| 4 | Chức năng Xóa | Chỉ Customer có soft-delete; Lead/Opp/Quote/Contract chưa an toàn (API xóa cứng tồn tại ngầm, chưa chặn) |
| 5 | Filter theo trạng thái | Thiếu ở Lead, Opportunity, Quote |
| 6 | 6. Kiểm tra trùng khách hàng khi tạo tay | Chưa có, chỉ có lúc import |
| 7 | Mức duyệt giảm giá theo cấp | Đang 2 cấp theo %, chưa đúng 4 cấp theo yêu cầu |
| 8 | Telegram bot cho ticket | Chưa có gì |
| 9 | Gộp nhiều lần sửa vào 1 mã ticket | Chưa có, đổi schema |
| 10 | Đơn giá/Thuế/Danh mục/Nhóm SP cho Kho | Thiếu field thuế; danh mục/nhóm còn phẳng |
| 11 | Phiếu nhập 2 luồng (nội bộ/NCC) | Chưa phân biệt, chưa có thuế + người giao-nhận |
| 12 | Giá trên phiếu xuất đồng bộ báo giá | Outbound chưa có field giá, chưa bắt buộc gắn đơn bán |
| 14 | Tồn kho theo nhóm hàng | Chưa có |
| 15 | Nhãn xuất kho "Hàng bán"/"Hàng dự án" | Chưa có |
| 16 (phần quyền + cấp duyệt) | PO: giới hạn quyền tạo (bỏ wh_manager?), rút về 1 cấp duyệt | Đang cho cả wh_manager tạo, đang 2 cấp duyệt |
| 25 | Xuất Excel tồn theo nhóm SP | Chưa có |
| — | Ticket: ai được tạo (giới hạn Sale) | Đang cho mọi role kể cả customer |
| — | Ticket: phản hồi 2 chiều kỹ thuật↔KD | Chưa có, chỉ 1 field ghi đè |
| — | Ticket: tra bảo hành ngay khi tạo | serial_no chưa link sang WMS |
| — | NCC tự lấy địa chỉ theo MST (API) | Chưa có gì |

**⏸ CHƯA KIỂM TRA / KHÔNG THUỘC PHẠM VI CODE — anh xem có bỏ sót không**

| # (mục họp) | Việc | Vì sao chưa nằm ở 2 bảng trên |
|---|---|---|
| 17 | Xin API vận chuyển (Nhất Tín, Ahamove) | Việc với đối tác ngoài (Anh Nhơn, Minh phụ trách), không phải code — chưa thấy tích hợp gì trong repo, coi như chưa bắt đầu |
| 18 | Cài phần mềm lên server chính thức | Vận hành/hạ tầng, không phải sửa code |
| 19 | Đăng ký + tích hợp Gemini cho chatbot website (đổ lead về CRM) | Thuộc mảng chatbot khách (`chatbot/`) — **chưa rà soát riêng phần này**, cần kiểm tra thêm nếu anh muốn ưu tiên |
| 20 | Viết tài liệu hướng dẫn + kỹ thuật | Đã có sẵn khá nhiều (docx cũ + CLAUDE.md vừa tạo), nhưng chưa review xem có khớp bản mới nhất không |
| 21 | Đào tạo Thi/Khang | Không phải code |
| 22 | Import dữ liệu mẫu khách Việt Đà để test | Phụ thuộc mục "Import Excel cho Kho" (còn thiếu) làm xong trước đã |

Nếu đúng thứ tự trên thì việc nào anh muốn làm trước, báo tôi lên plan chi tiết cho việc đó rồi mới động code.

### D.1 Phân quyền & CRM

| # (mục ở trên) | Trạng thái | Ghi chú |
|---|---|---|
| Phân quyền theo nhóm → function-based | 🟡 | Đang là 1 field `role` cố định/user (`accounts/roles.py`), mỗi role gắn 1 tập quyền cứng — không phải Django Group, nhưng cũng chưa phải "function-based" thật (không gán quyền theo từng hành động tùy biến). Đã tách sẵn `wh_manager` (trưởng kho) khác `warehouse` (NV kho). |
| #2 Phân trang | 🟡 | Customers/Leads/Quotes/Opportunities đã có. **Contracts và Orders chưa** (load hết 1 lần). |
| #3 Import Excel CRM | ✅ | Đã có đủ cho Customer/Lead/Contract/Order, chỉ manager+ mới import được. |
| #4 Xóa (Delete) | 🟡 | Chỉ Customer có soft-delete thật. Lead/Opportunity/Quote/Contract có endpoint DELETE kỹ thuật (mặc định của ModelViewSet) nhưng **không soft-delete, không có nút ở FE** — rủi ro: ai có quyền write vẫn gọi API xóa cứng được dù UI không cho. |
| #5 Filter theo trạng thái | 🟡 | Backend đã hỗ trợ cho Customer/Contract/Order. **Lead, Opportunity, Quote chưa có** filter status; FE các trang CRM chỉ có ô tìm kiếm text, chưa có dropdown lọc trạng thái ở đâu cả. |
| #6 Check trùng khách hàng | ⛔ | Chỉ tồn tại trong luồng **Import Excel**. Khi sale tạo tay 1 KH/Lead mới qua form thường, **không có check trùng** theo SĐT/MST/tên. |
| #7 Duyệt giảm giá theo cấp | 🟡 | Hiện là 2 cấp theo **%giảm giá** (sale tự ≤5%, manager duyệt ≤10%, CEO duyệt phần còn lại **không giới hạn trần**) — không phải 4 cấp theo yêu cầu họp (thêm "Trưởng phòng sale ≤10%", "GĐ kinh doanh ≤15%", CEO chỉ ≤20%). Chưa có 2 role đó trong hệ thống. |
| #6 (đơn) Xem trước khi duyệt | ✅ | `Approvals.tsx` đã có nút "Xem" mở modal chi tiết đầy đủ dòng hàng/lãi gộp trước khi Duyệt/Từ chối — cho cả Quote, PO, Contract. |

### D.2 Dịch vụ / Ticket

| # | Trạng thái | Ghi chú |
|---|---|---|
| Ai tạo ticket | 🟡 khác yêu cầu | Backend hiện cho **bất kỳ role hợp lệ nào (kể cả `customer`)** tạo ticket — không giới hạn chỉ Sale. FE cũng không chặn theo role. |
| Gán kỹ sư + thông báo | ✅ | Có field `assignee`, tự gửi Notification trong app khi gán/khi resolve. Notification chỉ hiển thị trong app, chưa đẩy ra ngoài (Telegram/SMS/email). |
| Telegram bot | ⛔ | Chưa có tích hợp gì (grep toàn repo không thấy). |
| Phản hồi 2 chiều kỹ thuật ↔ kinh doanh | ⛔ | Không có model Comment/Thread. Chỉ có 1 field `resolution` bị **ghi đè** mỗi lần resolve + Notification 1 chiều. |
| Gộp nhiều lần sửa về 1 mã ticket | ⛔ | Ticket hiện là model đơn dòng, status tuyến tính. Không có `TicketHistory`/`TicketAttempt`. Khách báo lại sau khi ticket đã closed → hệ thống tạo **ticket mới hoàn toàn**, không tự gộp. **Đây là thay đổi schema khá lớn.** |
| Tra bảo hành khi nhận ticket | ⛔ | `serial_no` trong Ticket chỉ là ô text tự do, không link sang `wms.SerialNumber` (nơi có `warranty_until`). Sale phải tự mở tab Warranty riêng để tra, không tích hợp ngay trong luồng tạo ticket. |

### D.3 Kho (WMS) — **có 2 điểm biên bản có vẻ lỗi thời**

| # | Trạng thái | Ghi chú |
|---|---|---|
| 2 luồng nhập (nội bộ / NCC) | ⛔ | Không phân biệt. `InboundLine.unit_cost` optional dùng chung mọi luồng. Không có field thuế (8/10%), không có field người giao/người nhận ký (chỉ là chữ tĩnh trên phiếu in). |
| Đơn giá/Thuế/Danh mục/Nhóm SP trên catalog | 🟡 | Có `cost_vnd`, `price_vnd`, `category`, `ecosystem` (phẳng, không phải cây danh mục). **Không có field thuế** trên Part. |
| Import Excel danh mục Part | ⛔ | Catalog hiện 100% read-only qua API, ghi chỉ qua script `seed_from_json` nội bộ — chưa có Import Excel như CRM. |
| QR/Barcode chứa mã+SL+lô | ⛔ | Hệ thống hiện chỉ **đọc** barcode có sẵn để gán vào Part, **không sinh** QR/barcode mới. |
| Nhập thiếu → tự khớp cùng mã đơn | ✅ | Đã có (`status=partial`, cộng dồn theo `InboundLine`, có `shortage_note`, có test riêng). |
| Xuất kho bắt buộc theo đơn có giá | ⛔ | `OutboundOrder` không bắt buộc gắn `SalesOrder`; `OutboundLine` không có field giá — giá không đồng bộ lên phiếu xuất. |
| FIFO/FEFO | ⚠️ **lỗi thời** | Code đã có đủ FIFO + FEFO + NEAREST, FEFO đã hoạt động thật (kể cả cảnh báo quét nhầm lô), có test riêng. Biên bản ghi "hiện tại chỉ FIFO, chưa FEFO" — **không đúng với code**. |
| Tồn kho theo nhóm hàng | ⛔ | Trang Tồn kho chỉ liệt kê theo mã lẻ, chưa group theo category. |
| Nhãn "Hàng bán" / "Hàng xuất dự án" | ⛔ | Chưa có field/enum này trên Outbound. |
| Zone – kệ – mã hàng / đa chi nhánh | ✅ | `rack` đã là field trên Bin (Warehouse→Zone→Bin, rack là thuộc tính Bin). Đa chi nhánh + chuyển kho liên chi nhánh **đã hỗ trợ đầy đủ** (kể cả cross-warehouse transfer). |
| **Kiểm kê (Cycle Count)** | ⚠️ **lỗi thời** | Đã xây dựng **đầy đủ**: model, API, khóa nghiệp vụ khi đang kiểm kê, tab FE hoàn chỉnh, test riêng. Biên bản ghi "Kiểm kê chưa được xây dựng" — **không đúng với code hiện tại**. |
| Xuất Excel tồn theo nhóm SP | ⛔ | Export Excel hiện có chỉ là phiếu nhập/xuất theo đơn, chưa có báo cáo tồn theo nhóm. |

### D.4 Mua hàng (Purchasing / PO)

| # | Trạng thái | Ghi chú |
|---|---|---|
| Chỉ "Quản lý" được tạo PO | 🟡 khác yêu cầu | Code hiện cho cả **wh_manager (Quản lý kho)** tạo PO cùng Manager/CEO/Admin — không phải "chỉ Quản lý" đơn lẻ như biên bản. |
| Duyệt PO 1 cấp | 🟡 khác yêu cầu | Hiện đang **2 cấp** giống Quote (cấp 1 manager/CEO, vượt ngưỡng 100tr → CEO duyệt cấp 2). Biên bản muốn rút về 1 cấp — chưa làm. |
| Trường ghi chú chính sách/thanh toán | ✅ | Đã có `notes` + `payment_terms_note`. Chưa có cấu trúc riêng cho "giao hàng theo nhiều đợt" (mới là text tự do). |
| PO dùng chung luồng với Inbound, nhập nhiều lần | ✅ | Đã có: PO liên kết trực tiếp Inbound, cho tạo nhiều phiếu nhập nối tiếp cho đến khi đủ số lượng. |
| NCC tự lấy địa chỉ theo MST qua API | ⛔ | Chưa có, toàn bộ field NCC nhập tay, không phân biệt trong/ngoài nước. |
| ASN gắn với PO | 🟡 khác yêu cầu | Có model ASN nhưng **chủ đích không** gắn với PO (để tránh trùng/lệch tồn) — PO dùng field riêng (`expected_date/carrier/tracking_no`) cho "hàng đang về". |

### D.5 Câu hỏi cần anh xác nhận trước khi code (chưa làm gì cả)

1. **Biên bản có thể đã cũ ở 2 điểm quan trọng**: FEFO và Kiểm kê (Cycle Count) — code hiện đã có đầy đủ cả 2, trái với ghi trong biên bản. Cần xác nhận: biên bản họp diễn ra **trước** khi 2 module này được build, hay đây là ý khác (ví dụ "đã build nhưng chưa tập huấn/vận hành thật")?
2. **Mức duyệt giảm giá 4 cấp**: có cần tạo thêm 2 role mới ("Trưởng phòng sale", "Giám đốc kinh doanh") trong `roles.py`, và đặt trần 20% cho CEO (hiện CEO duyệt không giới hạn) không?
3. **Xóa dữ liệu**: có nên khóa hẳn hard-delete ở tầng permission cho Lead/Opportunity/Quote/Contract (hiện về lý thuyết gọi API là xóa cứng được dù UI không có nút), rồi mới thêm nút xóa dạng soft-delete có kiểm soát quyền?
4. **Tiêu chí "trùng khách hàng"**: theo SĐT, MST, hay cả tên gần giống (fuzzy)? Hiện ngoài lúc import Excel thì chưa check trùng khi tạo tay.
5. **Gộp ticket theo "cùng 1 sự cố"**: đây là thay đổi mô hình dữ liệu khá lớn. Cần chọn 1 trong 2: (a) thêm bảng con kiểu lịch sử nhiều lần xử lý trong 1 ticket, hay (b) đơn giản hơn — ticket cũ đã closed mà khách báo lại thì tự "mở lại" (status quay về open) thay vì tạo mới? Và tiêu chí match "cùng sự cố" là gì (theo serial? theo serial+khách hàng?) — vì `serial_no` hiện là text tự do, chưa link cứng sang WMS.
6. **Ai được tạo ticket**: có chặn hẳn Service/khách hàng tự tạo, bắt buộc qua Sale không, hay Service vẫn được tạo khi khách gọi trực tiếp cho kỹ thuật?
7. **Telegram**: cần bot token/chat id nào, gửi cho ai (riêng kỹ sư được gán hay cả nhóm) — hiện chưa có gì cả, làm từ đầu.
8. **2 luồng nhập kho nội bộ/NCC**: xác nhận cần thêm field `source_type` (nội bộ/NCC), thuế, người giao/người nhận (định danh user, không phải chữ tĩnh) — đúng không?
9. **Quyền tạo PO**: "chỉ Quản lý" trong biên bản có tính luôn Quản lý kho (wh_manager) không, hay chỉ Manager/CEO cấp công ty (nếu vậy cần bỏ wh_manager khỏi quyền tạo PO hiện tại)?
10. **Rút PO về 1 cấp duyệt**: đơn giá trị lớn sau này do ai duyệt — vẫn Manager, hay chuyển hẳn cho CEO, hay bỏ hẳn khái niệm ngưỡng?
11. **Tra cứu MST**: có bắt buộc tích hợp API tra cứu doanh nghiệp theo MST ngay, hay để giai đoạn sau?

---

## E. Bảng theo dõi tiến độ 25 mục (cập nhật 2026-07-21)

Chú thích cột **Tình trạng**:

| Ký hiệu | Ý nghĩa |
|---|---|
| ✅ Đã làm xong | Vừa code xong trong đợt này (Batch 1), đã test — anh bấm thử xác nhận lại |
| ✅ Đã có sẵn | Code từ trước đã đáp ứng — biên bản có chỗ ghi lỗi thời, chỉ cần anh xác nhận lại, không cần code |
| 🔧 Làm một phần | Đã xử lý được 1 phần, phần còn lại vẫn thiếu |
| ❓ Cần hỏi lại | Chưa code — đang chờ anh trả lời câu hỏi mở (xem mục D.5) để chốt hướng làm |
| ⏸ Chờ bên thứ 3 / chờ sau | Không phải việc code, hoặc phụ thuộc bên ngoài (đối tác, dữ liệu khách hàng, thứ tự công việc) |

| # | Hạng mục công việc | Người phụ trách | Thời hạn / Ghi chú | Tình trạng | Đã làm gì |
|---|---|---|---|---|---|
| 1 | Chuyển phân quyền theo chức năng (function-based) thay vì theo group, áp dụng toàn hệ thống (Kho, Sale...) | Huy | 1–2 ngày | ❓ Cần hỏi lại | Chưa làm — đổi kiến trúc phân quyền toàn hệ thống, cần bàn hướng trước khi code |
| 2 | Bổ sung phân trang (pagination) cho các bảng dữ liệu (đơn hàng, hóa đơn...) | Huy | 1–2 ngày | ✅ Đã làm xong | Thêm phân trang FE cho trang Hợp đồng + Đơn bán (BE vốn đã hỗ trợ sẵn) |
| 3 | Khôi phục + bổ sung Import Excel (nhập hàng loạt) cho Sale và Kho | Huy | 1–2 ngày | ✅ Đã làm xong | Sale: đã có sẵn từ trước. Kho: vừa viết mới Import Excel cho danh mục Phụ tùng (BE+FE) |
| 4 | Bổ sung chức năng Xóa (Delete) cho các module hiện chỉ có Thêm/Sửa | Huy | 1–2 ngày | ❓ Cần hỏi lại | Chưa làm — cần chốt: khóa hard-delete trước rồi mới thêm nút xóa mềm, hay làm song song |
| 5 | Bổ sung bộ lọc (filter) theo trạng thái cho CRM và Kho | Huy | 1–2 ngày | ✅ Đã làm xong | Thêm filter trạng thái/giai đoạn cho Lead, Cơ hội, Báo giá (BE+FE) |
| 6 | Cho phép người ký duyệt xem lại nội dung đơn trước khi duyệt | Huy | 1–2 ngày | ✅ Đã có sẵn | Đã có modal "Xem" cho Báo giá/PO/Hợp đồng từ trước — không cần sửa |
| 7 | Kiểm tra lại cơ chế check trùng khách hàng giữa các sale | Huy | Xác nhận lại tính năng hiện có | ❓ Cần hỏi lại | Chỉ có lúc Import Excel; tạo tay chưa check trùng — cần chốt tiêu chí (SĐT/MST/tên) |
| 8 | Tích hợp thông báo Telegram bot cho ticket kỹ thuật thay vì chỉ noti web | Huy; Minh theo dõi | Sau khi hoàn thiện CRM | ⏸ Chờ bên thứ 3 | Chưa làm gì — cần bot token/chat id Telegram trước khi code được |
| 9 | Gom các lần xử lý cùng 1 sự cố về 1 mã ticket duy nhất; bổ sung lịch sử sửa (lần 1, 2...) | Huy | 1–2 ngày | ❓ Cần hỏi lại | Chưa làm — đổi schema Ticket, cần chọn phương án (bảng lịch sử con hay tự mở lại ticket cũ) |
| 10 | Bổ sung Đơn giá, Thuế (8%/10%), Danh mục sản phẩm, Nhóm sản phẩm cho module Kho | Huy | Ưu tiên cao | 🔧 Làm một phần | Đã thêm field Thuế cho Phụ tùng. Danh mục/Nhóm sản phẩm vẫn đang phẳng (chưa phân cấp cây) — chưa làm |
| 11 | Hoàn thiện phiếu nhập kho theo 2 luồng (nội bộ / NCC) đủ trường người giao–người nhận–giá–thuế | Huy | 1–2 ngày | ❓ Cần hỏi lại | Chưa làm — cần xác nhận field cụ thể (source_type, thuế, người giao/nhận là user hay chữ tĩnh) |
| 12 | Rà soát + bổ sung giá trên phiếu xuất kho, đồng bộ với báo giá từ bán hàng | Huy | 1–2 ngày | ✅ Đã làm xong | Thêm Đơn giá/Thành tiền trên dòng phiếu xuất, tự đồng bộ từ Đơn bán lúc tạo phiếu |
| 13 | Áp dụng FIFO cho xuất/nhập kho giai đoạn hiện tại | Huy | 1–2 ngày | ✅ Đã có sẵn | Code đã có cả FIFO **và** FEFO — biên bản ghi thiếu FEFO là lỗi thời, cần anh xác nhận lại |
| 14 | Bổ sung xem tồn kho theo nhóm hàng (không chỉ theo mã lẻ) | Huy | 1–2 ngày | ✅ Đã làm xong | Thêm chế độ "Xem theo nhóm hàng" ở trang Tồn kho |
| 15 | Phân nhãn trạng thái xuất kho: "Hàng bán" và "Hàng xuất dự án" | Huy | 1–2 ngày | ✅ Đã làm xong | Thêm field mục đích xuất kho, chọn được khi tạo phiếu, hiển thị tag ở danh sách |
| 16 | Hoàn thiện PO: giới hạn quyền tạo đơn (chỉ Quản lý/Xuân), rút gọn duyệt còn 1 cấp, thêm trường ghi chú | Huy | 1–2 ngày | ❓ Cần hỏi lại | Ghi chú đã có sẵn. Quyền tạo + số cấp duyệt CHƯA sửa — cần chốt "Quản lý" có tính luôn Quản lý kho không |
| 17 | Làm việc với đơn vị vận chuyển (Nhất Tín, Ahamove) xin mở API tích hợp giao hàng | Anh Nhơn, Minh | Cần liên hệ đối tác vận chuyển | ⏸ Chờ bên thứ 3 | Không phải code — chờ Anh Nhơn/Minh làm việc với đối tác vận chuyển |
| 18 | Cài đặt phần mềm lên server chính thức | Minh | Sau khi hoàn thiện các mục trên | ⏸ Chờ sau | Không phải code — vận hành hạ tầng, làm sau khi các mục trên xong |
| 19 | Đăng ký + tích hợp Gemini cho chatbot website (tự đổ dữ liệu KH về CRM) | Minh; Huy hỗ trợ | Giai đoạn sau | ⏸ Chờ sau | Giai đoạn sau, thuộc phần `chatbot/` riêng — chưa rà soát |
| 20 | Viết tài liệu hướng dẫn sử dụng + tài liệu kỹ thuật | Huy | Sau khi hệ thống ổn định | ⏸ Chờ sau | Chưa làm — đợi hệ thống ổn định mới viết |
| 21 | Đào tạo Thi, Khang sử dụng phần mềm | Huy, Minh hướng dẫn; Thi, Khang tiếp nhận | Sau khi hoàn thiện các mục trên | ⏸ Chờ sau | Không phải code — đào tạo sau khi hoàn thiện các mục trên |
| 22 | Xuất dữ liệu sản phẩm mẫu KH Việt Đà, import thử để kiểm tra đầy đủ dữ liệu | Thi, Minh, Huy | Cần thực hiện sớm để test | ⏸ Chờ bên thứ 3 | Công cụ Import Excel Kho (mục 3) đã xong — chỉ còn thiếu dữ liệu mẫu thật từ Việt Đà để test |
| 23 | Bổ sung chức năng Kiểm kê kho; hoàn thiện luồng Tạo kho → Nhập kho → Kiểm kê | Huy | Cần chốt lại luồng thao tác | ✅ Đã có sẵn | Đã xây đầy đủ model/API/UI/test — biên bản ghi "chưa xây" là lỗi thời, cần anh xác nhận lại |
| 24 | Xác nhận/cập nhật: PO dùng chung luồng với nhập kho (1 mã đơn nhập bổ sung nhiều lần); thêm trường ghi chú | Huy | Cần làm rõ & cập nhật | ✅ Đã có sẵn | Đã hoạt động đúng ý — chỉ cần anh xác nhận lại, không cần code |
| 25 | Bổ sung xuất Excel riêng để tra cứu/truy xuất tồn theo nhóm sản phẩm | Huy | 1–2 ngày | ✅ Đã làm xong | Thêm nút "Xuất Excel" ở chế độ xem theo nhóm hàng (trang Tồn kho) |

**Tổng kết nhanh**: 9 mục ✅ đã làm xong/đã có sẵn từ Batch 1 · 1 mục 🔧 làm một phần · 7 mục ❓ cần anh trả lời câu hỏi mở (D.5) mới code tiếp · 8 mục ⏸ không phải code hoặc chờ bên thứ 3/dữ liệu/thứ tự công việc.

---
*Chuyển đổi từ `Bien_ban_cuoc_hop_PMQL.docx` sang Markdown, kèm đối chiếu mã nguồn để tham chiếu nhanh khi rà soát/triển khai. Cập nhật 2026-07-21: đã hoàn thành Batch 1 (9/25 mục), còn lại chờ anh xác nhận câu hỏi mở hoặc bên thứ 3.*
