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
def test_warehouse_staff_can_create_update_and_deactivate_part(nv_kho, db):
    """NV kho tự quản lý trọn vẹn Danh mục sản phẩm (2026-07-31 — trước đây
    chỉ tạo được, sửa/xóa phải chờ Quản lý kho; nới ra cho NV kho chủ động)."""
    c = APIClient(); c.force_authenticate(nv_kho)
    r = c.post('/api/v1/catalog/parts/', {
        'tokin_part_no': 'TST-002', 'category': 'Tip', 'display_name_vi': 'X',
    }, format='json')
    assert r.status_code == 201, r.data
    assert Part.objects.filter(pk='TST-002').exists()

    r = c.patch('/api/v1/catalog/parts/TST-002/', {'display_name_vi': 'Y'}, format='json')
    assert r.status_code == 200, r.data
    assert Part.objects.get(pk='TST-002').display_name_vi == 'Y'

    r = c.patch('/api/v1/catalog/parts/TST-002/', {'is_active': False}, format='json')
    assert r.status_code == 200, r.data
    assert Part.objects.filter(pk='TST-002', is_active=False).exists()

    anon = APIClient()
    r = anon.post('/api/v1/catalog/parts/', {
        'tokin_part_no': 'TST-003', 'category': 'Tip', 'display_name_vi': 'X',
    }, format='json')
    assert r.status_code in (401, 403)


@pytest.mark.django_db
def test_part_create_can_set_product_category(wh_mgr):
    """Thêm mặt hàng mới (kể cả từ modal thêm nhanh lúc lập phiếu nhập kho) phải
    gắn được Nhóm hàng (product_category) ngay lúc tạo — nếu không, hàng rơi
    vào "chưa phân loại" và không lọc được theo Nhóm hàng ở Tồn kho."""
    from apps.catalog.models import ProductCategory, ProductGroup
    group = ProductGroup.objects.create(name='Tokinarc')
    cat = ProductCategory.objects.create(group=group, name='Tip')
    c = APIClient(); c.force_authenticate(wh_mgr)
    r = c.post('/api/v1/catalog/parts/', {
        'tokin_part_no': 'TST-005', 'category': 'Tip', 'display_name_vi': 'Z',
        'product_category': cat.id,
    }, format='json')
    assert r.status_code == 201, r.data
    part = Part.objects.get(pk='TST-005')
    assert part.product_category_id == cat.id


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
def test_warehouse_staff_can_create_and_edit_torch(nv_kho):
    c = APIClient(); c.force_authenticate(nv_kho)
    r = c.post('/api/v1/catalog/torches/', {
        'model_code': 'TST-TORCH-02', 'display_name_vi': 'X',
    }, format='json')
    assert r.status_code == 201, r.data
    assert Torch.objects.filter(pk='TST-TORCH-02').exists()

    r = c.patch('/api/v1/catalog/torches/TST-TORCH-02/', {'display_name_vi': 'Y'}, format='json')
    assert r.status_code == 200, r.data
    assert Torch.objects.get(pk='TST-TORCH-02').display_name_vi == 'Y'


# ─── Nhóm hàng: gõ tên nhóm mới ngay tại form sản phẩm ────────────────────
@pytest.mark.parametrize('role', [Role.WAREHOUSE, Role.WAREHOUSE_MANAGER])
@pytest.mark.django_db
def test_edit_part_can_create_new_group_by_typing_name(role):
    """Sửa phụ tùng + gõ tên nhóm CHƯA CÓ → tự tạo Nhóm + Danh mục cùng tên rồi
    gắn vào. Trước đây serializer chỉ xử lý product_category_name lúc TẠO, nên ở
    màn Sửa thì tên nhóm mới bị bỏ qua im lặng (API vẫn trả 200)."""
    from apps.catalog.models import ProductCategory, ProductGroup
    part = Part.objects.create(tokin_part_no='GRP-1', category='Tip', display_name_vi='Hàng test')
    c = APIClient(); c.force_authenticate(_user(role))
    r = c.patch(f'/api/v1/catalog/parts/{part.pk}/',
                {'product_category': None, 'product_category_name': f'Nhóm mới {role}'}, format='json')
    assert r.status_code == 200
    part.refresh_from_db()
    assert part.product_category is not None, 'gõ tên nhóm mới khi SỬA mà không được gắn'
    assert part.product_category.name == f'Nhóm mới {role}'
    assert part.product_category.group.name == f'Nhóm mới {role}'
    assert ProductGroup.objects.filter(name=f'Nhóm mới {role}').count() == 1
    assert ProductCategory.objects.filter(name=f'Nhóm mới {role}').count() == 1


@pytest.mark.django_db
def test_edit_part_typing_existing_group_name_does_not_duplicate(nv_kho):
    """Gõ đúng tên nhóm ĐÃ CÓ → dùng lại nhóm cũ, không đẻ thêm nhóm trùng tên."""
    from apps.catalog.models import ProductCategory, ProductGroup
    g = ProductGroup.objects.create(name='Cáp kết nối')
    ProductCategory.objects.create(group=g, name='Cáp kết nối')
    part = Part.objects.create(tokin_part_no='GRP-2', category='Tip', display_name_vi='Hàng test 2')
    c = APIClient(); c.force_authenticate(nv_kho)
    r = c.patch(f'/api/v1/catalog/parts/{part.pk}/',
                {'product_category': None, 'product_category_name': 'Cáp kết nối'}, format='json')
    assert r.status_code == 200
    assert ProductGroup.objects.filter(name='Cáp kết nối').count() == 1
    part.refresh_from_db()
    assert part.product_category.group_id == g.id


@pytest.mark.django_db
def test_edit_part_can_clear_category(nv_kho):
    """Chọn "— Chưa phân loại —" → gỡ hẳn phân loại, không bị tên nhóm rỗng chen vào."""
    from apps.catalog.models import ProductCategory, ProductGroup
    g = ProductGroup.objects.create(name='Nhóm A')
    cat = ProductCategory.objects.create(group=g, name='Nhóm A')
    part = Part.objects.create(tokin_part_no='GRP-3', category='Tip',
                               display_name_vi='Hàng test 3', product_category=cat)
    c = APIClient(); c.force_authenticate(nv_kho)
    r = c.patch(f'/api/v1/catalog/parts/{part.pk}/',
                {'product_category': None, 'product_category_name': ''}, format='json')
    assert r.status_code == 200
    part.refresh_from_db()
    assert part.product_category is None
