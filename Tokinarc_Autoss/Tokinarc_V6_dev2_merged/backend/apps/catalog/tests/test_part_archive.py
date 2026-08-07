"""
Xoá sản phẩm & giải phóng mã (2026-08-07) — xem apps/catalog/archive.py.

Ngõ cụt gặp thật ngoài kho: sản phẩm bị "xoá" chỉ là ẩn đi, nên quét tem của nó
ra "chưa có" (danh sách lọc bỏ hàng ẩn) → bấm Thêm mới → 400 "mã đã tồn tại".
Không gán được mà cũng không tạo được.
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.catalog.models import Part, PartBarcode
from apps.wms.models import Bin, InboundLine, InboundOrder, InventoryItem, Warehouse, Zone


def _user(role=Role.WAREHOUSE):
    return User.objects.create(username=f'u_arch_{role}', role=role)


@pytest.fixture
def kho(db):
    return _user()


@pytest.fixture
def part(db):
    return Part.objects.create(tokin_part_no='ARC-1', category='Tip', display_name_vi='Hàng test')


def _cho_co_lich_su(part) -> InboundLine:
    """Gắn 1 dòng phiếu nhập → part không xoá cứng được nữa (PROTECT)."""
    wh = Warehouse.objects.create(code=f'W{part.pk[:6]}', name='Kho test')
    order = InboundOrder.objects.create(warehouse=wh)
    return InboundLine.objects.create(inbound=order, part=part, qty_expected=7)


# ─── Nút Xoá ──────────────────────────────────────────────────────────────
@pytest.mark.django_db
def test_delete_part_chua_dung_thi_xoa_han(kho, part):
    c = APIClient(); c.force_authenticate(kho)
    r = c.delete(f'/api/v1/catalog/parts/{part.pk}/')
    assert r.status_code == 200
    assert r.data['deleted'] is True
    assert not Part.objects.filter(pk='ARC-1').exists(), 'phải mất hẳn, mã trống hoàn toàn'


@pytest.mark.django_db
def test_delete_part_co_lich_su_thi_chi_an(kho, part):
    _cho_co_lich_su(part)
    c = APIClient(); c.force_authenticate(kho)
    r = c.delete(f'/api/v1/catalog/parts/{part.pk}/')
    assert r.status_code == 200
    assert r.data['deleted'] is False and r.data['hidden'] is True
    part.refresh_from_db()
    assert part.is_active is False, 'không xoá cứng được thì phải ẩn'


# ─── Tạo mới trùng mã ─────────────────────────────────────────────────────
@pytest.mark.django_db
def test_tao_moi_trung_ma_hang_dang_dung_thi_van_chan(kho, part):
    """Trùng mã với sản phẩm ĐANG DÙNG là trùng thật — không được dời gì cả."""
    c = APIClient(); c.force_authenticate(kho)
    r = c.post('/api/v1/catalog/parts/',
               {'tokin_part_no': 'ARC-1', 'category': 'Tip', 'display_name_vi': 'Hàng khác'},
               format='json')
    assert r.status_code == 400
    assert Part.objects.filter(pk='ARC-1').count() == 1


@pytest.mark.django_db
def test_tao_moi_trung_ma_hang_da_xoa_thi_hoi_lai(kho, part):
    """Chưa xác nhận → 409 kèm thông tin món cũ để FE hỏi người dùng, chưa dời gì."""
    _cho_co_lich_su(part)
    part.is_active = False; part.save()
    c = APIClient(); c.force_authenticate(kho)
    r = c.post('/api/v1/catalog/parts/',
               {'tokin_part_no': 'ARC-1', 'category': 'Tip', 'display_name_vi': 'Hàng mới'},
               format='json')
    assert r.status_code == 409
    assert r.data['code'] == 'PART_HIDDEN_EXISTS'
    assert r.data['display_name_vi'] == 'Hàng test'
    assert r.data['archived_code'].startswith('ARC-1#daxoa-')
    assert Part.objects.get(pk='ARC-1').display_name_vi == 'Hàng test', 'chưa xác nhận thì chưa được đụng'


@pytest.mark.django_db
def test_xac_nhan_thi_doi_ma_cu_va_tao_moi_sach(kho, part):
    """Đồng ý → món cũ sang mã lưu trữ kèm nguyên lịch sử, mã gốc thuộc về món mới."""
    line = _cho_co_lich_su(part)
    PartBarcode.objects.create(part=part, code='QR-CU', kind='qr')
    part.is_active = False; part.save()

    c = APIClient(); c.force_authenticate(kho)
    r = c.post('/api/v1/catalog/parts/',
               {'tokin_part_no': 'ARC-1', 'category': 'Tip', 'display_name_vi': 'Hàng mới tinh',
                'archive_existing': True}, format='json')
    assert r.status_code == 201

    moi = Part.objects.get(pk='ARC-1')
    assert moi.display_name_vi == 'Hàng mới tinh' and moi.is_active is True
    assert moi.barcodes.count() == 0, 'món mới phải sạch, không dính mã QR cũ'
    assert not InboundLine.objects.filter(part_id='ARC-1').exists(), 'món mới phải sạch lịch sử'

    cu = Part.objects.filter(pk__startswith='ARC-1#daxoa-').first()
    assert cu is not None and cu.display_name_vi == 'Hàng test'
    assert cu.is_active is False, 'bản lưu trữ luôn ở trạng thái ẩn'
    line.refresh_from_db()
    assert line.part_id == cu.pk, 'phiếu nhập cũ phải đi theo bản lưu trữ'
    assert PartBarcode.objects.get(code='QR-CU').part_id == cu.pk


@pytest.mark.django_db
def test_ton_kho_cu_di_theo_ban_luu_tru(kho, part):
    """Tồn kho cũ không được dính sang món mới — món mới bắt đầu từ 0."""
    wh = Warehouse.objects.create(code='WKHO', name='Kho')
    zone = Zone.objects.create(warehouse=wh, code='Z1')
    bin_ = Bin.objects.create(zone=zone, rack='R01', bin_code='B03', full_code='WKHO-Z1-R01-B03')
    InventoryItem.objects.create(bin=bin_, part=part, qty_on_hand=20)
    part.is_active = False; part.save()

    c = APIClient(); c.force_authenticate(kho)
    r = c.post('/api/v1/catalog/parts/',
               {'tokin_part_no': 'ARC-1', 'category': 'Tip', 'display_name_vi': 'Hàng mới',
                'archive_existing': True}, format='json')
    assert r.status_code == 201
    assert not InventoryItem.objects.filter(part_id='ARC-1').exists()
    cu = Part.objects.get(pk__startswith='ARC-1#daxoa-')
    assert InventoryItem.objects.get(part_id=cu.pk).qty_on_hand == 20


@pytest.mark.django_db
def test_doi_ma_2_lan_trong_ngay_khong_trung(kho):
    """Cùng 1 mã bị dời nhiều lần trong ngày → mã lưu trữ phải khác nhau."""
    from apps.catalog.archive import archive_part
    for i in range(3):
        p = Part.objects.create(tokin_part_no='ARC-2', category='Tip',
                                display_name_vi=f'Lần {i}', is_active=False)
        archive_part(p)
    assert Part.objects.filter(pk__startswith='ARC-2#daxoa-').count() == 3


@pytest.mark.django_db
def test_chi_nhan_vien_kho_tro_len_moi_duoc_xoa(part):
    for role in (Role.SALES, Role.SERVICE, Role.CUSTOMER):
        u = User.objects.create(username=f'x_{role}', role=role)
        c = APIClient(); c.force_authenticate(u)
        assert c.delete(f'/api/v1/catalog/parts/{part.pk}/').status_code == 403
    assert Part.objects.filter(pk='ARC-1').exists()
