"""
Tokinarc V6.C-fix2 — apps/catalog/tests/test_catalog_api.py

Test 3 endpoint read-only quan trọng cho chatbot tool_clients:
  GET /api/v1/catalog/parts/search/
  GET /api/v1/catalog/parts/{tokin_part_no}/
  GET /api/v1/catalog/torches/{model_code}/

Đảm bảo response shape khớp với cách chatbot tool_clients gọi
(xem chatbot/tool_clients.py: search_parts, get_part, get_torch).
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.catalog.models import Part, Torch


@pytest.fixture
def parts(db):
    Part.objects.create(
        tokin_part_no='001005', category='nozzle', ecosystem='P',
        current_class='350A', display_name_vi='Chụp khí 350A',
        display_name_en='Nozzle 350A', price_vnd=150000,
        p_part_nos=['P-NZ-350'], d_part_nos=['D-NZ-350'],
        is_priority_sell=True,
    )
    Part.objects.create(
        tokin_part_no='002010', category='tip', ecosystem='P',
        current_class='350A', display_name_vi='Bép hàn 1.2mm',
        display_name_en='Contact tip 1.2mm', price_vnd=12000,
        is_contact_price=False,
    )
    Part.objects.create(
        tokin_part_no='003020', category='liner', ecosystem='D',
        current_class='500A', display_name_vi='Ống dẫn dây 5m',
        display_name_en='Liner 5m', is_contact_price=True,
    )
    return Part.objects.all()


@pytest.fixture
def torches(db):
    Torch.objects.create(
        model_code='RR-350A-W', display_name_vi='Súng hàn RR 350A nước',
        display_name_en='Welding torch RR 350A water-cooled',
        family='RR', ecosystem='P', current_class='350A', cooling='water',
        rated_dc_a=350, duty_cycle_pct=100, price_vnd=8500000,
        is_priority_sell=True,
    )
    Torch.objects.create(
        model_code='MAH-500A-A', display_name_vi='Súng hàn MAH 500A khí',
        family='MAH', ecosystem='P', current_class='500A', cooling='air',
        rated_dc_a=500, duty_cycle_pct=60, price_vnd=12000000,
    )
    return Torch.objects.all()


# ─── Part endpoints ──────────────────────────────────────────────────────────
@pytest.mark.django_db
def test_part_list_works(parts):
    c = APIClient()
    r = c.get('/api/v1/catalog/parts/')
    assert r.status_code == 200
    assert r.data['count'] == 3


@pytest.mark.django_db
def test_part_retrieve_by_part_no(parts):
    c = APIClient()
    r = c.get('/api/v1/catalog/parts/001005/')
    assert r.status_code == 200
    assert r.data['tokin_part_no'] == '001005'
    assert r.data['display_name_vi'] == 'Chụp khí 350A'
    assert r.data['effective_price_vnd'] == 150000
    assert '150.000 ₫' in r.data['price_display']


@pytest.mark.django_db
def test_part_retrieve_404(parts):
    c = APIClient()
    r = c.get('/api/v1/catalog/parts/NOT-EXIST/')
    assert r.status_code == 404


@pytest.mark.django_db
def test_part_search_by_name(parts):
    c = APIClient()
    r = c.get('/api/v1/catalog/parts/search/?q=chụp khí')
    assert r.status_code == 200
    assert r.data['count'] == 1
    assert r.data['results'][0]['tokin_part_no'] == '001005'


@pytest.mark.django_db
def test_part_search_by_part_no(parts):
    c = APIClient()
    r = c.get('/api/v1/catalog/parts/search/?q=002')
    assert r.status_code == 200
    assert r.data['count'] == 1
    assert r.data['results'][0]['tokin_part_no'] == '002010'


@pytest.mark.django_db
def test_part_search_by_alias(parts):
    """OEM/dealer part_no aliases — bot khách dùng nhiều."""
    c = APIClient()
    r = c.get('/api/v1/catalog/parts/search/?q=P-NZ-350')
    assert r.status_code == 200
    assert r.data['count'] == 1
    assert r.data['results'][0]['tokin_part_no'] == '001005'


@pytest.mark.django_db
def test_part_search_too_short(parts):
    c = APIClient()
    r = c.get('/api/v1/catalog/parts/search/?q=x')
    assert r.status_code == 200
    assert r.data['count'] == 0


@pytest.mark.django_db
def test_part_search_filter_ecosystem(parts):
    c = APIClient()
    r = c.get('/api/v1/catalog/parts/search/?q=00&ecosystem=D')
    assert r.status_code == 200
    assert r.data['count'] == 1
    assert r.data['results'][0]['ecosystem'] == 'D'


@pytest.mark.django_db
def test_part_contact_price_display(parts):
    """Part với is_contact_price=True → 'Liên hệ', không show số."""
    c = APIClient()
    r = c.get('/api/v1/catalog/parts/003020/')
    assert r.status_code == 200
    assert r.data['is_contact_price'] is True
    assert r.data['price_display'] == 'Liên hệ'


# ─── Torch endpoints ─────────────────────────────────────────────────────────
@pytest.mark.django_db
def test_torch_list_works(torches):
    c = APIClient()
    r = c.get('/api/v1/catalog/torches/')
    assert r.status_code == 200
    assert r.data['count'] == 2


@pytest.mark.django_db
def test_torch_retrieve_by_model_code(torches):
    c = APIClient()
    r = c.get('/api/v1/catalog/torches/RR-350A-W/')
    assert r.status_code == 200
    assert r.data['model_code'] == 'RR-350A-W'
    assert r.data['family'] == 'RR'
    assert r.data['cooling'] == 'water'
    assert r.data['effective_price_vnd'] == 8500000


@pytest.mark.django_db
def test_torch_search(torches):
    c = APIClient()
    r = c.get('/api/v1/catalog/torches/search/?q=MAH')
    assert r.status_code == 200
    assert r.data['count'] == 1
    assert r.data['results'][0]['model_code'] == 'MAH-500A-A'


@pytest.mark.django_db
def test_torch_search_filter_ecosystem(torches):
    c = APIClient()
    r = c.get('/api/v1/catalog/torches/search/?q=súng&ecosystem=P')
    assert r.status_code == 200
    assert r.data['count'] == 2


@pytest.mark.django_db
def test_endpoints_are_public(parts, torches):
    """Catalog là public — khách Zalo tra cứu được, không cần JWT."""
    c = APIClient()   # không authenticate
    assert c.get('/api/v1/catalog/parts/').status_code == 200
    assert c.get('/api/v1/catalog/parts/001005/').status_code == 200
    assert c.get('/api/v1/catalog/parts/search/?q=chụp').status_code == 200
    assert c.get('/api/v1/catalog/torches/').status_code == 200
    assert c.get('/api/v1/catalog/torches/RR-350A-W/').status_code == 200


# ─── Bảo mật: giá vốn (cost_vnd) KHÔNG được lộ qua API công khai ─────────────
@pytest.mark.django_db
def test_part_detail_never_leaks_cost_vnd(db):
    """Bug bảo mật: catalog là public (AllowAny) — detail dùng fields='__all__'
    từng để lộ cost_vnd (giá vốn NHẠY CẢM). Giá vốn chỉ được xem qua action
    /cost/ có gate manager+. Detail công khai TUYỆT ĐỐI không được chứa nó."""
    Part.objects.create(tokin_part_no='009999', category='tip', ecosystem='P',
                        display_name_vi='Bép test', price_vnd=50000, cost_vnd=32000)
    c = APIClient()   # không đăng nhập — mô phỏng khách/ẩn danh
    r = c.get('/api/v1/catalog/parts/009999/')
    assert r.status_code == 200
    assert 'cost_vnd' not in r.data, 'RÒ RỈ GIÁ VỐN: cost_vnd xuất hiện trong API công khai!'
    assert int(r.data['price_vnd']) == 50000   # giá bán vẫn hiển thị bình thường


@pytest.mark.django_db
def test_torch_detail_never_leaks_cost_vnd(db):
    Torch.objects.create(model_code='TEST-COST', display_name_vi='Súng test',
                         family='RR', ecosystem='P', price_vnd=9000000, cost_vnd=6000000)
    c = APIClient()
    r = c.get('/api/v1/catalog/torches/TEST-COST/')
    assert r.status_code == 200
    assert 'cost_vnd' not in r.data, 'RÒ RỈ GIÁ VỐN: cost_vnd xuất hiện trong API công khai!'


@pytest.mark.django_db
def test_cost_action_still_gated_for_anonymous(parts):
    """Action /cost/ vẫn phải chặn người chưa đăng nhập (401/403)."""
    c = APIClient()
    r = c.get('/api/v1/catalog/parts/001005/cost/')
    assert r.status_code in (401, 403)
