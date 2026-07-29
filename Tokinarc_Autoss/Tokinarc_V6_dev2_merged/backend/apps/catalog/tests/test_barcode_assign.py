"""
Gán mã vạch/QR cho Part (2026-07-29) — 1 part gán được NHIỀU mã (VD Barcode +
QR khác nội dung nhau trên cùng 1 hộp nhà sản xuất), khác với field đơn cũ chỉ
giữ được 1 mã (gán mã thứ 2 sẽ ghi đè mất mã thứ 1).
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.catalog.models import Part, PartBarcode


@pytest.fixture
def wh_user(db):
    return User.objects.create(username='wh_barcode', role=Role.WAREHOUSE)


@pytest.fixture
def part(db):
    return Part.objects.create(tokin_part_no='BC-001', category='Tip', display_name_vi='Test Barcode Part')


@pytest.fixture
def part2(db):
    return Part.objects.create(tokin_part_no='BC-002', category='Tip', display_name_vi='Part khác')


@pytest.mark.django_db
def test_assign_two_different_codes_to_same_part_both_resolve(wh_user, part):
    """Gán Barcode rồi gán tiếp QR (mã khác) cho CÙNG 1 part — cả 2 mã đều phải
    còn hoạt động, không mã nào bị ghi đè mất."""
    c = APIClient(); c.force_authenticate(wh_user)
    r1 = c.post(f'/api/v1/catalog/parts/{part.pk}/set-barcode/', {'barcode': '4560231260155'}, format='json')
    assert r1.status_code == 200, r1.data
    r2 = c.post(f'/api/v1/catalog/parts/{part.pk}/set-barcode/', {'barcode': 'QR-TKN-BC001-XYZ'}, format='json')
    assert r2.status_code == 200, r2.data

    assert set(PartBarcode.objects.filter(part=part).values_list('code', flat=True)) == \
        {'4560231260155', 'QR-TKN-BC001-XYZ'}
    # Cả 2 mã đều tìm ra đúng part qua search (barcodes__code).
    for code in ('4560231260155', 'QR-TKN-BC001-XYZ'):
        r = c.get('/api/v1/catalog/parts/', {'search': code})
        codes = [p['tokin_part_no'] for p in r.data['results']]
        assert part.pk in codes, f"mã {code} không tìm ra part"


@pytest.mark.django_db
def test_assign_barcode_already_taken_by_another_part_blocked(wh_user, part, part2):
    c = APIClient(); c.force_authenticate(wh_user)
    c.post(f'/api/v1/catalog/parts/{part.pk}/set-barcode/', {'barcode': 'DUP-CODE'}, format='json')
    r = c.post(f'/api/v1/catalog/parts/{part2.pk}/set-barcode/', {'barcode': 'DUP-CODE'}, format='json')
    assert r.status_code == 409
    assert r.data['code'] == 'BARCODE_TAKEN'


@pytest.mark.django_db
def test_reassign_same_code_to_same_part_is_idempotent(wh_user, part):
    """Gán lại đúng mã đã gán cho CHÍNH part đó (không đổi gì) không được báo lỗi trùng."""
    c = APIClient(); c.force_authenticate(wh_user)
    assert c.post(f'/api/v1/catalog/parts/{part.pk}/set-barcode/', {'barcode': 'SAME'}, format='json').status_code == 200
    r = c.post(f'/api/v1/catalog/parts/{part.pk}/set-barcode/', {'barcode': 'SAME'}, format='json')
    assert r.status_code == 200
    assert PartBarcode.objects.filter(part=part, code='SAME').count() == 1


@pytest.mark.django_db
def test_part_lite_serializer_exposes_barcodes_list(wh_user, part):
    PartBarcode.objects.create(part=part, code='A1')
    PartBarcode.objects.create(part=part, code='A2')
    c = APIClient(); c.force_authenticate(wh_user)
    r = c.get('/api/v1/catalog/parts/', {'search': part.pk})
    row = next(p for p in r.data['results'] if p['tokin_part_no'] == part.pk)
    assert set(row['barcodes']) == {'A1', 'A2'}
