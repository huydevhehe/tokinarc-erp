"""
Tokinarc — apps/catalog/tests/test_imports.py

Test quyền cho PartImportView (mục #3 biên bản, 2026-07-22): trước đây chỉ
quản lý/CEO import được danh mục phụ tùng — không đúng ý biên bản "cho Sale
và Kho". Đã mở thêm cho NV kho/QL kho (Sale không liên quan tới danh mục Kho
nên KHÔNG mở cho Sale ở đây).
"""
from __future__ import annotations

import io

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.catalog.models import Part


def _csv(text: str):
    f = io.BytesIO(text.encode('utf-8'))
    f.name = 'parts.csv'
    return f


@pytest.fixture
def warehouse_user(db):
    return User.objects.create(username='imp_wh', role=Role.WAREHOUSE)


@pytest.fixture
def wh_manager(db):
    return User.objects.create(username='imp_whm', role=Role.WAREHOUSE_MANAGER)


@pytest.fixture
def manager(db):
    return User.objects.create(username='imp_mgr', role=Role.MANAGER)


@pytest.fixture
def sale(db):
    return User.objects.create(username='imp_sale', role=Role.SALES)


@pytest.mark.django_db
def test_part_import_allowed_for_warehouse_roles(warehouse_user, wh_manager, manager):
    csv = 'tokin_part_no,category,display_name_vi\nIMP-001,Tip,Bép test import\n'
    for user in (warehouse_user, wh_manager, manager):
        c = APIClient(); c.force_authenticate(user)
        r = c.post('/api/v1/catalog/parts/import/', {'file': _csv(csv), 'dry_run': '1'}, format='multipart')
        assert r.status_code == 200, f"role={user.role} bị chặn import (mong đợi 200)"


@pytest.mark.django_db
def test_part_import_blocked_for_sale(sale):
    """Sale không liên quan tới danh mục Kho — vẫn bị chặn (chỉ NV kho/QL kho/manager/CEO)."""
    c = APIClient(); c.force_authenticate(sale)
    r = c.post('/api/v1/catalog/parts/import/',
              {'file': _csv('tokin_part_no,category\nIMP-002,Tip\n')}, format='multipart')
    assert r.status_code == 403


@pytest.mark.django_db
def test_part_import_saves_cost_vnd_separately_from_price_vnd(warehouse_user):
    """Nạp từ báo cáo Xuất Nhập Tồn: cột giá vốn (cost_vnd) phải lưu riêng,
    không được đè/lẫn vào price_vnd (giá bán)."""
    csv = ('tokin_part_no,category,display_name_vi,price_vnd,cost_vnd\n'
           'IMP-003,Tip,Bép test giá vốn,50000,32000\n')
    c = APIClient(); c.force_authenticate(warehouse_user)
    r = c.post('/api/v1/catalog/parts/import/', {'file': _csv(csv)}, format='multipart')
    assert r.status_code == 200, r.data
    part = Part.objects.get(tokin_part_no='IMP-003')
    assert part.price_vnd == 50000
    assert part.cost_vnd == 32000


def _xnt_report_xlsx() -> io.BytesIO:
    """Dựng 1 file .xlsx mô phỏng đúng layout báo cáo 'Xuất Nhập Tồn' kế toán
    (metadata 7 dòng đầu, header 2 dòng, dữ liệu, rồi dòng 'Tổng cộng') —
    KHÔNG dùng file thật ngoài repo để test luôn chạy được ở CI."""
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    for _ in range(7):
        ws.append([None])
    ws.append(['STT', 'Tên vật tư, hàng hóa', 'ĐVT', 'Tồn đầu kỳ', None,
               'Nhập trong kỳ', None, 'Xuất trong kỳ', None, 'Tồn cuối kỳ', None, None])
    ws.append([None, None, None, 'Lượng', 'Thành tiền', 'Lượng', 'Thành tiền',
               'Lượng', 'Thành tiền', 'Lượng', 'Đơn giá', 'Thành tiền'])
    ws.append(['A', 'B', 'C', 1, 2, 3, 4, 5, 6, 7, 8, 9])
    ws.append([1, 'Béc hàn 0.8 x 40L - 023007', 'Cái', 100, 1000000, None, None,
               None, None, 100, 12345, 1234500])
    ws.append([2, 'Bánh răng truyền động, mã hàng T116869', 'Cái', 6, 8180646, None,
               None, None, None, 6, 1363441, 8180646])
    ws.append([3, 'Long đền GTS12', 'Cái', 5, 100000, None, None, None, None, 5, 20000, 100000])
    ws.append(['Tổng cộng', None, '-', None, 9280646, None, 0, None, 0, None, None, 9515000])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    buf.name = 'XUAT NHAP TON-thang7.xlsx'
    return buf


@pytest.mark.django_db
def test_part_import_auto_detects_xnt_accounting_report(wh_manager):
    """Nhân viên kế toán upload THẲNG báo cáo Xuất Nhập Tồn gốc (không convert
    tay) — hệ thống phải tự tách tên/mã, lấy giá vốn, mặc định category."""
    c = APIClient(); c.force_authenticate(wh_manager)
    r = c.post('/api/v1/catalog/parts/import/', {'file': _xnt_report_xlsx()}, format='multipart')
    assert r.status_code == 200, r.data

    part = Part.objects.get(tokin_part_no='023007')
    assert part.display_name_vi == 'Béc hàn 0.8 x 40L'
    assert part.cost_vnd == 12345
    assert part.price_vnd is None   # báo cáo không có giá bán, không được tự điền
    assert part.category == 'Chưa phân loại'

    # Dòng "mã hàng ..." không có dấu " - " vẫn tách được nhờ regex dự phòng.
    part2 = Part.objects.get(tokin_part_no='T116869')
    assert part2.display_name_vi == 'Bánh răng truyền động'

    # Dòng không tách được mã ("Long đền GTS12") phải báo lỗi rõ ràng, KHÔNG
    # được tạo Part với mã rỗng/sai.
    assert not Part.objects.filter(display_name_vi__icontains='Long đền').exists()
    assert any('Long đền GTS12' in e.get('message', '') or 'Thiếu mã' in e.get('message', '')
               for e in r.data.get('errors', []))
