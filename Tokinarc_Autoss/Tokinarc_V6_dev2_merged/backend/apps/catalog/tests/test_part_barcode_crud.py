"""
Quản lý danh sách mã vạch/QR đã gán (2026-07-29) — trang "Gán mã vạch/QR" >
tab "Danh sách đã gán": thêm/sửa/xóa (khác action set-barcode chỉ tạo).
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.catalog.models import Part, PartBarcode


@pytest.fixture
def wh_user(db):
    return User.objects.create(username='wh_pb', role=Role.WAREHOUSE)


@pytest.fixture
def wh_mgr(db):
    return User.objects.create(username='mgr_pb', role=Role.WAREHOUSE_MANAGER)


@pytest.fixture
def customer_user(db):
    return User.objects.create(username='cust_pb', role=Role.CUSTOMER)


@pytest.fixture
def part(db):
    return Part.objects.create(tokin_part_no='PB-001', category='Tip', display_name_vi='Test PB')


@pytest.fixture
def part2(db):
    return Part.objects.create(tokin_part_no='PB-002', category='Tip', display_name_vi='Test PB 2')


@pytest.mark.django_db
def test_warehouse_can_create_but_not_edit_or_delete(wh_user, part, part2):
    c = APIClient(); c.force_authenticate(wh_user)
    r = c.post('/api/v1/catalog/part-barcodes/', {'part': part.pk, 'code': 'PBC-1'}, format='json')
    assert r.status_code == 201, r.data
    pb_id = r.data['id']

    assert c.patch(f'/api/v1/catalog/part-barcodes/{pb_id}/', {'part': part2.pk}, format='json').status_code == 403
    assert c.delete(f'/api/v1/catalog/part-barcodes/{pb_id}/').status_code == 403


@pytest.mark.django_db
def test_manager_can_edit_and_delete(wh_mgr, part, part2):
    pb = PartBarcode.objects.create(part=part, code='PBC-2')
    c = APIClient(); c.force_authenticate(wh_mgr)
    r = c.patch(f'/api/v1/catalog/part-barcodes/{pb.id}/', {'part': part2.pk}, format='json')
    assert r.status_code == 200, r.data
    pb.refresh_from_db()
    assert pb.part_id == part2.pk

    assert c.delete(f'/api/v1/catalog/part-barcodes/{pb.id}/').status_code == 204
    assert not PartBarcode.objects.filter(pk=pb.id).exists()


@pytest.mark.django_db
def test_duplicate_code_rejected_on_create_and_update(wh_mgr, part, part2):
    PartBarcode.objects.create(part=part, code='DUP')
    c = APIClient(); c.force_authenticate(wh_mgr)
    r = c.post('/api/v1/catalog/part-barcodes/', {'part': part2.pk, 'code': 'DUP'}, format='json')
    assert r.status_code == 400

    other = PartBarcode.objects.create(part=part2, code='OTHER')
    r2 = c.patch(f'/api/v1/catalog/part-barcodes/{other.id}/', {'code': 'DUP'}, format='json')
    assert r2.status_code == 400


@pytest.mark.django_db
def test_customer_blocked_entirely(customer_user, part):
    PartBarcode.objects.create(part=part, code='CUST-BLOCK')
    c = APIClient(); c.force_authenticate(customer_user)
    assert c.get('/api/v1/catalog/part-barcodes/').status_code == 403


@pytest.mark.django_db
def test_search_by_code_or_part_name(wh_user, part):
    PartBarcode.objects.create(part=part, code='SEARCHABLE-123')
    c = APIClient(); c.force_authenticate(wh_user)
    r = c.get('/api/v1/catalog/part-barcodes/', {'search': 'SEARCHABLE-123'})
    assert r.data['count'] == 1
    r2 = c.get('/api/v1/catalog/part-barcodes/', {'search': 'Test PB'})
    assert r2.data['count'] == 1
