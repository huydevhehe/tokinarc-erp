"""
Bổ sung lô / serial cho phiếu ĐÃ NHẬN (2026-08-19 — kho yêu cầu).

Nhận hàng lúc gấp thường chưa kịp ghi số lô với serial, mà phiếu đã nhận thì
khoá sửa để tồn kho không lệch. Mở đúng ba trường phục vụ truy xuất, giao cho
Quản lý kho trở lên, không đụng số lượng / mặt hàng / ô kệ.

Chỗ dễ sai nhất: hàng đã xuất bớt rồi mới bổ sung lô. Lúc xuất, hệ thống chỉ
trừ lô nếu khi đó ĐÃ CÓ lô — chưa có thì không trừ gì. Nên lô sinh sau phải ghi
theo SỐ CÒN THỰC TRONG Ô, không phải số nhập ban đầu, nếu không lô ghi thừa
ngay từ lúc tạo mà không ai phát hiện.
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User


@pytest.fixture
def kho(db):
    from apps.catalog.models import Part
    from apps.wms.models import Bin, Warehouse, Zone
    part = Part.objects.create(tokin_part_no='BS-PART', category='Tip', display_name_vi='Béc hàn')
    wh = Warehouse.objects.create(code='BSWH', name='Kho thử', is_active=True)
    zone = Zone.objects.create(warehouse=wh, code='A', name='A')
    bin_obj = Bin.objects.create(zone=zone, rack='R01', bin_code='B1', full_code='BSWH-A-R01-B1')
    return {'part': part, 'bin': bin_obj, 'wh': wh}


def _client(role, ten):
    c = APIClient()
    c.force_authenticate(User.objects.create(username=ten, role=role))
    return c


@pytest.fixture
def ql(db):
    return _client(Role.WAREHOUSE_MANAGER, 'bs_ql')


@pytest.fixture
def phieu_da_nhan(ql, kho):
    """Phiếu đã nhận 100 cái, chưa khai lô lẫn serial."""
    r = ql.post('/api/v1/wms/inbound/', {
        'warehouse': str(kho['wh'].id), 'flow_type': 'internal',
        'lines': [{'part': 'BS-PART', 'qty_expected': 100, 'target_bin': kho['bin'].id}],
    }, format='json')
    assert r.status_code == 201, r.data
    oid = r.data['id']
    assert ql.post(f'/api/v1/wms/inbound/{oid}/confirm/', {}, format='json').status_code == 200
    from apps.wms.models import InboundOrder
    return InboundOrder.objects.get(pk=oid)


def _bo_sung(c, o, **truong):
    return c.post(f'/api/v1/wms/inbound/{o.id}/bo-sung-truy-xuat/',
                  {'lines': [{'id': o.lines.first().id, **truong}]}, format='json')


# ─── Việc chính ───────────────────────────────────────────────────────────
@pytest.mark.django_db
def test_bo_sung_so_lo_sau_khi_da_nhan(ql, kho, phieu_da_nhan):
    from apps.wms.models import Lot
    r = _bo_sung(ql, phieu_da_nhan, lot_no='LO-SAU-01', lot_expires='2028-01-31')
    assert r.status_code == 200, r.data

    lo = Lot.objects.get(lot_no='LO-SAU-01')
    assert lo.part_id == 'BS-PART' and lo.qty_remaining == 100
    assert str(lo.expires_at) == '2028-01-31'
    assert lo.bin_id == kho['bin'].id


@pytest.mark.django_db
def test_bo_sung_serial_sau_khi_da_nhan(ql, kho):
    from apps.wms.models import InboundOrder, SerialNumber
    r = ql.post('/api/v1/wms/inbound/', {
        'warehouse': str(kho['wh'].id), 'flow_type': 'internal',
        'lines': [{'part': 'BS-PART', 'qty_expected': 2, 'target_bin': kho['bin'].id}],
    }, format='json')
    oid = r.data['id']
    ql.post(f'/api/v1/wms/inbound/{oid}/confirm/', {}, format='json')
    o = InboundOrder.objects.get(pk=oid)

    assert _bo_sung(ql, o, serials_raw='bs-01\nbs-02').status_code == 200
    assert set(SerialNumber.objects.values_list('serial', flat=True)) == {'BS-01', 'BS-02'}


@pytest.mark.django_db
def test_ton_kho_khong_doi_sau_khi_bo_sung(ql, kho, phieu_da_nhan):
    """Cốt lõi: bổ sung truy xuất KHÔNG được đụng tới tồn kho."""
    from apps.wms.models import InventoryItem
    truoc = InventoryItem.objects.get(bin=kho['bin'], part_id='BS-PART').qty_on_hand
    assert _bo_sung(ql, phieu_da_nhan, lot_no='LO-X', serials_raw='').status_code == 200
    assert InventoryItem.objects.get(bin=kho['bin'], part_id='BS-PART').qty_on_hand == truoc == 100


# ─── Hàng đã xuất bớt ─────────────────────────────────────────────────────
@pytest.mark.django_db
def test_hang_da_xuat_bot_thi_lo_ghi_theo_so_con_lai(ql, kho, phieu_da_nhan):
    """Xuất 30 rồi mới bổ sung lô → lô phải ghi 70, không phải 100."""
    from apps.wms import services
    from apps.wms.models import Lot
    services.issue_stock(bin_obj=kho['bin'], part=kho['part'], torch=None, qty=30,
                         ref_id='TEST-XUAT')

    assert _bo_sung(ql, phieu_da_nhan, lot_no='LO-CON-70').status_code == 200
    assert Lot.objects.get(lot_no='LO-CON-70').qty_remaining == 70, \
        'ghi theo số nhập ban đầu là lô thừa 30 ngay từ lúc tạo'


@pytest.mark.django_db
def test_hang_da_xuat_het_thi_chan_gan_lo(ql, kho, phieu_da_nhan):
    from apps.wms import services
    from apps.wms.models import Lot
    services.issue_stock(bin_obj=kho['bin'], part=kho['part'], torch=None, qty=100,
                         ref_id='TEST-XUAT-HET')

    r = _bo_sung(ql, phieu_da_nhan, lot_no='LO-RONG')
    assert r.status_code == 400
    assert 'không còn hàng' in str(r.data)
    assert not Lot.objects.filter(lot_no='LO-RONG').exists()


# ─── Chốt chặn ────────────────────────────────────────────────────────────
@pytest.mark.django_db
def test_serial_lech_so_da_nhan_thi_bi_chan(ql, phieu_da_nhan):
    r = _bo_sung(ql, phieu_da_nhan, serials_raw='A1\nA2')
    assert r.status_code == 400 and 'khớp nhau' in str(r.data)


@pytest.mark.django_db
def test_nhan_vien_kho_khong_duoc_bo_sung(kho, phieu_da_nhan):
    from apps.wms.models import Lot
    nv = _client(Role.WAREHOUSE, 'bs_nv')
    r = _bo_sung(nv, phieu_da_nhan, lot_no='LO-NV')
    assert r.status_code == 403
    assert not Lot.objects.filter(lot_no='LO-NV').exists()


@pytest.mark.django_db
def test_phieu_chua_nhan_thi_khong_dung_duong_nay(ql, kho):
    """Phiếu nháp sửa thẳng trên phiếu, không đi cửa bổ sung."""
    from apps.wms.models import InboundOrder
    r = ql.post('/api/v1/wms/inbound/', {
        'warehouse': str(kho['wh'].id), 'flow_type': 'internal',
        'lines': [{'part': 'BS-PART', 'qty_expected': 5, 'target_bin': kho['bin'].id}],
    }, format='json')
    o = InboundOrder.objects.get(pk=r.data['id'])
    assert _bo_sung(ql, o, lot_no='LO-NHAP').status_code == 409


@pytest.mark.django_db
def test_dong_hang_khong_thuoc_phieu_thi_bi_chan(ql, phieu_da_nhan):
    r = ql.post(f'/api/v1/wms/inbound/{phieu_da_nhan.id}/bo-sung-truy-xuat/',
                {'lines': [{'id': 999999, 'lot_no': 'LO-LAC'}]}, format='json')
    assert r.status_code == 400 and 'không thuộc phiếu này' in str(r.data)


@pytest.mark.django_db
def test_ghi_vet_ai_bo_sung(ql, phieu_da_nhan):
    from apps.wms.models import StockMovement
    assert _bo_sung(ql, phieu_da_nhan, lot_no='LO-VET').status_code == 200
    mv = StockMovement.objects.filter(note__startswith='bổ sung lô').first()
    assert mv is not None and mv.delta == 0, 'ghi vết nhưng không được đụng tồn'
    assert mv.by_user.username == 'bs_ql'