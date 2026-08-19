"""
Serial: hoa/thường và chuyện nhập tay (2026-08-19 — ban lãnh đạo hỏi).

Serial LƯU NGUYÊN như tem nhà sản xuất in: hoa ra hoa, thường ra thường. Nhưng
việc DÒ TRÙNG thì bỏ qua hoa/thường, vì 'SN-001' và 'sn-001' là cùng một cây
hàng ngoài đời — để lọt thì kho có hai hồ sơ cho một cái hàng, tới lúc khách
mang đi bảo hành tra không ra mới lộ.

Kèm một lỗi tự gây hôm nay: trang Truy xuất lọc 'chỉ lấy serial của súng hàn
đang hoạt động', nên serial của VẬT TƯ (không có súng) bị loại sạch.
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User


@pytest.fixture
def kho(db):
    from apps.catalog.models import Part, Torch
    from apps.wms.models import Bin, Warehouse, Zone
    part = Part.objects.create(tokin_part_no='HT-PART', category='Tip', display_name_vi='Béc hàn')
    torch = Torch.objects.create(model_code='HT-TORCH', display_name_vi='Súng thử')
    wh = Warehouse.objects.create(code='HTWH', name='Kho thử', is_active=True)
    zone = Zone.objects.create(warehouse=wh, code='A', name='A')
    bin_obj = Bin.objects.create(zone=zone, rack='R01', bin_code='B1', full_code='HTWH-A-R01-B1')
    return {'part': part, 'torch': torch, 'bin': bin_obj, 'wh': wh}


@pytest.fixture
def c(db):
    cl = APIClient()
    cl.force_authenticate(User.objects.create(username='ht_kho', role=Role.WAREHOUSE_MANAGER))
    return cl


def _nhap(c, kho, serials, ma='HT-PART', sl=2):
    r = c.post('/api/v1/wms/inbound/', {
        'warehouse': str(kho['wh'].id), 'flow_type': 'internal',
        'lines': [{'part': ma, 'qty_expected': sl, 'target_bin': kho['bin'].id,
                   'serials_raw': serials}]}, format='json')
    assert r.status_code == 201, r.data
    return c.post(f"/api/v1/wms/inbound/{r.data['id']}/confirm/", {}, format='json')


# ─── Thống nhất một kiểu: luôn lưu chữ hoa ────────────────────────────────
@pytest.mark.django_db
def test_serial_luon_luu_chu_hoa(c, kho):
    """Gõ kiểu gì cũng về một kiểu duy nhất — khỏi phải đoán trong máy đang là gì."""
    from apps.wms.models import SerialNumber
    assert _nhap(c, kho, 'aB-12x\nCd-34Y').status_code == 200
    assert set(SerialNumber.objects.values_list('serial', flat=True)) == {'AB-12X', 'CD-34Y'}


@pytest.mark.django_db
def test_go_chu_thuong_trung_hang_da_co_thi_khong_de_them_ho_so(c, kho):
    """Gốc của vấn đề: 'sn-001' và 'SN-001' là CÙNG một cây hàng, không phải hai."""
    from apps.wms.models import SerialNumber
    assert _nhap(c, kho, 'SN-001\nSN-002').status_code == 200
    assert SerialNumber.objects.count() == 2

    assert _nhap(c, kho, 'sn-001\nSN-003').status_code == 200
    assert SerialNumber.objects.count() == 3, 'chỉ được thêm SN-003, sn-001 là cái đã có'
    assert set(SerialNumber.objects.values_list('serial', flat=True)) == {'SN-001', 'SN-002', 'SN-003'}


@pytest.mark.django_db
def test_tao_thang_bang_code_cung_ve_chu_hoa(c, kho):
    """Chuẩn hoá nằm ở tầng model nên mọi đường vào đều thống nhất."""
    from apps.wms.models import SerialNumber
    SerialNumber.objects.create(serial='  tay-01 ', part=kho['part'])
    assert SerialNumber.objects.get(part=kho['part']).serial == 'TAY-01'


@pytest.mark.django_db
def test_nhan_mot_phan_roi_nhan_tiep_khong_bao_trung(c, kho):
    """Phiếu nhận một phần bấm nhận tiếp được — serial trùng KHỚP HỆT là của
    chính lần trước, phải im lặng bỏ qua chứ không được báo lỗi trùng."""
    from apps.wms.models import SerialNumber
    r = c.post('/api/v1/wms/inbound/', {
        'warehouse': str(kho['wh'].id), 'flow_type': 'internal',
        'lines': [{'part': 'HT-PART', 'qty_expected': 2, 'target_bin': kho['bin'].id,
                   'serials_raw': 'SN-100\nSN-101'}]}, format='json')
    oid = r.data['id']
    assert c.post(f'/api/v1/wms/inbound/{oid}/confirm/', {'partial': True},
                  format='json').status_code == 200
    assert c.post(f'/api/v1/wms/inbound/{oid}/confirm/', {}, format='json').status_code == 200
    assert SerialNumber.objects.filter(serial__startswith='SN-10').count() == 2, \
        'không được đẻ thêm hồ sơ ở lần nhận thứ hai'


@pytest.mark.django_db
def test_khoang_trang_thua_bi_cat(c, kho):
    from apps.wms.models import SerialNumber
    assert _nhap(c, kho, '  SN-200  \n\tSN-201\t').status_code == 200
    assert set(SerialNumber.objects.values_list('serial', flat=True)) == {'SN-200', 'SN-201'}


# ─── Serial của vật tư phải hiện trên trang Truy xuất ─────────────────────
@pytest.mark.django_db
def test_serial_cua_vat_tu_hien_tren_trang_truy_xuat(c, kho):
    """Lỗi thật: bộ lọc chỉ lấy serial của súng hàn → serial vật tư mất sạch."""
    assert _nhap(c, kho, 'VT-900\nVT-901').status_code == 200
    r = c.get('/api/v1/wms/serials/?search=VT-9')
    assert r.data['count'] == 2, 'serial của vật tư phải tra được, không được biến mất'


@pytest.mark.django_db
def test_serial_cua_sung_han_van_hien_binh_thuong(c, kho):
    """Không được sửa chỗ này rồi làm hỏng cái đang chạy tốt."""
    r = c.post('/api/v1/wms/inbound/', {
        'warehouse': str(kho['wh'].id), 'flow_type': 'internal',
        'lines': [{'torch': 'HT-TORCH', 'qty_expected': 1, 'target_bin': kho['bin'].id,
                   'serials_raw': 'SUNG-01'}]}, format='json')
    assert c.post(f"/api/v1/wms/inbound/{r.data['id']}/confirm/", {}, format='json').status_code == 200
    assert c.get('/api/v1/wms/serials/?search=SUNG-01').data['count'] == 1


@pytest.mark.django_db
def test_hang_da_an_khoi_danh_muc_thi_khong_tinh(c, kho):
    """Giữ đúng ý ban đầu của bộ lọc: hàng đã ẩn thì không hiện."""
    assert _nhap(c, kho, 'AN-01').status_code == 200
    assert c.get('/api/v1/wms/serials/?search=AN-01').data['count'] == 1
    kho['part'].is_active = False
    kho['part'].save(update_fields=['is_active'])
    assert c.get('/api/v1/wms/serials/?search=AN-01').data['count'] == 0