# Kịch bản Test Nghiệp vụ trên giao diện (FE)

*Dùng để tự test hoặc đưa cho Thi/Khang/tester click theo. Chỉ liệt kê 18 mục
KHÔNG bị chặn bởi bên thứ 3 (đã bỏ #8 Telegram, #17 vận chuyển, #18 cài server,
#19 chatbot Gemini, #20 tài liệu, #21 đào tạo, #22 data mẫu Việt Đà — 7 mục này
không phải lỗi phần mềm, không cần test).*

---

## PHẦN 1 — LUỒNG KHO (ưu tiên, sếp yêu cầu test trước)

Luồng chuẩn theo đúng sơ đồ nghiệp vụ (`docs/WORKFLOW.md`, mục 3): **Kho & vị
trí → Mua hàng (nếu thiếu hàng) → Nhập kho → Tồn kho → Xuất kho (tự sinh khi
Sale "Ký" đơn bán, kho chỉ soạn hàng chứ không tự tạo phiếu) → Kiểm kê**.
Test theo đúng thứ tự này, đăng nhập bằng tài khoản vai trò **Kho (warehouse)**
hoặc **Quản lý kho (wh_manager)** (trừ bước ghi chú riêng).

**Lưu ý quan trọng đúng luồng thật**: NV kho (warehouse) **không** có quyền
Mua hàng / sửa cấu trúc Kho — chỉ Quản lý kho (wh_manager) trở lên mới làm
được 2 việc này. Nếu test bằng tài khoản NV kho thường mà vẫn thấy 2 chức
năng đó thì đó là lỗi phân quyền.

### Bước 0 — Kho & vị trí (nền tảng, làm trước khi test các bước sau)
0a. Vào **Kho > Kho & vị trí**, kiểm tra cấu trúc phân cấp: **Kho → Khu vực
   (Zone) → Kệ → Tầng → Ô** — mỗi lô hàng tồn phải nằm đúng 1 Ô cụ thể.
0b. Thử xóa 1 kho/ô **đang còn hàng** — kiểm tra hệ thống **chặn xóa** (chống
   xóa nhầm gây mất dữ liệu tồn).
0c. Vào **Bản đồ kho**, kiểm tra xem được ô nào chứa mã hàng gì; thử chức
   năng quét mã (camera/scan) — quét ra đúng ô tương ứng.

### Bước 1 — Nhập kho (2 luồng: nội bộ và từ Nhà cung cấp)
1. Vào menu **Kho > Nhập kho**, bấm Tạo phiếu mới.
2. Thử luồng **"Nội bộ"**: chọn loại nội bộ, nhập tay số lượng — kiểm tra
   phiếu **không** bắt buộc nhập đơn giá/thuế.
3. Thử luồng **"Từ nhà cung cấp"**: chọn NCC, kiểm tra ô **Nhà cung cấp**
   hiện ra dạng **danh sách chọn sẵn** (không phải gõ tay tự do — vừa sửa).
   Nhập đơn giá, thuế (8% hoặc 10%), kiểm tra hệ thống tự tính đúng thành tiền.
4. Kiểm tra có ghi nhận **người giao / người nhận**.
5. Thử nhập **thiếu số lượng** so với đơn mua rồi lưu — kiểm tra phiếu ghi
   chú thiếu hàng; sau đó tạo phiếu nhập bổ sung cùng mã đơn, kiểm tra hệ
   thống tự cộng dồn đúng vào đơn cũ (không tạo đơn rời rạc).

### Bước 2 — Đơn mua hàng (PO)
6. Đăng nhập bằng tài khoản **Quản lý** (không phải NV kho) — vào menu
   **Mua hàng > Đơn mua (PO)** — kiểm tra menu này hiển thị đầy đủ (vừa sửa
   lỗi thiếu menu).
7. Tạo 1 đơn mua mới, kiểm tra có trường ghi chú (chính sách/điều kiện thanh
   toán).
8. Từ đơn PO đã tạo, tạo phiếu nhập kho liên kết trực tiếp — thử nhập nhiều
   lần (giao làm nhiều đợt) cho cùng 1 đơn PO, kiểm tra không bị tính trùng.
9. Đăng nhập lại bằng tài khoản **NV kho thường** — kiểm tra **không** thấy
   nút "Tạo đơn mua" (chỉ Quản lý/Quản lý kho/CEO mới tạo được).

### Bước 3 — Xuất kho (LƯU Ý: phiếu xuất **tự sinh** khi Sale "Ký" đơn bán,
### NV kho không tự tạo tay — phải test đúng từ đầu luồng bên CRM)
10. Đăng nhập **Sale**, tìm 1 Đơn bán đã ở trạng thái sẵn sàng, bấm **"Ký"**
    — kiểm tra có 🔔 báo cho NV kho ngay sau khi ký.
11. Đăng nhập **NV kho**, vào **Kho > Xuất kho** — kiểm tra phiếu xuất mới
    đã tự sinh sẵn (không cần tạo tay), đơn giá/thành tiền đã tự đồng bộ từ
    đơn bán (không phải gõ tay).
12. Kiểm tra có chọn được **nhãn mục đích xuất**: "Hàng bán" hoặc "Hàng xuất
    dự án".
13. Quét/chọn lô xuất (trạng thái draft→picking→picked→shipped) — kiểm tra
    hệ thống ưu tiên xuất lô **cũ nhất (FIFO)** hoặc **gần hết hạn nhất
    (FEFO)**; thử quét **nhầm lô** (không phải lô ưu tiên) — kiểm tra có
    **cảnh báo lệch** hiện ra chứ không cho qua âm thầm.
14. Bấm "Giao xong" — kiểm tra 🔔 báo lại cho Sale, và Đơn bán bên CRM tự
    chuyển sang trạng thái **completed**.

### Bước 4 — Tồn kho & tra cứu
15. Vào **Kho > Tồn kho**, bật chế độ **"Xem theo nhóm hàng"** — kiểm tra
    hiển thị gộp theo nhóm sản phẩm chứ không chỉ theo từng mã lẻ.
16. Bấm nút **"Xuất Excel"** ở chế độ xem theo nhóm — kiểm tra file tải về
    có đủ số liệu tồn theo từng nhóm.
17. Vào mục **Truy xuất**, tra theo **Serial** (số máy/thiết bị) hoặc theo
    **Lô** — kiểm tra ra đúng lịch sử nhập/xuất và (nếu có) hạn bảo hành.

### Bước 5 — Kiểm kê kho
18. Vào mục **Kiểm kê**, tạo phiên kiểm kê mới, quét/nhập số lượng thực tế
    cho vài mã hàng — kiểm tra hệ thống hiện đúng phần **chênh lệch** (hệ
    thống ghi vs đếm thực tế).
19. Đăng nhập **Quản lý kho**, bấm **"Áp dụng"** kết quả kiểm kê — kiểm tra
    tồn kho được điều chỉnh đúng theo số đã đếm, và có 🔔 báo quản lý nếu
    lệch lớn.

### Bước 6 — Danh mục sản phẩm (dữ liệu nền cho Kho)
20. Vào **Danh mục sản phẩm**, kiểm tra có đủ trường **Đơn giá, Thuế, Danh
    mục, Nhóm sản phẩm**.
21. Thử 2 ô lọc **"Nhóm sản phẩm"** rồi **"Danh mục"** — chọn 1 Nhóm trước,
    kiểm tra ô Danh mục chỉ hiện đúng các danh mục thuộc nhóm đó (mới sửa,
    trước đây 2 ô này không liên quan nhau).
22. Đăng nhập tài khoản **NV kho**, thử bấm **"Import Excel"** ở trang Danh
    mục sản phẩm — kiểm tra thấy nút và import được (trước đây bị ẩn, chỉ
    Quản lý mới thấy — đã sửa).

---

## PHẦN 2 — CÁC MỤC CÒN LẠI (ngoài Kho — CRM/Bán hàng/Dịch vụ)

| # | Việc cần test | Cách test nhanh | Kết quả mong đợi |
|---|---|---|---|
| 1 | Phân quyền theo chức năng | Đăng nhập **admin**, vào **Quản trị > Phân quyền** | Thấy bảng ma trận vai trò × quyền, tick/bỏ tick được, lưu lại có hiệu lực ngay |
| 2 | Phân trang | Vào trang **Hợp đồng** và **Đơn hàng**, tạo/kiểm tra có nhiều dữ liệu | Có nút chuyển trang (1,2,3...), không load hết 1 lần |
| 4 | Xóa dữ liệu | Vào **Khách hàng/Cơ hội/Báo giá/Hợp đồng/PO** bằng tài khoản không phải admin | Không thấy nút Xóa (chỉ admin mới xóa được — cố ý giới hạn để an toàn dữ liệu) |
| 5 | Lọc theo trạng thái | Vào **Lead/Cơ hội/Báo giá** | Có ô lọc dropdown theo trạng thái, lọc đúng kết quả |
| 6 | Xem trước khi duyệt | Vào **Duyệt** (Báo giá/PO/Hợp đồng/**Đơn bán — mới thêm**) | Có nút "Xem" mở chi tiết đầy đủ trước khi bấm Duyệt/Từ chối/Ký |
| 7 | Check trùng khách hàng | Tạo tay 1 khách hàng/Lead với **SĐT hoặc MST trùng** khách đã có | Hệ thống báo trùng, không cho tạo (hoặc cảnh báo rõ ràng) |
| 9 | Sale tạo Import Excel Lead/KH | Đăng nhập **Sale**, vào Khách hàng/Lead, bấm Import Excel | Thấy nút và import được (đã mở quyền cho Sale) |

---

## Ghi chú khi test

- Mỗi mục nếu **sai/lỗi**, chỉ cần chụp màn hình + ghi ngắn "mục #, bước mấy,
  thấy gì" — không cần biết vì sao, để báo lại xử lý.
- Server/database dùng để test là bản **dev nội bộ** (không phải server demo
  `tvhub.vn` vừa deploy) — nếu muốn test trên bản deploy thật thì cần đăng
  nhập đúng domain đó.
- Không cần test lại #3 (Import Excel) phần Sale/Kho tách riêng nữa — đã gộp
  vào bước 19 (Phần 1) và mục 9 (Phần 2) ở trên.
