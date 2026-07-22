"""Hợp đồng ĐÃ KÝ (Hiệu lực) → 'Tạo đơn' sinh SalesOrder thật, lấy dòng hàng từ báo
giá gốc. Vá lỗ hổng cũ: ký HĐ xong không có đường nào tạo đơn giao hàng tiếp theo."""
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User


@pytest.fixture
def sale():
    return User.objects.create(username='c2o_sale', role=Role.SALES)


@pytest.fixture
def manager():
    return User.objects.create(username='c2o_mgr', role=Role.MANAGER)


def _client(user):
    c = APIClient(); c.force_authenticate(user)
    return c


def _active_contract_from_quote(sale):
    """Báo giá đã duyệt → to-contract (tạo Contract) → duyệt + set ACTIVE thẳng
    (bỏ qua bước ký thủ công qua UI, chỉ cần đúng trạng thái cuối để test to-order)."""
    from apps.catalog.models import Part
    from apps.crm.models import Contract, ContractStatus, Customer, Quote, QuoteLine, QuoteStatus
    cust = Customer.objects.create(code='KH-C2O1', name='C2O Co', owner=sale)
    Part.objects.create(tokin_part_no='C2O-P1', category='Tip', display_name_vi='Bep C2O', price_vnd=20000)
    quote = Quote.objects.create(code='BG-C2O1', customer=cust, owner=sale, status=QuoteStatus.APPROVED)
    QuoteLine.objects.create(quote=quote, part_no='C2O-P1', part_name='Bep C2O', qty=3, unit_price_vnd=20000)

    c = _client(sale)
    r = c.post(f'/api/v1/crm/quotes/{quote.id}/to-contract/')
    assert r.status_code == 200, r.data
    ct = Contract.objects.get(code=r.data['contract_order_code'])
    ct.status = ContractStatus.ACTIVE
    ct.save(update_fields=['status'])
    return ct, cust


@pytest.mark.django_db
def test_active_contract_to_order_creates_real_order_with_lines(sale):
    ct, cust = _active_contract_from_quote(sale)
    c = _client(sale)
    r = c.post(f'/api/v1/crm/contracts/{ct.id}/to-order/')
    assert r.status_code == 200, r.data

    from apps.sales.models import SalesOrder
    order = SalesOrder.objects.get(pk=r.data['order_id'])
    assert order.code == r.data['order_code']
    assert order.contract_id == ct.id            # liên kết ngược HĐ ↔ Đơn
    assert order.customer_id == cust.id
    assert order.status == 'draft'
    line = order.lines.get()
    assert line.part_id == 'C2O-P1' and line.qty == 3
    assert int(order.total_vnd) == 60000          # 3 × 20.000


@pytest.mark.django_db
def test_contract_can_spawn_multiple_orders_over_time(sale):
    """Hợp đồng khung: KHÔNG khoá 1-1 như Quote — gọi to-order nhiều lần (nhiều đợt
    giao) đều tạo đơn mới, không bị chặn như lỗi cũ của Quote.to-order."""
    ct, _ = _active_contract_from_quote(sale)
    c = _client(sale)
    r1 = c.post(f'/api/v1/crm/contracts/{ct.id}/to-order/')
    r2 = c.post(f'/api/v1/crm/contracts/{ct.id}/to-order/')
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.data['order_code'] != r2.data['order_code']

    from apps.sales.models import SalesOrder
    assert SalesOrder.objects.filter(contract=ct).count() == 2


@pytest.mark.django_db
def test_to_order_blocked_when_contract_not_active(sale):
    """HĐ chưa ký (còn draft/pending) → chặn, không tạo đơn."""
    from apps.catalog.models import Part
    from apps.crm.models import Contract, Customer
    cust = Customer.objects.create(code='KH-C2O2', name='C2O Co2', owner=sale)
    ct = Contract.objects.create(code='HD-C2O2', customer=cust, owner=sale)  # status mặc định = draft
    c = _client(sale)
    r = c.post(f'/api/v1/crm/contracts/{ct.id}/to-order/')
    assert r.status_code == 400


@pytest.mark.django_db
def test_to_order_blocked_when_no_quote(sale):
    """HĐ tạo tay (không qua báo giá) → không có nguồn dòng hàng → chặn rõ ràng,
    không tạo đơn RỖNG âm thầm."""
    from apps.crm.models import Contract, ContractStatus, Customer
    cust = Customer.objects.create(code='KH-C2O3', name='C2O Co3', owner=sale)
    ct = Contract.objects.create(code='HD-C2O3', customer=cust, owner=sale,
                                 status=ContractStatus.ACTIVE)
    c = _client(sale)
    r = c.post(f'/api/v1/crm/contracts/{ct.id}/to-order/')
    assert r.status_code == 400 and r.data.get('code') == 'NO_QUOTE'

    from apps.sales.models import SalesOrder
    assert SalesOrder.objects.filter(contract=ct).count() == 0
