"""Test import Excel/CSV Nhà cung cấp (Supplier)."""
from __future__ import annotations

import io

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.purchasing.models import Supplier


def _csv(text: str):
    f = io.BytesIO(text.encode('utf-8'))
    f.name = 'ncc.csv'
    return f


@pytest.fixture
def wh_mgr(db):
    return User.objects.create(username='sup_whm', role=Role.WAREHOUSE_MANAGER)


@pytest.fixture
def nv_kho(db):
    return User.objects.create(username='sup_kho', role=Role.WAREHOUSE)


@pytest.mark.django_db
def test_import_creates_and_autocodes(wh_mgr):
    csv = ('name,tax_code,phone\n'
           'Cong ty A,0312345678,0901\n'
           'Cong ty B,,0902\n')
    c = APIClient(); c.force_authenticate(wh_mgr)
    r = c.post('/api/v1/purchasing/suppliers/import/', {'file': _csv(csv)}, format='multipart')
    assert r.status_code == 200, r.data
    assert r.data['created'] == 2
    assert Supplier.objects.count() == 2
    # Thiếu code → tự sinh NCC-XXXX.
    assert Supplier.objects.filter(code__startswith='NCC-').count() == 2


@pytest.mark.django_db
def test_import_updates_by_tax_code(wh_mgr):
    Supplier.objects.create(code='NCC-9001', name='Ten cu', tax_code='0312345678')
    csv = 'name,tax_code,phone\nTen moi,0312345678,0999\n'
    c = APIClient(); c.force_authenticate(wh_mgr)
    r = c.post('/api/v1/purchasing/suppliers/import/', {'file': _csv(csv)}, format='multipart')
    assert r.status_code == 200 and r.data['updated'] == 1
    assert Supplier.objects.count() == 1                       # không tạo trùng
    s = Supplier.objects.get(code='NCC-9001')
    assert s.name == 'Ten moi' and s.phone == '0999'


@pytest.mark.django_db
def test_import_blocked_for_warehouse_staff(nv_kho):
    """NV kho thường KHÔNG được import NCC (chỉ QL kho trở lên)."""
    c = APIClient(); c.force_authenticate(nv_kho)
    r = c.post('/api/v1/purchasing/suppliers/import/',
               {'file': _csv('name\nCong ty X\n')}, format='multipart')
    assert r.status_code == 403
    assert Supplier.objects.count() == 0


@pytest.mark.django_db
def test_import_dry_run_does_not_write(wh_mgr):
    c = APIClient(); c.force_authenticate(wh_mgr)
    r = c.post('/api/v1/purchasing/suppliers/import/',
               {'file': _csv('name\nCong ty Dry\n'), 'dry_run': '1'}, format='multipart')
    assert r.status_code == 200 and r.data['dry_run'] is True
    assert r.data['will_create'] == 1
    assert Supplier.objects.count() == 0                       # dry-run không ghi


@pytest.mark.django_db
def test_import_row_missing_name_is_error(wh_mgr):
    c = APIClient(); c.force_authenticate(wh_mgr)
    r = c.post('/api/v1/purchasing/suppliers/import/',
               {'file': _csv('name,tax_code\n,0312345678\n')}, format='multipart')
    assert r.status_code == 200
    assert len(r.data['errors']) == 1
    assert Supplier.objects.count() == 0
