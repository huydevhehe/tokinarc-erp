"""
Tokinarc V6 — apps/catalog/archive.py

Xoá sản phẩm & giải phóng mã (quyết định nghiệp vụ Huy + sếp, 2026-08-07).

Bối cảnh: "Xoá" sản phẩm trước giờ chỉ là ẩn đi (is_active=false), vì 11 bảng
nghiệp vụ khoá cứng (PROTECT) tới Part — xoá thật là mất luôn phiếu nhập/xuất,
tồn kho, đơn mua/bán cũ. Hệ quả gặp thật ngoài kho: quét tem của hàng đã ẩn →
hệ thống báo "chưa có" (danh sách lọc bỏ hàng ẩn) → nhân viên bấm Thêm mới →
lỗi "mã đã tồn tại" (dòng cũ vẫn nằm đó). Không gán được mà cũng không tạo được.

Cách xử lý ở đây:
  - Hàng CHƯA từng dùng ở đâu  → xoá hẳn, mã trống hoàn toàn.
  - Hàng ĐÃ có chứng từ/tồn kho → không xoá được, nhưng ĐỔI MÃ nó sang mã lưu
    trữ ("T62612" → "T62612#daxoa-20260807"), kéo theo toàn bộ lịch sử. Mã gốc
    được giải phóng để tạo sản phẩm mới sạch hoàn toàn.

Đổi mã khoá chính chạy được là nhờ khoá ngoại trong Postgres đều DEFERRABLE
INITIALLY DEFERRED — trong 1 giao dịch, đổi bảng cha rồi các bảng con, hệ thống
chỉ kiểm tra lúc commit. Sót bảng nào thì giao dịch tự huỷ TOÀN BỘ, không có
chuyện dời nửa vời rồi hỏng dữ liệu.

Danh sách bảng cần đổi được DÒ TỪ DATABASE lúc chạy, không viết cứng — sau này
thêm bảng mới trỏ tới Part thì tự động có, không phải nhớ sửa file này.
"""
from __future__ import annotations

from datetime import date

from django.db import connection, transaction

from apps.catalog.models import Part

ARCHIVE_MARK = '#daxoa-'


def _referencing_columns() -> list[tuple[str, str]]:
    """[(tên bảng, tên cột)] của mọi chỗ đang trỏ tới catalog_part.

    Gộp 2 nguồn, đều lấy động lúc chạy nên không bao giờ lạc hậu:
      1. Khoá ngoại khai báo trong model — duyệt XUÔI qua mọi model thay vì dùng
         Part._meta.related_objects, vì quan hệ đặt related_name='+' (VD
         crm_lead.interest_part) KHÔNG hiện ra ở danh sách quan hệ ngược.
      2. Cột tên `part_no`/`part_id` ở bảng khác — bắt nốt tham chiếu "lỏng"
         không khai báo khoá ngoại (bộ consumable, dòng báo giá, embedding).
         Bỏ sót thì không ai báo lỗi, nhưng chúng sẽ trỏ vào mã không còn nữa.
    """
    from django.apps import apps

    cols: set[tuple[str, str]] = set()
    for model in apps.get_models():
        if model is Part:
            continue
        for f in model._meta.get_fields():
            if getattr(f, 'many_to_one', False) and f.related_model is Part:
                cols.add((model._meta.db_table, f.column))

    with connection.cursor() as cur:
        tables = {t.name for t in connection.introspection.get_table_list(cur)}
        for table in tables:
            if table == Part._meta.db_table:
                continue
            try:
                names = {c.name for c in connection.introspection.get_table_description(cur, table)}
            except Exception:      # bảng hệ thống/view không mô tả được → bỏ qua
                continue
            cols |= {(table, c) for c in ('part_no', 'part_id') if c in names}
    return sorted(cols)


def archived_code_for(part_no: str) -> str:
    """Mã lưu trữ cho 1 mã sắp bị dời. Cùng 1 mã bị dời nhiều lần trong ngày thì
    thêm hậu tố -2, -3… (mã là khoá chính, trùng là hỏng)."""
    base = f'{part_no}{ARCHIVE_MARK}{date.today():%Y%m%d}'
    if not Part.objects.filter(pk=base).exists():
        return base
    n = 2
    while Part.objects.filter(pk=f'{base}-{n}').exists():
        n += 1
    return f'{base}-{n}'


@transaction.atomic
def archive_part(part: Part) -> str:
    """Dời `part` sang mã lưu trữ, trả về mã mới. Mã cũ được giải phóng.

    Sản phẩm bị dời luôn ở trạng thái đã ẩn (is_active=false) — nó là bản lưu
    trữ, không được phép hiện lại trong danh mục đang dùng.
    """
    old = part.pk
    new = archived_code_for(old)
    # Tắt kiểm tra khoá ngoại trong lúc đổi (đổi bảng cha trước, con sau thì
    # giữa chừng luôn có lúc "hở"), rồi BẬT KIỂM TRA LẠI ngay — sót bảng nào là
    # check_constraints() ném lỗi, giao dịch huỷ sạch, không dời nửa vời.
    with connection.constraint_checks_disabled():
        with connection.cursor() as cur:
            cur.execute(f'UPDATE {connection.ops.quote_name(Part._meta.db_table)} '
                        f'SET tokin_part_no = %s WHERE tokin_part_no = %s', [new, old])
            for table, col in _referencing_columns():
                cur.execute(f'UPDATE {connection.ops.quote_name(table)} '
                            f'SET {connection.ops.quote_name(col)} = %s '
                            f'WHERE {connection.ops.quote_name(col)} = %s', [new, old])
    connection.check_constraints()
    Part.objects.filter(pk=new).update(is_active=False)
    return new


# Bảng "khoá lỏng" chỉ lưu chuỗi mã, KHÔNG khai báo khoá ngoại → Django không
# biết mà chặn, xoá xong là chúng trỏ vào mã không còn tồn tại. Phải tự kiểm.
# Ngoại lệ: bảng vector tìm kiếm là dữ liệu tự sinh, xoá theo được, không chặn.
LOOSE_SKIP = {'catalog_part_embedding'}


def loose_references(part_no: str) -> dict[str, int]:
    """{tên bảng: số dòng} của các tham chiếu "lỏng" còn trỏ tới mã này."""
    fk_cols = set()
    from django.apps import apps
    for model in apps.get_models():
        for f in model._meta.get_fields():
            if getattr(f, 'many_to_one', False) and f.related_model is Part:
                fk_cols.add((model._meta.db_table, f.column))

    found: dict[str, int] = {}
    with connection.cursor() as cur:
        for table, col in _referencing_columns():
            if (table, col) in fk_cols or table in LOOSE_SKIP:
                continue
            cur.execute(f'SELECT COUNT(*) FROM {connection.ops.quote_name(table)} '
                        f'WHERE {connection.ops.quote_name(col)} = %s', [part_no])
            n = cur.fetchone()[0]
            if n:
                found[table] = n
    return found


def try_hard_delete(part: Part) -> bool:
    """Xoá hẳn nếu không còn gì dùng tới. True = đã xoá sạch, False = còn nơi
    dùng nên không xoá được (người gọi tự quyết ẩn đi hay dời mã).

    Chặn bởi 2 lớp: khoá ngoại PROTECT (chứng từ nhập/xuất, tồn kho, đơn
    mua/bán, kiểm kê, lô) do Django lo, và các tham chiếu "lỏng" ở trên — báo
    giá, bộ vật tư, bảng tương thích súng hàn — phải tự kiểm vì không có ràng
    buộc nào chặn giúp.
    """
    from django.db.models import ProtectedError
    if loose_references(part.pk):
        return False
    try:
        with transaction.atomic():
            part.delete()
        return True
    except ProtectedError:
        return False
