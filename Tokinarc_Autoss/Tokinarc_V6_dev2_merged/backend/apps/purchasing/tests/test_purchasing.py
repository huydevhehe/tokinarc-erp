from __future__ import annotations

import datetime as dt

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.catalog.models import Part
from apps.purchasing.models import PurchaseOrder, Supplier
from apps.wms.models import Bin, InventoryItem, Warehouse, Zone


@pytest.fixture
def manager(db):
    return User.objects.create(username='m1', role=Role.MANAGER)


@pytest.fixture
def warehouse_user(db):
    return User.objects.create(username='k1', role=Role.WAREHOUSE)


@pytest.fixture
def part(db):
    return Part.objects.create(tokin_part_no='001002', category='Tip', display_name_vi='Bép')


@pytest.fixture
def wh(db):
    w = Warehouse.objects.create(code='HCM', name='Kho', is_active=True, is_default=True)
    z = Zone.objects.create(warehouse=w, code='MIG', name='MIG')
    Bin.objects.create(zone=z, rack='T1', bin_code='B01', full_code='HCM-MIG-T1-B01')
    return w


@pytest.mark.django_db
def test_po_full_flow(manager, warehouse_user, part, wh):
    mc = APIClient(); mc.force_authenticate(manager)
    sup = mc.post('/api/v1/purchasing/suppliers/',
                  {'code': 'NCC-001', 'name': 'Cong ty Tokin VN'}, format='json')
    assert sup.status_code == 201
    # Tạo PO
    po = mc.post('/api/v1/purchasing/orders/', {
        'supplier': sup.data['id'], 'warehouse': str(wh.id),
        'lines': [{'part': '001002', 'qty': 100, 'unit_cost': 50000}],
    }, format='json')
    assert po.status_code == 201
    assert int(po.data['total_vnd']) == 5_000_000
    pid = po.data['id']
    # Duyệt (dưới ngưỡng → manager duyệt là approved) → mới đặt được
    assert mc.post(f'/api/v1/purchasing/orders/{pid}/approve/').data['status'] == 'approved'
    # Đặt hàng
    assert mc.post(f'/api/v1/purchasing/orders/{pid}/confirm/').data['status'] == 'ordered'
    # NV kho nhận hàng → cộng tồn
    kc = APIClient(); kc.force_authenticate(warehouse_user)
    r = kc.post(f'/api/v1/purchasing/orders/{pid}/receive/')
    assert r.status_code == 200 and r.data['status'] == 'received'
    assert InventoryItem.objects.get(part=part).qty_on_hand == 100


@pytest.mark.django_db
def test_po_partial_receive(manager, warehouse_user, part, wh):
    mc = APIClient(); mc.force_authenticate(manager)
    sup = Supplier.objects.create(code='NCC-002', name='NCC B', created_by=manager, updated_by=manager)
    po = mc.post('/api/v1/purchasing/orders/', {
        'supplier': str(sup.id), 'warehouse': str(wh.id),
        'lines': [{'part': '001002', 'qty': 50, 'unit_cost': 1000}],
    }, format='json').data
    mc.post(f"/api/v1/purchasing/orders/{po['id']}/approve/")   # duyệt trước
    mc.post(f"/api/v1/purchasing/orders/{po['id']}/confirm/")
    kc = APIClient(); kc.force_authenticate(warehouse_user)
    line_id = po['lines'][0]['id']
    r = kc.post(f"/api/v1/purchasing/orders/{po['id']}/receive/",
                {'lines': [{'line_id': line_id, 'qty': 20}]}, format='json')
    assert r.data['status'] == 'partial'
    assert InventoryItem.objects.get(part=part).qty_on_hand == 20


@pytest.mark.django_db
def test_ap_payment_and_summary(manager, part, wh):
    mc = APIClient(); mc.force_authenticate(manager)
    sup = Supplier.objects.create(code='NCC-003', name='NCC C', created_by=manager, updated_by=manager)
    po = PurchaseOrder.objects.create(code='PO-T-1', supplier=sup, warehouse=wh,
                                      status='received', total_vnd=3_000_000, owner=manager,
                                      created_by=manager, updated_by=manager)
    r = mc.post('/api/v1/purchasing/payments/',
                {'po': str(po.id), 'amount_vnd': 1_000_000, 'paid_at': '2026-06-01'}, format='json')
    assert r.status_code == 201
    po.refresh_from_db(); assert int(po.paid_vnd) == 1_000_000 and int(po.debt_vnd) == 2_000_000
    ap = mc.get('/api/v1/purchasing/orders/ap-summary/')
    assert ap.data['total_payable'] == 2_000_000


@pytest.mark.django_db
def test_ap_payment_export_misa(manager, part, wh):
    mc = APIClient(); mc.force_authenticate(manager)
    sup = Supplier.objects.create(code='NCC-EXP', name='E', created_by=manager, updated_by=manager)
    po = PurchaseOrder.objects.create(code='PO-EXP-1', supplier=sup, warehouse=wh,
                                      status='received', total_vnd=2_000_000, owner=manager,
                                      created_by=manager, updated_by=manager)
    mc.post('/api/v1/purchasing/payments/',
            {'po': str(po.id), 'amount_vnd': 500_000, 'paid_at': '2026-06-01'}, format='json')
    r = mc.get('/api/v1/purchasing/payments/export-misa/')
    assert r.status_code == 200 and 'spreadsheet' in r['Content-Type']


@pytest.mark.django_db
def test_sale_cannot_create_po(part, wh):
    sale = User.objects.create(username='s1', role=Role.SALES)
    c = APIClient(); c.force_authenticate(sale)
    sup = Supplier.objects.create(code='NCC-004', name='D')
    r = c.post('/api/v1/purchasing/orders/',
               {'supplier': str(sup.id), 'warehouse': str(wh.id), 'lines': []}, format='json')
    assert r.status_code == 403


@pytest.mark.django_db
def test_po_line_rejects_negative_qty(manager, part, wh):
    """Regression (bug hunt 22/07): dòng đơn mua phải chặn qty âm ở đầu vào (400),
    tránh đụng ràng buộc CHECK po_received_le_qty và sập 500."""
    mc = APIClient(); mc.force_authenticate(manager)
    sup = Supplier.objects.create(code='NCC-NEG', name='X', created_by=manager, updated_by=manager)
    r = mc.post('/api/v1/purchasing/orders/', {
        'supplier': str(sup.id), 'warehouse': str(wh.id),
        'lines': [{'part': '001002', 'qty': -10, 'unit_cost': 5000}],
    }, format='json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_wh_manager_cannot_create_po(part, wh):
    """#16 biên bản: 'Quản lý kho' không còn được tạo PO (chỉ Quản lý/CEO)."""
    whm = User.objects.create(username='qlk1', role=Role.WAREHOUSE_MANAGER)
    c = APIClient(); c.force_authenticate(whm)
    sup = Supplier.objects.create(code='NCC-005', name='E')
    r = c.post('/api/v1/purchasing/orders/',
               {'supplier': str(sup.id), 'warehouse': str(wh.id), 'lines': []}, format='json')
    assert r.status_code == 403


@pytest.mark.django_db
def test_po_approve_is_single_level_regardless_of_amount(manager, part, wh):
    """#16 biên bản: duyệt PO chỉ còn 1 cấp — kể cả đơn giá trị lớn (vượt
    ngưỡng L2 cũ) vẫn được duyệt xong (approved) ngay ở 1 lần approve()."""
    mc = APIClient(); mc.force_authenticate(manager)
    sup = Supplier.objects.create(code='NCC-006', name='F', created_by=manager, updated_by=manager)
    po = mc.post('/api/v1/purchasing/orders/', {
        'supplier': str(sup.id), 'warehouse': str(wh.id),
        'lines': [{'part': '001002', 'qty': 1000, 'unit_cost': 200_000}],   # 200 triệu — vượt ngưỡng L2 cũ
    }, format='json').data
    assert int(po['total_vnd']) == 200_000_000
    r = mc.post(f"/api/v1/purchasing/orders/{po['id']}/approve/")
    assert r.status_code == 200
    assert r.data['status'] == 'approved'
    assert r.data['l1_approved_by'] == manager.id


@pytest.mark.django_db
def test_po_approve_and_reject_blocked_for_warehouse_role(part, wh):
    """Đợt A (mục #1 biên bản): NV kho không có capability
    `purchasing.po.approve`/`purchasing.po.reject` (mặc định chỉ manager/CEO)."""
    wh_user = User.objects.create(username='po_wh1', role=Role.WAREHOUSE)
    manager = User.objects.create(username='po_mgr_a', role=Role.MANAGER)
    sup = Supplier.objects.create(code='NCC-008', name='H', created_by=manager, updated_by=manager)
    po = PurchaseOrder.objects.create(code='PO-T-3', supplier=sup, warehouse=wh,
                                      status='draft', total_vnd=1_000_000, owner=manager,
                                      created_by=manager, updated_by=manager)
    c = APIClient(); c.force_authenticate(wh_user)
    assert c.post(f'/api/v1/purchasing/orders/{po.id}/approve/').status_code == 403
    assert c.post(f'/api/v1/purchasing/orders/{po.id}/reject/').status_code == 403


@pytest.mark.django_db
def test_po_approve_l2_endpoint_removed():
    """#16 biên bản: action approve-l2 đã bị xoá hoàn toàn khỏi router (không
    còn resolve được nữa) — dùng reverse() để tránh lỗi render trang 404 mặc
    định của Django khi gọi thẳng URL không tồn tại qua test client."""
    from django.urls import NoReverseMatch, reverse
    with pytest.raises(NoReverseMatch):
        reverse('purchaseorder-approve-l2', args=['x'])
