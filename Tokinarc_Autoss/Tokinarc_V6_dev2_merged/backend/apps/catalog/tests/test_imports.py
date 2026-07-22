"""
Tokinarc — apps/catalog/tests/test_imports.py

Test quyền cho PartImportView (mục #3 biên bản, 2026-07-22): trước đây chỉ
quản lý/CEO import được danh mục phụ tùng — không đúng ý biên bản "cho Sale
và Kho". Đã mở thêm cho NV kho/QL kho (Sale không liên quan tới danh mục Kho
nên KHÔNG mở cho Sale ở đây).
"""
from __future__ import annotations

import io

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User


def _csv(text: str):
    f = io.BytesIO(text.encode('utf-8'))
    f.name = 'parts.csv'
    return f


@pytest.fixture
def warehouse_user(db):
    return User.objects.create(username='imp_wh', role=Role.WAREHOUSE)


@pytest.fixture
def wh_manager(db):
    return User.objects.create(username='imp_whm', role=Role.WAREHOUSE_MANAGER)


@pytest.fixture
def manager(db):
    return User.objects.create(username='imp_mgr', role=Role.MANAGER)


@pytest.fixture
def sale(db):
    return User.objects.create(username='imp_sale', role=Role.SALES)


@pytest.mark.django_db
def test_part_import_allowed_for_warehouse_roles(warehouse_user, wh_manager, manager):
    csv = 'tokin_part_no,category,display_name_vi\nIMP-001,Tip,Bép test import\n'
    for user in (warehouse_user, wh_manager, manager):
        c = APIClient(); c.force_authenticate(user)
        r = c.post('/api/v1/catalog/parts/import/', {'file': _csv(csv), 'dry_run': '1'}, format='multipart')
        assert r.status_code == 200, f"role={user.role} bị chặn import (mong đợi 200)"


@pytest.mark.django_db
def test_part_import_blocked_for_sale(sale):
    """Sale không liên quan tới danh mục Kho — vẫn bị chặn (chỉ NV kho/QL kho/manager/CEO)."""
    c = APIClient(); c.force_authenticate(sale)
    r = c.post('/api/v1/catalog/parts/import/',
              {'file': _csv('tokin_part_no,category\nIMP-002,Tip\n')}, format='multipart')
    assert r.status_code == 403
