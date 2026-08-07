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
    wh, _ = Warehouse.objects.get_or_create(code=f'W{part.pk[:6]}', defaults={'name': 'Kho test'})
    n = InboundOrder.objects.count() + 1
    order = InboundOrder.objects.create(warehouse=wh, code=f'NK-ARC-{n:03d}')
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


# ─── Tham chiếu "lỏng" (không khai báo khoá ngoại) cũng phải chặn xoá ──────
@pytest.mark.django_db
def test_dang_nam_trong_bao_gia_thi_khong_xoa_han(kho, part):
    """Dòng báo giá dùng khoá lỏng (chỉ lưu chuỗi mã) nên Django không chặn
    giúp — xoá hẳn là báo giá cũ trỏ vào mã không còn tồn tại."""
    from apps.crm.models import Customer, Quote, QuoteLine
    sale = User.objects.create(username='sale_arc', role=Role.SALES)
    kh = Customer.objects.create(code='KH-ARC', name='Khách test', owner=sale)
    q = Quote.objects.create(customer=kh, code='BG-ARC', owner=sale)
    QuoteLine.objects.create(quote=q, part_no=part.pk, part_name=part.display_name_vi, qty=2)

    c = APIClient(); c.force_authenticate(kho)
    r = c.delete(f'/api/v1/catalog/parts/{part.pk}/')
    assert r.data['deleted'] is False, 'đang nằm trong báo giá mà vẫn xoá hẳn'
    assert Part.objects.filter(pk='ARC-1').exists()


@pytest.mark.django_db
def test_dang_nam_trong_bo_vat_tu_thi_khong_xoa_han(kho, part):
    from apps.catalog.models import ConsumableSet, ConsumableSetItem
    cs = ConsumableSet.objects.create(set_id='BO-ARC', display_name_vi='Bộ vật tư test')
    ConsumableSetItem.objects.create(consumable_set=cs, part_no=part.pk)

    c = APIClient(); c.force_authenticate(kho)
    r = c.delete(f'/api/v1/catalog/parts/{part.pk}/')
    assert r.data['deleted'] is False, 'đang nằm trong bộ vật tư mà vẫn xoá hẳn'


@pytest.mark.django_db
def test_bang_tuong_thich_sung_han_cung_chan(kho, part):
    from apps.catalog.models import TorchPartMapping
    TorchPartMapping.objects.create(torch_model='TK-308RR', part_no=part.pk)

    c = APIClient(); c.force_authenticate(kho)
    r = c.delete(f'/api/v1/catalog/parts/{part.pk}/')
    assert r.data['deleted'] is False, 'đang nằm trong bảng tương thích mà vẫn xoá hẳn'


@pytest.mark.django_db
def test_xoa_va_tao_lai_cung_ma_nhieu_vong(kho):
    """Xoá → tạo lại → lại xoá → lại tạo… cùng 1 mã, lặp nhiều vòng.

    Mỗi vòng đẩy bản cũ sang 1 mã lưu trữ RIÊNG, mã gốc luôn thuộc về bản mới
    nhất. Không có giới hạn số vòng, không bao giờ đụng nhau.
    """
    c = APIClient(); c.force_authenticate(kho)
    for vong in range(1, 4):
        if vong == 1:
            Part.objects.create(tokin_part_no='LAP-1', category='Tip', display_name_vi='Bản 0')
        # Có chứng từ → xoá chỉ ẩn được (ca khó nhất, bản cũ luôn còn nằm đó)
        _cho_co_lich_su(Part.objects.get(pk='LAP-1'))
        r = c.delete('/api/v1/catalog/parts/LAP-1/')
        assert r.data['deleted'] is False and r.data['hidden'] is True

        r = c.post('/api/v1/catalog/parts/',
                   {'tokin_part_no': 'LAP-1', 'category': 'Tip',
                    'display_name_vi': f'Bản {vong}', 'archive_existing': True}, format='json')
        assert r.status_code == 201, f'vòng {vong} tạo lại không được'
        moi = Part.objects.get(pk='LAP-1')
        assert moi.display_name_vi == f'Bản {vong}' and moi.is_active is True

    luu_tru = sorted(Part.objects.filter(pk__startswith='LAP-1#daxoa-')
                     .values_list('tokin_part_no', 'display_name_vi'))
    assert len(luu_tru) == 3, f'3 vòng phải ra 3 bản lưu trữ riêng, đang có: {luu_tru}'
    assert len({code for code, _ in luu_tru}) == 3, 'mã lưu trữ phải khác nhau từng bản'
    assert [ten for _, ten in luu_tru] == ['Bản 0', 'Bản 1', 'Bản 2']
    assert all(not p.is_active for p in Part.objects.filter(pk__startswith='LAP-1#daxoa-'))
