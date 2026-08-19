"""
Lô hàng: số lô chỉ có ý nghĩa TRONG PHẠM VI một mặt hàng (2026-08-19).

Nhà cung cấp in số lô lên thùng theo cách của họ — 'A1', '2608', 'L01'. Hai mặt
hàng khác nhau trùng số lô là chuyện thường ngày, kể cả khi mua của cùng một nhà
cung cấp. Trước đây hệ thống coi số lô là duy nhất TOÀN KHO nên:

  - Nhập béc hàn lô 'A1' 100 cái  → tạo lô A1 (của béc hàn).
  - Nhập dây hàn lô 'A1' 50 cuộn → tìm thấy lô A1 sẵn có (của béc hàn) rồi cộng
    50 vào đó. Lô A1 thành "béc hàn, còn 150"; dây hàn không có lô nào.

Sai lặng lẽ, không báo lỗi. Hậu quả nặng nhất là lúc truy xuất: nhà cung cấp báo
thu hồi lô A1 thì kho tra ra 150 cái béc hàn — thu hồi nhầm hàng tốt, bỏ sót
hàng lỗi thật. Hạn dùng cũng bị áp nhầm sang mặt hàng khác.
"""
from __future__ import annotations

from datetime import date

import pytest

from apps.wms import services


@pytest.fixture
def kho(db):
    """Hai mặt hàng khác nhau, chung một ô kệ."""
    from apps.catalog.models import Part
    from apps.wms.models import Bin, Warehouse, Zone
    bec = Part.objects.create(tokin_part_no='LOT-BEC', category='Tip', display_name_vi='Béc hàn 0.9')
    day = Part.objects.create(tokin_part_no='LOT-DAY', category='Wire', display_name_vi='Dây hàn')
    wh = Warehouse.objects.create(code='LOTWH', name='Kho lô', is_active=True)
    zone = Zone.objects.create(warehouse=wh, code='A', name='A')
    bin_obj = Bin.objects.create(zone=zone, rack='R01', bin_code='B1', full_code='LOTWH-A-R01-B1')
    return {'bec': bec, 'day': day, 'bin': bin_obj}


@pytest.mark.django_db
def test_hai_mat_hang_trung_so_lo_thi_tach_thanh_hai_lo(kho):
    """Lỗi gốc: 50 cuộn dây bị cộng vào lô của béc hàn."""
    from apps.wms.models import Lot
    services.receive_stock(bin_obj=kho['bin'], part=kho['bec'], qty=100, lot_no='A1')
    services.receive_stock(bin_obj=kho['bin'], part=kho['day'], qty=50, lot_no='A1')

    assert Lot.objects.filter(lot_no='A1').count() == 2, \
        'hai mặt hàng khác nhau trùng số lô phải là hai lô riêng'
    assert Lot.objects.get(lot_no='A1', part=kho['bec']).qty_remaining == 100
    assert Lot.objects.get(lot_no='A1', part=kho['day']).qty_remaining == 50


@pytest.mark.django_db
def test_cung_mat_hang_cung_so_lo_thi_cong_don(kho):
    """Không được đẻ ra lô thứ hai khi hàng cùng lô về làm nhiều đợt."""
    from apps.wms.models import Lot
    services.receive_stock(bin_obj=kho['bin'], part=kho['bec'], qty=100, lot_no='A1')
    services.receive_stock(bin_obj=kho['bin'], part=kho['bec'], qty=30, lot_no='A1')

    assert Lot.objects.filter(part=kho['bec'], lot_no='A1').count() == 1
    assert Lot.objects.get(part=kho['bec'], lot_no='A1').qty_remaining == 130


@pytest.mark.django_db
def test_han_dung_khong_bi_ap_nham_sang_mat_hang_khac(kho):
    """Hạn của lô béc hàn không được dính sang lô cùng tên của dây hàn."""
    from apps.wms.models import Lot
    services.receive_stock(bin_obj=kho['bin'], part=kho['bec'], qty=10, lot_no='A1',
                           lot_expires=date(2027, 1, 31))
    services.receive_stock(bin_obj=kho['bin'], part=kho['day'], qty=10, lot_no='A1',
                           lot_expires=date(2028, 12, 31))

    assert Lot.objects.get(lot_no='A1', part=kho['bec']).expires_at == date(2027, 1, 31)
    assert Lot.objects.get(lot_no='A1', part=kho['day']).expires_at == date(2028, 12, 31)


@pytest.mark.django_db
def test_nhap_kho_qua_api_tao_dung_lo_cho_tung_mat_hang(kho):
    """Đi đúng đường người dùng đi: tạo phiếu có số lô → bấm Nhận đủ → sinh lô."""
    from rest_framework.test import APIClient

    from apps.accounts.models import Role, User
    from apps.wms.models import Lot
    c = APIClient(); c.force_authenticate(User.objects.create(username='lot_kho',
                                                             role=Role.WAREHOUSE_MANAGER))
    r = c.post('/api/v1/wms/inbound/', {
        'warehouse': str(kho['bin'].zone.warehouse_id), 'flow_type': 'internal',
        'lines': [
            {'part': 'LOT-BEC', 'qty_expected': 100, 'target_bin': kho['bin'].id,
             'lot_no': 'A1', 'lot_expires': '2027-01-31'},
            {'part': 'LOT-DAY', 'qty_expected': 50, 'target_bin': kho['bin'].id,
             'lot_no': 'A1', 'lot_expires': '2028-12-31'},
        ]}, format='json')
    assert r.status_code == 201, r.data
    assert c.post(f"/api/v1/wms/inbound/{r.data['id']}/confirm/", {}, format='json').status_code == 200

    assert Lot.objects.filter(lot_no='A1').count() == 2
    assert Lot.objects.get(lot_no='A1', part_id='LOT-BEC').qty_remaining == 100
    assert Lot.objects.get(lot_no='A1', part_id='LOT-DAY').qty_remaining == 50
    assert str(Lot.objects.get(lot_no='A1', part_id='LOT-BEC').expires_at) == '2027-01-31'


@pytest.mark.django_db
def test_cung_mat_hang_khong_duoc_trung_so_lo(kho):
    """Nới 'duy nhất toàn kho' → 'duy nhất trong một mặt hàng', không nới hơn nữa."""
    from django.db import IntegrityError, transaction

    from apps.wms.models import Lot
    Lot.objects.create(lot_no='A1', part=kho['bec'], qty_remaining=1, received_date=date.today())
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Lot.objects.create(lot_no='A1', part=kho['bec'], qty_remaining=1,
                               received_date=date.today())