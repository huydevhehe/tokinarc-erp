"""Báo giá → Đơn → Ship → Phiếu xuất TỰ SINH: phải mang đủ dòng PART + TORCH;
dòng không khớp catalog → không copy nhưng ghi rõ vào notes (không im lặng).
Bug gốc: to_order chỉ resolve Part, _create_outbound chỉ copy part → phiếu 0 dòng."""
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User


@pytest.fixture
def sale():
    return User.objects.create(username='ofo_sale', role=Role.SALES)


@pytest.fixture
def env(sale):
    from apps.catalog.models import Part, Torch
    from apps.crm.models import Customer
    from apps.wms.models import Warehouse
    cust = Customer.objects.create(code='KH-OFO1', name='OFO Co', owner=sale)
    Part.objects.create(tokin_part_no='OFO-P1', category='Tip',
                        display_name_vi='Bép OFO', price_vnd=100000)
    Torch.objects.create(model_code='OFO-T1', display_name_vi='Súng OFO')
    wh = Warehouse.objects.create(code='HCM', name='Kho', is_active=True, is_default=True)
    return cust, wh


@pytest.mark.django_db
def test_quote_to_order_to_outbound_full_chain(sale, env):
    from apps.sales.models import SalesOrder
    from apps.wms.models import OutboundOrder
    cust, wh = env
    c = APIClient(); c.force_authenticate(sale)

    # Báo giá 3 dòng: part + torch + mã lạ (CK 0% → tự duyệt)
    r = c.post('/api/v1/crm/quotes/', {
        'customer': str(cust.id),
        'lines': [
            {'part_no': 'OFO-P1',  'part_name': 'Bép OFO',  'qty': 2, 'unit_price_vnd': 100000},
            {'part_no': 'OFO-T1',  'part_name': 'Súng OFO', 'qty': 1, 'unit_price_vnd': 5000000},
            {'part_no': 'NOPE-99', 'part_name': 'Hàng lạ',  'qty': 3, 'unit_price_vnd': 1000},
        ]}, format='json')
    assert r.status_code == 201, r.data

    r = c.post(f"/api/v1/crm/quotes/{r.data['id']}/to-order/")
    assert r.status_code == 200, r.data
    order = SalesOrder.objects.get(code=r.data['order_code'])

    # to_order phải resolve CẢ torch (bug cũ: torch=None tuốt)
    l0, l1, l2 = list(order.lines.order_by('order_idx'))
    assert l0.part_id == 'OFO-P1' and l0.torch_id is None
    assert l1.torch_id == 'OFO-T1' and l1.part_id is None      # ← fix BE-1
    assert l2.part_id is None and l2.torch_id is None          # mã lạ: không FK

    # Ký + ship → phiếu xuất tự sinh
    assert c.post(f'/api/v1/sales/orders/{order.id}/sign/').status_code == 200
    r = c.post(f'/api/v1/sales/orders/{order.id}/ship/')
    assert r.status_code == 200, r.data

    ob = OutboundOrder.objects.get(sales_order_code=order.code)
    lines = list(ob.lines.order_by('order_idx'))
    assert len(lines) == 2                                      # ← fix BE-2 (bug cũ: 0-1 dòng)
    assert lines[0].part_id == 'OFO-P1' and lines[0].qty_ordered == 2
    assert lines[1].torch_id == 'OFO-T1' and lines[1].qty_ordered == 1
    # Dòng mã lạ: không copy nhưng KHÔNG im lặng — ghi rõ vào notes phiếu
    assert 'Hàng lạ' in ob.notes and '×3' in ob.notes


@pytest.mark.django_db
def test_outbound_all_lines_ok_no_note(sale, env):
    """Đơn toàn dòng hợp lệ → phiếu đủ dòng, notes sạch."""
    from apps.sales.models import SalesOrder
    from apps.wms.models import OutboundOrder
    cust, wh = env
    c = APIClient(); c.force_authenticate(sale)
    r = c.post('/api/v1/crm/quotes/', {
        'customer': str(cust.id),
        'lines': [{'part_no': 'OFO-P1', 'part_name': 'Bép OFO', 'qty': 5,
                   'unit_price_vnd': 100000}]}, format='json')
    r = c.post(f"/api/v1/crm/quotes/{r.data['id']}/to-order/")
    order = SalesOrder.objects.get(code=r.data['order_code'])
    c.post(f'/api/v1/sales/orders/{order.id}/sign/')
    c.post(f'/api/v1/sales/orders/{order.id}/ship/')
    ob = OutboundOrder.objects.get(sales_order_code=order.code)
    assert ob.lines.count() == 1 and not ob.notes
