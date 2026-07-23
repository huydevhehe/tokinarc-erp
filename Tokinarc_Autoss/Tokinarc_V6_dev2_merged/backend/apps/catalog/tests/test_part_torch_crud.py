"""
Test CRUD Part/Torch qua UI (Sản phẩm > Phụ tùng / Súng hàn): tạo/sửa chỉ
Quản lý kho trở lên; "xóa" = is_active=False (không xóa cứng — nhiều bảng
PROTECT tới Part/Torch), ẩn khỏi list nhưng vẫn còn nguyên qua retrieve.
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.catalog.models import Part, Torch


def _user(role):
    return User.objects.create(username=f'u_{role}', role=role)


@pytest.fixture
def wh_mgr(db):
    return _user(Role.WAREHOUSE_MANAGER)


@pytest.fixture
def nv_kho(db):
    return _user(Role.WAREHOUSE)


# ─── Part ─────────────────────────────────────────────────────────────────
@pytest.mark.django_db
def test_wh_manager_can_create_update_deactivate_part(wh_mgr):
    c = APIClient(); c.force_authenticate(wh_mgr)
    r = c.post('/api/v1/catalog/parts/', {
        'tokin_part_no': 'TST-001', 'category': 'Tip',
        'display_name_vi': 'Béc hàn test', 'price_vnd': 15000, 'tax_pct': 8,
    }, format='json')
    assert r.status_code == 201, r.data
    assert Part.objects.filter(pk='TST-001').exists()

    r = c.patch('/api/v1/catalog/parts/TST-001/', {'price_vnd': 20000}, format='json')
    assert r.status_code == 200
    assert Part.objects.get(pk='TST-001').price_vnd == 20000

    # "Xóa" = PATCH is_active=false — ẩn khỏi list, KHÔNG xóa row.
    r = c.patch('/api/v1/catalog/parts/TST-001/', {'is_active': False}, format='json')
    assert r.status_code == 200
    codes = [p['tokin_part_no'] for p in c.get('/api/v1/catalog/parts/').data['results']]
    assert 'TST-001' not in codes
    assert Part.objects.filter(pk='TST-001', is_active=False).exists()   # vẫn còn trong DB


@pytest.mark.django_db
def test_warehouse_staff_and_anonymous_cannot_write_part(nv_kho, db):
    c = APIClient(); c.force_authenticate(nv_kho)
    r = c.post('/api/v1/catalog/parts/', {
        'tokin_part_no': 'TST-002', 'category': 'Tip', 'display_name_vi': 'X',
    }, format='json')
    assert r.status_code == 403

    anon = APIClient()
    r = anon.post('/api/v1/catalog/parts/', {
        'tokin_part_no': 'TST-003', 'category': 'Tip', 'display_name_vi': 'X',
    }, format='json')
    assert r.status_code in (401, 403)


@pytest.mark.django_db
def test_part_list_public_read_still_works_without_auth(db):
    """Đọc (list/detail) vẫn AllowAny — không đổi hành vi cũ (chatbot/trang tra cứu)."""
    Part.objects.create(tokin_part_no='TST-004', category='Tip', display_name_vi='Y')
    anon = APIClient()
    r = anon.get('/api/v1/catalog/parts/')
    assert r.status_code == 200
    assert 'TST-004' in [p['tokin_part_no'] for p in r.data['results']]


# ─── Torch ────────────────────────────────────────────────────────────────
@pytest.mark.django_db
def test_wh_manager_can_create_update_deactivate_torch(wh_mgr):
    c = APIClient(); c.force_authenticate(wh_mgr)
    r = c.post('/api/v1/catalog/torches/', {
        'model_code': 'TST-TORCH-01', 'display_name_vi': 'Súng hàn test',
        'family': 'A', 'cooling': 'air', 'rated_dc_a': 350, 'price_vnd': 3500000,
    }, format='json')
    assert r.status_code == 201, r.data
    assert Torch.objects.filter(pk='TST-TORCH-01').exists()

    r = c.patch('/api/v1/catalog/torches/TST-TORCH-01/', {'price_vnd': 3600000}, format='json')
    assert r.status_code == 200
    assert Torch.objects.get(pk='TST-TORCH-01').price_vnd == 3600000

    r = c.patch('/api/v1/catalog/torches/TST-TORCH-01/', {'is_active': False}, format='json')
    assert r.status_code == 200
    codes = [t['model_code'] for t in c.get('/api/v1/catalog/torches/').data['results']]
    assert 'TST-TORCH-01' not in codes
    assert Torch.objects.filter(pk='TST-TORCH-01', is_active=False).exists()


@pytest.mark.django_db
def test_warehouse_staff_cannot_write_torch(nv_kho):
    c = APIClient(); c.force_authenticate(nv_kho)
    r = c.post('/api/v1/catalog/torches/', {
        'model_code': 'TST-TORCH-02', 'display_name_vi': 'X',
    }, format='json')
    assert r.status_code == 403
