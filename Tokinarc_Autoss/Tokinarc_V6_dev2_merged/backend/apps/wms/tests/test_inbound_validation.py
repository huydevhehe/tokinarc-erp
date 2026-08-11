"""
Chốt chặn nhập liệu phiếu nhập kho (2026-08-11 — rà soát cùng ban lãnh đạo).

Bốn lỗ hổng có thật, đã dựng thử trên hệ thống trước khi vá:
  - Bin đích thuộc kho KHÁC kho của phiếu → hàng cộng sang kho kia, tồn kho
    cả hai kho cùng sai mà nhìn phiếu không thấy gì bất thường.
  - SL = 0 → tạo được phiếu rỗng; SL âm → vỡ ràng buộc DB, hiện lỗi kỹ thuật.
  - Ngày nhập kho ở tương lai → báo cáo theo kỳ lệch.
  - Phiếu Nhà cung cấp bỏ trống ô Nhà cung cấp → không biết mua của ai.
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User


@pytest.fixture
def kho(db):
    return User.objects.create(username='iv_kho', role=Role.WAREHOUSE_MANAGER)


@pytest.fixture
def setup(db):
    from apps.catalog.models import Part
    from apps.wms.models import Bin, Warehouse, Zone
    part = Part.objects.create(tokin_part_no='IV-P', category='Tip', display_name_vi='Bép')
    wh_a = Warehouse.objects.create(code='KHOA', name='Kho A', is_active=True, is_default=True)
    wh_b = Warehouse.objects.create(code='KHOB', name='Kho B', is_active=True)
    za = Zone.objects.create(warehouse=wh_a, code='A', name='A')
    zb = Zone.objects.create(warehouse=wh_b, code='A', name='A')
    bin_a = Bin.objects.create(zone=za, rack='R01', bin_code='B1', full_code='KHOA-A-R01-B1')
    bin_b = Bin.objects.create(zone=zb, rack='R01', bin_code='B1', full_code='KHOB-A-R01-B1')
    return {'part': part, 'wh_a': wh_a, 'wh_b': wh_b, 'bin_a': bin_a, 'bin_b': bin_b}


def _post(c, setup, **over):
    payload = {'warehouse': str(setup['wh_a'].id), 'flow_type': 'internal',
               'lines': [{'part': 'IV-P', 'qty_expected': 5}]}
    payload.update(over)
    return c.post('/api/v1/wms/inbound/', payload, format='json')


# ─── Bin đích phải thuộc đúng kho của phiếu ───────────────────────────────
@pytest.mark.django_db
def test_bin_dich_khac_kho_thi_bi_chan(kho, setup):
    from apps.wms.models import InboundOrder
    c = APIClient(); c.force_authenticate(kho)
    r = _post(c, setup, lines=[{'part': 'IV-P', 'qty_expected': 5,
                                'target_bin': setup['bin_b'].id}])
    assert r.status_code == 400, 'bin của kho B mà phiếu kho A thì phải bị chặn'
    assert 'KHOB-A-R01-B1' in str(r.data)
    assert not InboundOrder.objects.exists()


@pytest.mark.django_db
def test_bin_dich_dung_kho_thi_tao_duoc(kho, setup):
    c = APIClient(); c.force_authenticate(kho)
    r = _post(c, setup, lines=[{'part': 'IV-P', 'qty_expected': 5,
                                'target_bin': setup['bin_a'].id}])
    assert r.status_code == 201


@pytest.mark.django_db
def test_sua_phieu_sang_bin_khac_kho_cung_bi_chan(kho, setup):
    """Chặn cả lúc SỬA, không riêng lúc tạo."""
    c = APIClient(); c.force_authenticate(kho)
    r = _post(c, setup, lines=[{'part': 'IV-P', 'qty_expected': 5,
                                'target_bin': setup['bin_a'].id}])
    oid = r.data['id']
    r2 = c.patch(f'/api/v1/wms/inbound/{oid}/',
                 {'lines': [{'part': 'IV-P', 'qty_expected': 5,
                             'target_bin': setup['bin_b'].id}]}, format='json')
    assert r2.status_code == 400


# ─── Số lượng phải lớn hơn 0 ──────────────────────────────────────────────
@pytest.mark.parametrize('sl', [0, -5])
@pytest.mark.django_db
def test_so_luong_khong_hop_le_bi_chan(kho, setup, sl):
    c = APIClient(); c.force_authenticate(kho)
    r = _post(c, setup, lines=[{'part': 'IV-P', 'qty_expected': sl}])
    assert r.status_code == 400
    assert 'lớn hơn 0' in str(r.data), 'phải báo câu người dùng hiểu, không phải lỗi kỹ thuật'


# ─── Ngày nhập kho không được ở tương lai ─────────────────────────────────
@pytest.mark.django_db
def test_ngay_nhap_kho_tuong_lai_bi_chan(kho, setup):
    c = APIClient(); c.force_authenticate(kho)
    r = _post(c, setup, received_at='2099-12-31T00:00:00Z')
    assert r.status_code == 400
    assert 'tương lai' in str(r.data)


@pytest.mark.django_db
def test_ngay_nhap_kho_hom_nay_van_duoc(kho, setup):
    from django.utils import timezone
    c = APIClient(); c.force_authenticate(kho)
    r = _post(c, setup, received_at=timezone.now().isoformat())
    assert r.status_code == 201, 'ngày hôm nay là hợp lệ, không được chặn nhầm'


# ─── Phiếu Nhà cung cấp phải ghi rõ mua của ai ────────────────────────────
@pytest.mark.django_db
def test_phieu_ncc_thieu_nha_cung_cap_bi_chan(kho, setup):
    c = APIClient(); c.force_authenticate(kho)
    r = _post(c, setup, flow_type='supplier', manual_po_no='PO-X')
    assert r.status_code == 400
    assert 'nhà cung cấp' in str(r.data).lower()


@pytest.mark.django_db
def test_phieu_ncc_co_nha_cung_cap_thi_tao_duoc(kho, setup):
    c = APIClient(); c.force_authenticate(kho)
    r = _post(c, setup, flow_type='supplier', manual_po_no='PO-X', supplier='Công ty ABC')
    assert r.status_code == 201


@pytest.mark.django_db
def test_phieu_noi_bo_khong_bat_buoc_nha_cung_cap(kho, setup):
    """Chỉ siết luồng NCC — phiếu nội bộ vẫn để trống NCC được như cũ."""
    c = APIClient(); c.force_authenticate(kho)
    assert _post(c, setup).status_code == 201