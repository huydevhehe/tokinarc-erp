"""
Lô và serial dùng được cho CẢ vật tư lẫn súng hàn (2026-08-19 — kho yêu cầu).

Trước đây phân vai cứng: serial chỉ gắn được vào súng hàn, lô chỉ gắn được vào
vật tư. Thực tế kho không chia gọn vậy — NCC đánh serial cho cả vật tư giá trị
cao, và súng hàn cũng về theo lô sản xuất. Không có chỗ chứa thì nhân viên khai
vào cũng bị bỏ đi, tới lúc cần truy xuất mới biết là mất.

Cả hai đều KHÔNG bắt buộc. Bỏ trống cả hai vẫn nhập được (màn hình chỉ nhắc),
vì hàng tiêu hao mua theo thùng thường chẳng có số nào cả — ép điền chỉ tổ đẻ ra
số bịa, còn hại hơn để trống.
"""
from __future__ import annotations

import pytest

from apps.wms import services


@pytest.fixture
def kho(db):
    from apps.catalog.models import Part, Torch
    from apps.wms.models import Bin, Warehouse, Zone
    part = Part.objects.create(tokin_part_no='SL-PART', category='Tip', display_name_vi='Béc hàn')
    torch = Torch.objects.create(model_code='SL-TORCH', display_name_vi='Súng hàn thử')
    wh = Warehouse.objects.create(code='SLWH', name='Kho thử', is_active=True)
    zone = Zone.objects.create(warehouse=wh, code='A', name='A')
    bin_obj = Bin.objects.create(zone=zone, rack='R01', bin_code='B1', full_code='SLWH-A-R01-B1')
    return {'part': part, 'torch': torch, 'bin': bin_obj, 'wh': wh}


def _tao_phieu(c, kho, dong):
    r = c.post('/api/v1/wms/inbound/', {
        'warehouse': str(kho['wh'].id), 'flow_type': 'internal', 'lines': [dong],
    }, format='json')
    assert r.status_code == 201, r.data
    return r.data['id']


@pytest.fixture
def client_kho(db):
    from rest_framework.test import APIClient

    from apps.accounts.models import Role, User
    c = APIClient()
    c.force_authenticate(User.objects.create(username='sl_kho', role=Role.WAREHOUSE_MANAGER))
    return c


# ─── Serial cho vật tư ────────────────────────────────────────────────────
@pytest.mark.django_db
def test_vat_tu_khai_serial_thi_tao_duoc_ho_so_tung_cai(client_kho, kho):
    from apps.wms.models import SerialNumber
    oid = _tao_phieu(client_kho, kho, {
        'part': 'SL-PART', 'qty_expected': 2, 'target_bin': kho['bin'].id,
        'serials_raw': 'VT-001\nVT-002'})
    assert client_kho.post(f'/api/v1/wms/inbound/{oid}/confirm/', {}, format='json').status_code == 200

    assert SerialNumber.objects.filter(part_id='SL-PART').count() == 2
    sn = SerialNumber.objects.get(serial='VT-001')
    assert sn.torch_id is None and sn.item_code == 'SL-PART'
    assert sn.bin_id == kho['bin'].id


# ─── Lô cho súng hàn ──────────────────────────────────────────────────────
@pytest.mark.django_db
def test_sung_han_khai_so_lo_thi_tao_duoc_lo(client_kho, kho):
    from apps.wms.models import Lot
    oid = _tao_phieu(client_kho, kho, {
        'torch': 'SL-TORCH', 'qty_expected': 5, 'target_bin': kho['bin'].id,
        'lot_no': 'LOSUNG-01', 'lot_expires': '2029-06-30'})
    assert client_kho.post(f'/api/v1/wms/inbound/{oid}/confirm/', {}, format='json').status_code == 200

    lo = Lot.objects.get(lot_no='LOSUNG-01')
    assert lo.torch_id == 'SL-TORCH' and lo.part_id is None
    assert lo.item_code == 'SL-TORCH' and lo.qty_remaining == 5


# ─── Khai cả hai cùng lúc ─────────────────────────────────────────────────
@pytest.mark.django_db
def test_khai_ca_lo_lan_serial_tren_cung_mot_dong(client_kho, kho):
    """Yêu cầu của kho: điền cả hai để truy xuất được từ hai đường."""
    from apps.wms.models import Lot, SerialNumber
    oid = _tao_phieu(client_kho, kho, {
        'torch': 'SL-TORCH', 'qty_expected': 2, 'target_bin': kho['bin'].id,
        'lot_no': 'CA-HAI-01', 'serials_raw': 'SN-A\nSN-B'})
    assert client_kho.post(f'/api/v1/wms/inbound/{oid}/confirm/', {}, format='json').status_code == 200

    assert Lot.objects.get(lot_no='CA-HAI-01').qty_remaining == 2
    assert SerialNumber.objects.filter(torch_id='SL-TORCH').count() == 2


# ─── Bỏ trống cả hai vẫn nhập được ────────────────────────────────────────
@pytest.mark.django_db
def test_bo_trong_ca_hai_van_nhap_duoc(client_kho, kho):
    """Hàng tiêu hao không có số nào — chặn ở đây là làm tắc việc kho."""
    from apps.wms.models import InventoryItem
    oid = _tao_phieu(client_kho, kho, {
        'part': 'SL-PART', 'qty_expected': 500, 'target_bin': kho['bin'].id})
    assert client_kho.post(f'/api/v1/wms/inbound/{oid}/confirm/', {}, format='json').status_code == 200
    assert InventoryItem.objects.get(bin=kho['bin'], part_id='SL-PART').qty_on_hand == 500


# ─── Không được gắn vào cả hai loại hàng cùng lúc ─────────────────────────
@pytest.mark.django_db
def test_mot_serial_khong_the_vua_la_vat_tu_vua_la_sung(kho):
    from django.db import IntegrityError, transaction

    from apps.wms.models import SerialNumber
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            SerialNumber.objects.create(serial='X-1', part=kho['part'], torch=kho['torch'])


@pytest.mark.django_db
def test_mot_lo_khong_the_vua_la_vat_tu_vua_la_sung(kho):
    from datetime import date

    from django.db import IntegrityError, transaction

    from apps.wms.models import Lot
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Lot.objects.create(lot_no='X-1', part=kho['part'], torch=kho['torch'],
                               qty_remaining=1, received_date=date.today())


@pytest.mark.django_db
def test_sung_han_trung_so_lo_voi_vat_tu_thi_van_tach_rieng(kho):
    """Cùng số lô nhưng khác loại hàng — phải là hai lô, không gộp."""
    from apps.wms.models import Lot
    services.receive_stock(bin_obj=kho['bin'], part=kho['part'], qty=10, lot_no='TRUNG-01')
    services.receive_stock(bin_obj=kho['bin'], torch=kho['torch'], qty=3, lot_no='TRUNG-01')

    assert Lot.objects.filter(lot_no='TRUNG-01').count() == 2
    assert Lot.objects.get(lot_no='TRUNG-01', part=kho['part']).qty_remaining == 10
    assert Lot.objects.get(lot_no='TRUNG-01', torch=kho['torch']).qty_remaining == 3
