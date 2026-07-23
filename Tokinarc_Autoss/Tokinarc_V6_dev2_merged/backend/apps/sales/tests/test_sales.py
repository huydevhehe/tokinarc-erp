"""
Tokinarc V6.C — apps/sales/tests/test_sales.py
"""
from __future__ import annotations

import datetime as dt

import factory
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.crm.models import Customer
from apps.sales import services
from apps.sales.models import SalesOrder


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User
    username = factory.Sequence(lambda n: f'sale{n}')
    role = Role.SALES


class CustomerFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Customer
    code = factory.Sequence(lambda n: f'KH-{n:04d}')
    name = factory.Faker('company', locale='vi_VN')
    segment = 'factory'
    owner = factory.SubFactory(UserFactory)


@pytest.fixture
def sale(db):
    return UserFactory(role=Role.SALES)


@pytest.fixture
def auth(sale):
    c = APIClient(); c.force_authenticate(sale)
    return c


@pytest.mark.django_db
def test_line_total_computed_by_backend(auth, sale):
    cust = CustomerFactory(owner=sale)
    r = auth.post('/api/v1/sales/orders/', {
        'code': 'HD-0001', 'customer': str(cust.id), 'issued_date': '2026-06-01',
        'payment_terms': 'net_30',
        'lines': [{'description': 'Béc hàn', 'qty': 10, 'unit_price': 45000, 'discount_pct': 10}],
    }, format='json')
    assert r.status_code == 201
    # 10*45000 = 450000, -10% = 405000
    assert r.data['lines'][0]['line_total'] == '405000'
    assert r.data['total_vnd'] == '405000'


@pytest.mark.django_db
def test_order_line_rejects_negative_and_bad_discount(auth, sale):
    """Regression (bug hunt 22/07): dòng Đơn bán phải chặn qty âm / đơn giá âm /
    chiết khấu >100% ở đầu vào (400), tránh sập 500 hoặc tổng tiền âm."""
    cust = CustomerFactory(owner=sale)
    base = {'code': 'HD-NEG', 'customer': str(cust.id), 'issued_date': '2026-06-01', 'payment_terms': 'net_30'}
    assert auth.post('/api/v1/sales/orders/', {**base, 'code': 'HD-N1',
        'lines': [{'description': 'x', 'qty': -5, 'unit_price': 10000}]}, format='json').status_code == 400
    assert auth.post('/api/v1/sales/orders/', {**base, 'code': 'HD-N2',
        'lines': [{'description': 'x', 'qty': 5, 'unit_price': -10000}]}, format='json').status_code == 400
    assert auth.post('/api/v1/sales/orders/', {**base, 'code': 'HD-N3',
        'lines': [{'description': 'x', 'qty': 5, 'unit_price': 10000, 'discount_pct': 150}]}, format='json').status_code == 400


@pytest.mark.django_db
def test_sign_ship_flow(auth, sale):
    cust = CustomerFactory(owner=sale)
    r = auth.post('/api/v1/sales/orders/', {
        'code': 'HD-0002', 'customer': str(cust.id), 'issued_date': '2026-06-01',
        'lines': [{'description': 'X', 'qty': 1, 'unit_price': 1000000}],
    }, format='json')
    oid = r.data['id']
    assert auth.post(f'/api/v1/sales/orders/{oid}/ship/').status_code == 409  # chưa active
    assert auth.post(f'/api/v1/sales/orders/{oid}/sign/').status_code == 200
    assert auth.post(f'/api/v1/sales/orders/{oid}/ship/').status_code == 200


@pytest.mark.django_db
def test_payment_reduces_debt(sale):
    cust = CustomerFactory(owner=sale)
    order = SalesOrder.objects.create(code='HD-0003', customer=cust, issued_date=dt.date(2026, 6, 1),
                                      total_vnd=1000000, owner=sale)
    services.record_payment(order, amount=600000, paid_at=dt.date(2026, 6, 2),
                            method='transfer', user=sale)
    order.refresh_from_db()
    assert order.paid_vnd == 600000
    assert order.debt_amount == 400000


@pytest.mark.django_db
def test_payment_cannot_exceed_total(sale):
    cust = CustomerFactory(owner=sale)
    order = SalesOrder.objects.create(code='HD-0004', customer=cust, issued_date=dt.date(2026, 6, 1),
                                      total_vnd=500000, owner=sale)
    with pytest.raises(ValueError):
        services.record_payment(order, amount=600000, paid_at=dt.date(2026, 6, 2),
                                method='cash', user=sale)


@pytest.mark.django_db
def test_customer_role_blocked(db):
    cu = User.objects.create(username='kh1', role=Role.CUSTOMER)
    c = APIClient(); c.force_authenticate(cu)
    assert c.get('/api/v1/sales/orders/').status_code == 403


@pytest.mark.django_db
def test_payment_list_isolated_by_owner(db):
    """Bug bảo mật: PaymentViewSet trước đây dùng queryset tĩnh không lọc owner
    → sale bất kỳ xem/xuất được TOÀN BỘ phiếu thu của mọi khách. Sau fix: sale
    chỉ thấy phiếu thu của đơn mình sở hữu (gate qua sales.order.view_all)."""
    sale_a = UserFactory(role=Role.SALES)
    sale_b = UserFactory(role=Role.SALES)
    cust_a = CustomerFactory(owner=sale_a)
    cust_b = CustomerFactory(owner=sale_b)
    order_a = SalesOrder.objects.create(code='HD-PAY-A', customer=cust_a,
                                        issued_date=dt.date(2026, 6, 1), total_vnd=1_000_000, owner=sale_a)
    order_b = SalesOrder.objects.create(code='HD-PAY-B', customer=cust_b,
                                        issued_date=dt.date(2026, 6, 1), total_vnd=2_000_000, owner=sale_b)
    services.record_payment(order_a, amount=100_000, paid_at=dt.date(2026, 6, 2), method='cash', user=sale_a)
    services.record_payment(order_b, amount=200_000, paid_at=dt.date(2026, 6, 2), method='cash', user=sale_b)

    c = APIClient(); c.force_authenticate(sale_a)
    r = c.get('/api/v1/sales/payments/')
    assert r.status_code == 200
    codes = {p['order'] for p in r.data['results']} if 'results' in r.data else {p['order'] for p in r.data}
    assert order_a.id in codes
    assert order_b.id not in codes, 'RÒ RỈ: sale A thấy phiếu thu của sale B!'


@pytest.mark.django_db
def test_payment_export_misa_isolated_by_owner(db):
    """export-misa cũng phải lọc owner — trước đây xuất TOÀN BỘ phiếu thu
    (tên/MST/SĐT/địa chỉ mọi khách) cho bất kỳ sale nào."""
    sale_a = UserFactory(role=Role.SALES)
    sale_b = UserFactory(role=Role.SALES)
    cust_a = CustomerFactory(owner=sale_a)
    cust_b = CustomerFactory(owner=sale_b)
    order_a = SalesOrder.objects.create(code='HD-EXP-A', customer=cust_a,
                                        issued_date=dt.date(2026, 6, 1), total_vnd=1_000_000, owner=sale_a)
    order_b = SalesOrder.objects.create(code='HD-EXP-B', customer=cust_b,
                                        issued_date=dt.date(2026, 6, 1), total_vnd=2_000_000, owner=sale_b)
    services.record_payment(order_a, amount=100_000, paid_at=dt.date(2026, 6, 2), method='cash', user=sale_a)
    services.record_payment(order_b, amount=200_000, paid_at=dt.date(2026, 6, 2), method='cash', user=sale_b)

    c = APIClient(); c.force_authenticate(sale_a)
    r = c.get('/api/v1/sales/payments/export-misa/')
    assert r.status_code == 200
    body = b''.join(r.streaming_content) if hasattr(r, 'streaming_content') else r.content
    # File Excel chứa mã đơn ở dạng text — đơn của sale B tuyệt đối không được có mặt.
    assert b'HD-EXP-B' not in body, 'RÒ RỈ: export-misa của sale A chứa đơn của sale B!'


@pytest.mark.django_db
def test_payment_list_manager_sees_all(db):
    """Manager có sales.order.view_all=True → thấy phiếu thu của mọi sale."""
    mgr = User.objects.create(username='mgr_pay', role=Role.MANAGER)
    sale_a = UserFactory(role=Role.SALES)
    cust_a = CustomerFactory(owner=sale_a)
    order_a = SalesOrder.objects.create(code='HD-MGR-A', customer=cust_a,
                                        issued_date=dt.date(2026, 6, 1), total_vnd=1_000_000, owner=sale_a)
    services.record_payment(order_a, amount=100_000, paid_at=dt.date(2026, 6, 2), method='cash', user=sale_a)

    c = APIClient(); c.force_authenticate(mgr)
    r = c.get('/api/v1/sales/payments/')
    assert r.status_code == 200
    n = r.data['count'] if 'count' in r.data else len(r.data)
    assert n >= 1


@pytest.mark.django_db
def test_create_invoice_with_vat(db):
    from apps.accounts.models import Role as R, User as U
    from apps.sales.models import Invoice
    mgr = U.objects.create(username='mg', role=R.MANAGER)
    cust = CustomerFactory()
    order = SalesOrder.objects.create(code='HD-INV-1', customer=cust, issued_date=dt.date(2026, 6, 1),
                                      total_vnd=10_000_000, status='active', owner=mgr)
    c = APIClient(); c.force_authenticate(mgr)
    r = c.post(f'/api/v1/sales/orders/{order.id}/create-invoice/', {'tax_pct': 8}, format='json')
    assert r.status_code == 201
    assert int(r.data['tax_vnd']) == 800_000 and int(r.data['total_vnd']) == 10_800_000
    assert Invoice.objects.filter(order=order).exists()


@pytest.mark.django_db
def test_invoice_misa_export_and_sync(db):
    from apps.accounts.models import Role as R, User as U
    from apps.sales.models import Invoice
    mgr = U.objects.create(username='mg2', role=R.MANAGER)
    cust = CustomerFactory()
    order = SalesOrder.objects.create(code='HD-MISA-1', customer=cust, issued_date=dt.date(2026, 6, 1),
                                      total_vnd=2_000_000, status='active', owner=mgr)
    c = APIClient(); c.force_authenticate(mgr)
    inv = c.post(f'/api/v1/sales/orders/{order.id}/create-invoice/', {'tax_pct': 10}, format='json').data
    assert inv['misa_status'] == 'pending'
    # Export Excel cho MISA
    ex = c.get('/api/v1/sales/invoices/export-misa/')
    assert ex.status_code == 200 and 'spreadsheet' in ex['Content-Type']
    # Đánh dấu đã đồng bộ MISA
    r = c.post(f"/api/v1/sales/invoices/{inv['id']}/mark-synced/", {'misa_ref': 'HD0000123'}, format='json')
    assert r.data['misa_status'] == 'synced' and r.data['misa_ref'] == 'HD0000123'
    assert Invoice.objects.get(pk=inv['id']).synced_at is not None


@pytest.mark.django_db
def test_create_invoice_and_mark_synced_blocked_for_sales_role(db):
    """Đợt A (mục #1 biên bản): sale không có capability
    `sales.order.create_invoice`/`sales.invoice.mark_synced` (mặc định chỉ
    manager/CEO) — chuyển sang engine capability không đổi hành vi."""
    from apps.accounts.models import Role as R, User as U
    sale = U.objects.create(username='sl_inv', role=R.SALES)
    cust = CustomerFactory(owner=sale)
    order = SalesOrder.objects.create(code='HD-INV-BLOCK', customer=cust, issued_date=dt.date(2026, 6, 1),
                                      total_vnd=1_000_000, status='active', owner=sale)
    c = APIClient(); c.force_authenticate(sale)
    r = c.post(f'/api/v1/sales/orders/{order.id}/create-invoice/', {'tax_pct': 8}, format='json')
    assert r.status_code == 403

    from apps.sales.models import Invoice
    inv = Invoice.objects.create(code='INV-BLOCK-1', order=order, customer=cust,
                                 issue_date=dt.date(2026, 6, 1), subtotal_vnd=1_000_000,
                                 tax_pct=8, tax_vnd=80_000, total_vnd=1_080_000,
                                 created_by=sale, updated_by=sale)
    r = c.post(f'/api/v1/sales/invoices/{inv.id}/mark-synced/', {'misa_ref': 'X'}, format='json')
    assert r.status_code == 403


@pytest.mark.django_db
def test_rma_return_adds_stock(db):
    from apps.accounts.models import Role as R, User as U
    from apps.catalog.models import Part
    from apps.wms.models import Bin, InventoryItem, Warehouse, Zone
    mgr = U.objects.create(username='mg3', role=R.MANAGER)
    kho = U.objects.create(username='k3', role=R.WAREHOUSE)
    cust = CustomerFactory()
    part = Part.objects.create(tokin_part_no='RMA-P', category='Tip', display_name_vi='Bép')
    w = Warehouse.objects.create(code='HCM', name='K', is_active=True, is_default=True)
    z = Zone.objects.create(warehouse=w, code='MIG', name='MIG')
    Bin.objects.create(zone=z, rack='T1', bin_code='B01', full_code='HCM-MIG-T1-B01')
    mc = APIClient(); mc.force_authenticate(mgr)
    ro = mc.post('/api/v1/sales/returns/', {
        'customer': str(cust.id), 'warehouse': str(w.id), 'reason': 'Lỗi',
        'lines': [{'part': 'RMA-P', 'qty': 6, 'unit_price': 10000}],
    }, format='json')
    assert ro.status_code == 201 and int(ro.data['total_vnd']) == 60000
    # NV kho nhận lại → cộng tồn
    kc = APIClient(); kc.force_authenticate(kho)
    r = kc.post(f"/api/v1/sales/returns/{ro.data['id']}/receive/")
    assert r.status_code == 200 and r.data['status'] == 'received'
    assert InventoryItem.objects.get(part=part).qty_on_hand == 6


@pytest.mark.django_db
def test_payment_export_misa(sale):
    cust = CustomerFactory(owner=sale)
    order = SalesOrder.objects.create(code='HD-EXP-1', customer=cust, issued_date=dt.date(2026, 6, 1),
                                      total_vnd=1_000_000, owner=sale)
    services.record_payment(order, amount=400_000, paid_at=dt.date(2026, 6, 2), method='cash', user=sale)
    c = APIClient(); c.force_authenticate(sale)
    r = c.get('/api/v1/sales/payments/export-misa/')
    assert r.status_code == 200 and 'spreadsheet' in r['Content-Type']


@pytest.mark.django_db
def test_ceo_can_access_sales_and_wms(db):
    """CEO phải đọc được đơn bán + WMS (regression: role-set từng sót ceo)."""
    ceo = User.objects.create(username='ceo1', role=Role.CEO)
    c = APIClient(); c.force_authenticate(ceo)
    assert c.get('/api/v1/sales/orders/').status_code == 200
    assert c.get('/api/v1/wms/inventory/').status_code == 200


# ─── N1.2 ship → tự sinh WMS Outbound ────────────────────────────────────
@pytest.mark.django_db
def test_ship_creates_wms_outbound(auth, sale):
    from apps.catalog.models import Part
    from apps.wms.models import OutboundOrder, Warehouse
    Warehouse.objects.create(code='HCM', name='Kho HCM', is_active=True, is_default=True)
    Part.objects.create(tokin_part_no='P-001', category='tip', display_name_vi='Béc')
    cust = CustomerFactory(owner=sale)
    r = auth.post('/api/v1/sales/orders/', {
        'code': 'HD-OB-1', 'customer': str(cust.id), 'issued_date': '2026-06-01',
        'lines': [{'description': 'Béc', 'part': 'P-001', 'qty': 5, 'unit_price': 10000}],
    }, format='json')
    oid = r.data['id']
    auth.post(f'/api/v1/sales/orders/{oid}/sign/')
    rs = auth.post(f'/api/v1/sales/orders/{oid}/ship/')
    assert rs.status_code == 200
    ob = OutboundOrder.objects.get(sales_order_code='HD-OB-1')
    assert ob.customer_id == cust.id and ob.lines.count() == 1
    assert rs.data['outbound_code'] == ob.code
