"""
Test tính năng Nhóm > Danh mục > Sản phẩm (phân cấp mềm do Quản lý kho quản lý).
Phủ: quyền ghi (chỉ wh_manager+), CRUD, chống xoá khi còn con, gắn/bỏ gắn SP.
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.catalog.models import Part, ProductCategory, ProductGroup


def _user(role):
    return User.objects.create(username=f'u_{role}', role=role)


@pytest.fixture
def wh_mgr(db):
    return _user(Role.WAREHOUSE_MANAGER)


@pytest.fixture
def nv_kho(db):
    return _user(Role.WAREHOUSE)


@pytest.mark.django_db
def test_wh_manager_full_crud_group_and_category(wh_mgr):
    c = APIClient(); c.force_authenticate(wh_mgr)
    # Tạo Nhóm
    r = c.post('/api/v1/catalog/product-groups/', {'name': 'Súng hàn MIG'}, format='json')
    assert r.status_code == 201, r.data
    gid = r.data['id']
    # Tạo Danh mục thuộc Nhóm
    r = c.post('/api/v1/catalog/product-categories/', {'group': gid, 'name': 'Béc hàn'}, format='json')
    assert r.status_code == 201, r.data
    cid = r.data['id']
    # Sửa tên Danh mục
    r = c.patch(f'/api/v1/catalog/product-categories/{cid}/', {'name': 'Béc hàn CO2'}, format='json')
    assert r.status_code == 200 and r.data['name'] == 'Béc hàn CO2'
    # Sửa tên Nhóm
    r = c.patch(f'/api/v1/catalog/product-groups/{gid}/', {'name': 'Súng MIG/MAG'}, format='json')
    assert r.status_code == 200 and r.data['name'] == 'Súng MIG/MAG'


@pytest.mark.django_db
def test_warehouse_staff_and_customer_cannot_write(nv_kho, db):
    """NV kho thường/khách KHÔNG được tạo Nhóm (chỉ Quản lý kho trở lên)."""
    c = APIClient(); c.force_authenticate(nv_kho)
    assert c.post('/api/v1/catalog/product-groups/', {'name': 'X'}, format='json').status_code == 403
    # đọc thì được (để hiển thị giao diện)
    assert c.get('/api/v1/catalog/product-groups/').status_code == 200

    cu = _user(Role.CUSTOMER)
    cc = APIClient(); cc.force_authenticate(cu)
    assert cc.get('/api/v1/catalog/product-groups/').status_code == 403


@pytest.mark.django_db
def test_delete_group_blocked_when_has_categories(wh_mgr):
    c = APIClient(); c.force_authenticate(wh_mgr)
    g = ProductGroup.objects.create(name='Nhóm A')
    ProductCategory.objects.create(group=g, name='DM 1')
    r = c.delete(f'/api/v1/catalog/product-groups/{g.id}/')
    assert r.status_code == 409
    assert ProductGroup.objects.filter(id=g.id).exists()   # vẫn còn


@pytest.mark.django_db
def test_delete_category_blocked_when_has_parts(wh_mgr):
    c = APIClient(); c.force_authenticate(wh_mgr)
    g = ProductGroup.objects.create(name='Nhóm B')
    cat = ProductCategory.objects.create(group=g, name='DM 2')
    Part.objects.create(tokin_part_no='PG-001', category='x', display_name_vi='SP test',
                        product_category=cat)
    r = c.delete(f'/api/v1/catalog/product-categories/{cat.id}/')
    assert r.status_code == 409
    assert ProductCategory.objects.filter(id=cat.id).exists()


@pytest.mark.django_db
def test_assign_and_unassign_parts(wh_mgr):
    c = APIClient(); c.force_authenticate(wh_mgr)
    g = ProductGroup.objects.create(name='Nhóm C')
    cat = ProductCategory.objects.create(group=g, name='DM 3')
    Part.objects.create(tokin_part_no='PG-010', category='x', display_name_vi='A')
    Part.objects.create(tokin_part_no='PG-011', category='x', display_name_vi='B')

    r = c.post(f'/api/v1/catalog/product-categories/{cat.id}/assign/',
               {'part_nos': ['PG-010', 'PG-011']}, format='json')
    assert r.status_code == 200 and r.data['assigned'] == 2
    assert Part.objects.filter(product_category=cat).count() == 2

    # Bỏ gắn 1 SP
    r = c.post('/api/v1/catalog/product-categories/unassign/',
               {'part_nos': ['PG-010']}, format='json')
    assert r.status_code == 200 and r.data['unassigned'] == 1
    assert Part.objects.get(tokin_part_no='PG-010').product_category_id is None
    assert Part.objects.get(tokin_part_no='PG-011').product_category_id == cat.id


@pytest.mark.django_db
def test_part_list_filter_by_category_and_group(wh_mgr):
    c = APIClient(); c.force_authenticate(wh_mgr)
    g = ProductGroup.objects.create(name='Nhóm D')
    cat = ProductCategory.objects.create(group=g, name='DM 4')
    Part.objects.create(tokin_part_no='PG-020', category='x', display_name_vi='A', product_category=cat)
    Part.objects.create(tokin_part_no='PG-021', category='x', display_name_vi='B')   # chưa gắn

    r = c.get(f'/api/v1/catalog/parts/?product_category={cat.id}')
    assert r.status_code == 200 and r.data['count'] == 1
    assert r.data['results'][0]['tokin_part_no'] == 'PG-020'
    assert r.data['results'][0]['group_name'] == 'Nhóm D'
    assert r.data['results'][0]['category_name'] == 'DM 4'

    r = c.get(f'/api/v1/catalog/parts/?product_category__group={g.id}')
    assert r.status_code == 200 and r.data['count'] == 1
