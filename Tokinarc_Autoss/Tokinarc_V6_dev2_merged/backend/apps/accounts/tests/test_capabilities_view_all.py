"""
Đợt B (mục #1 biên bản, 2026-07-21) — phạm vi nhìn dữ liệu (view_all) chuyển
sang engine capability. Xác nhận KHÔNG đổi hành vi so với is_manager() cũ:
sale không có capability chỉ thấy bản ghi của mình; role có capability thấy hết.
`has_capability()` khớp seed đã được test chung ở test_capabilities.py — ở đây
chỉ verify wiring thực tế qua API list.
"""
from __future__ import annotations

import datetime as dt

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.crm.models import (
    Activity, Contract, Customer, Lead, Opportunity, Quote, Ticket, Visit,
)


@pytest.fixture
def sale(db):
    return User.objects.create(username='vb_sale', role=Role.SALES)


@pytest.fixture
def other_sale(db):
    return User.objects.create(username='vb_sale2', role=Role.SALES)


@pytest.fixture
def manager(db):
    return User.objects.create(username='vb_mgr', role=Role.MANAGER)


def _api(user):
    c = APIClient(); c.force_authenticate(user)
    return c


@pytest.mark.django_db
def test_customer_view_all(sale, other_sale, manager):
    Customer.objects.create(code='KH-VB1', name='A', owner=sale)
    Customer.objects.create(code='KH-VB2', name='B', owner=other_sale)
    r = _api(sale).get('/api/v1/crm/customers/')
    assert {c['code'] for c in r.data['results']} == {'KH-VB1'}
    r = _api(manager).get('/api/v1/crm/customers/')
    assert {'KH-VB1', 'KH-VB2'} <= {c['code'] for c in r.data['results']}


@pytest.mark.django_db
def test_lead_view_all(sale, other_sale, manager):
    Lead.objects.create(name='L1', owner=sale)
    Lead.objects.create(name='L2', owner=other_sale)
    r = _api(sale).get('/api/v1/crm/leads/')
    assert len(r.data['results']) == 1
    r = _api(manager).get('/api/v1/crm/leads/')
    assert len(r.data['results']) == 2


@pytest.mark.django_db
def test_opportunity_view_all(sale, other_sale, manager):
    cust = Customer.objects.create(code='KH-VBO', name='O', owner=sale)
    Opportunity.objects.create(customer=cust, title='CH1', owner=sale)
    Opportunity.objects.create(customer=cust, title='CH2', owner=other_sale)
    r = _api(sale).get('/api/v1/crm/opportunities/')
    assert len(r.data['results']) == 1
    r = _api(manager).get('/api/v1/crm/opportunities/')
    assert len(r.data['results']) == 2


@pytest.mark.django_db
def test_quote_view_all(sale, other_sale, manager):
    cust = Customer.objects.create(code='KH-VBQ', name='Q', owner=sale)
    Quote.objects.create(code='BG-VB1', customer=cust, owner=sale)
    Quote.objects.create(code='BG-VB2', customer=cust, owner=other_sale)
    r = _api(sale).get('/api/v1/crm/quotes/')
    assert len(r.data['results']) == 1
    r = _api(manager).get('/api/v1/crm/quotes/')
    assert len(r.data['results']) == 2


@pytest.mark.django_db
def test_visit_view_all(sale, other_sale, manager):
    cust = Customer.objects.create(code='KH-VBV', name='V', owner=sale)
    Visit.objects.create(customer=cust, visit_date=dt.date(2026, 6, 1), purpose='p1', owner=sale)
    Visit.objects.create(customer=cust, visit_date=dt.date(2026, 6, 2), purpose='p2', owner=other_sale)
    r = _api(sale).get('/api/v1/crm/visits/')
    assert len(r.data['results']) == 1
    r = _api(manager).get('/api/v1/crm/visits/')
    assert len(r.data['results']) == 2


@pytest.mark.django_db
def test_contract_view_all(sale, other_sale, manager):
    cust1 = Customer.objects.create(code='KH-VBC1', name='C1', owner=sale)
    cust2 = Customer.objects.create(code='KH-VBC2', name='C2', owner=other_sale)
    Contract.objects.create(code='HD-VB1', customer=cust1, owner=sale)
    Contract.objects.create(code='HD-VB2', customer=cust2, owner=other_sale)
    r = _api(sale).get('/api/v1/crm/contracts/')
    assert len(r.data['results']) == 1
    r = _api(manager).get('/api/v1/crm/contracts/')
    assert len(r.data['results']) == 2


@pytest.mark.django_db
def test_activity_view_all(sale, other_sale, manager):
    cust1 = Customer.objects.create(code='KH-VBA1', name='A1', owner=sale)
    cust2 = Customer.objects.create(code='KH-VBA2', name='A2', owner=other_sale)
    Activity.objects.create(customer=cust1, activity_type='call', content='c1', owner=sale)
    Activity.objects.create(customer=cust2, activity_type='call', content='c2', owner=other_sale)
    r = _api(sale).get('/api/v1/crm/activities/')
    assert len(r.data['results']) == 1
    r = _api(manager).get('/api/v1/crm/activities/')
    assert len(r.data['results']) == 2


@pytest.mark.django_db
def test_ticket_view_all_includes_service_role(sale, other_sale, manager):
    service = User.objects.create(username='vb_service', role=Role.SERVICE)
    cust1 = Customer.objects.create(code='KH-VBT1', name='T1', owner=sale)
    cust2 = Customer.objects.create(code='KH-VBT2', name='T2', owner=other_sale)
    Ticket.objects.create(code='TK-VB1', customer=cust1, title='t1', created_owner=sale)
    Ticket.objects.create(code='TK-VB2', customer=cust2, title='t2', created_owner=other_sale)
    r = _api(sale).get('/api/v1/crm/tickets/')
    assert len(r.data['results']) == 1
    r = _api(manager).get('/api/v1/crm/tickets/')
    assert len(r.data['results']) == 2
    r = _api(service).get('/api/v1/crm/tickets/')
    assert len(r.data['results']) == 2


@pytest.mark.django_db
def test_sales_order_and_invoice_view_all(sale, other_sale, manager):
    from apps.sales.models import Invoice, SalesOrder
    cust = Customer.objects.create(code='KH-VBS', name='S', owner=sale)
    o1 = SalesOrder.objects.create(code='HD-VB1', customer=cust, issued_date=dt.date(2026, 6, 1),
                                   total_vnd=100, status='active', owner=sale)
    o2 = SalesOrder.objects.create(code='HD-VB2', customer=cust, issued_date=dt.date(2026, 6, 1),
                                   total_vnd=100, status='active', owner=other_sale)
    r = _api(sale).get('/api/v1/sales/orders/')
    assert len(r.data['results']) == 1
    r = _api(manager).get('/api/v1/sales/orders/')
    assert len(r.data['results']) == 2

    Invoice.objects.create(code='INV-VB1', order=o1, customer=cust, issue_date=dt.date(2026, 6, 1),
                           subtotal_vnd=100, tax_pct=8, tax_vnd=8, total_vnd=108,
                           created_by=sale, updated_by=sale)
    Invoice.objects.create(code='INV-VB2', order=o2, customer=cust, issue_date=dt.date(2026, 6, 1),
                           subtotal_vnd=100, tax_pct=8, tax_vnd=8, total_vnd=108,
                           created_by=other_sale, updated_by=other_sale)
    r = _api(sale).get('/api/v1/sales/invoices/')
    assert len(r.data['results']) == 1
    r = _api(manager).get('/api/v1/sales/invoices/')
    assert len(r.data['results']) == 2


@pytest.mark.django_db
def test_return_order_view_all_includes_warehouse_role(sale, other_sale, manager):
    from apps.sales.models import ReturnOrder
    from apps.wms.models import Warehouse
    warehouse_user = User.objects.create(username='vb_wh', role=Role.WAREHOUSE)
    wh = Warehouse.objects.create(code='VB-WH', name='Kho VB', is_active=True, is_default=True)
    cust = Customer.objects.create(code='KH-VBR', name='R', owner=sale)
    ReturnOrder.objects.create(code='RMA-VB1', customer=cust, warehouse=wh, owner=sale)
    ReturnOrder.objects.create(code='RMA-VB2', customer=cust, warehouse=wh, owner=other_sale)
    r = _api(sale).get('/api/v1/sales/returns/')
    assert len(r.data['results']) == 1
    r = _api(manager).get('/api/v1/sales/returns/')
    assert len(r.data['results']) == 2
    r = _api(warehouse_user).get('/api/v1/sales/returns/')
    assert len(r.data['results']) == 2
