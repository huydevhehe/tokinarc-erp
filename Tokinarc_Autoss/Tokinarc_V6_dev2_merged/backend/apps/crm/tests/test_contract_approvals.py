"""
Đợt A (mục #1 biên bản, 2026-07-21) — Hợp đồng: approve/approve-l2/reject
chuyển sang engine capability (crm.contract.approve/approve_l2/reject).
Trước đây chưa có test riêng cho các action này — bổ sung để xác nhận hành vi
KHÔNG đổi so với is_manager()/is_ceo() cũ.
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.crm.models import Contract, Customer


@pytest.fixture
def owner(db):
    return User.objects.create(username='ct_a_owner', role=Role.SALES)


@pytest.fixture
def manager(db):
    return User.objects.create(username='ct_a_mgr', role=Role.MANAGER)


@pytest.fixture
def ceo(db):
    return User.objects.create(username='ct_a_ceo', role=Role.CEO)


def _contract(owner, discount_pct=0, status='draft'):
    cust = Customer.objects.create(code=f'KH-CTA-{status}-{discount_pct}', name='Cty A', owner=owner)
    return Contract.objects.create(code=f'HD-A-{status}-{discount_pct}', customer=cust,
                                   owner=owner, discount_pct=discount_pct, status=status)


@pytest.mark.django_db
def test_sale_blocked_from_approve_and_reject(owner):
    c = _contract(owner)
    api = APIClient(); api.force_authenticate(owner)
    assert api.post(f'/api/v1/crm/contracts/{c.id}/approve/').status_code == 403
    assert api.post(f'/api/v1/crm/contracts/{c.id}/reject/').status_code == 403


@pytest.mark.django_db
def test_manager_approve_under_threshold_finalizes(owner, manager):
    c = _contract(owner, discount_pct=5)
    api = APIClient(); api.force_authenticate(manager)
    r = api.post(f'/api/v1/crm/contracts/{c.id}/approve/')
    assert r.status_code == 200
    assert r.data['status'] == 'pending_sign'


@pytest.mark.django_db
def test_manager_approve_over_threshold_routes_to_ceo_then_manager_cannot_l2(owner, manager):
    c = _contract(owner, discount_pct=15)
    api = APIClient(); api.force_authenticate(manager)
    r = api.post(f'/api/v1/crm/contracts/{c.id}/approve/')
    assert r.status_code == 200
    assert r.data['status'] == 'pending_ceo'
    # Manager không có capability approve_l2 (mặc định chỉ CEO).
    r2 = api.post(f'/api/v1/crm/contracts/{c.id}/approve-l2/')
    assert r2.status_code == 403


@pytest.mark.django_db
def test_ceo_approve_l2_finalizes(owner, manager, ceo):
    c = _contract(owner, discount_pct=15)
    mc = APIClient(); mc.force_authenticate(manager)
    mc.post(f'/api/v1/crm/contracts/{c.id}/approve/')
    cc = APIClient(); cc.force_authenticate(ceo)
    r = cc.post(f'/api/v1/crm/contracts/{c.id}/approve-l2/')
    assert r.status_code == 200
    assert r.data['status'] == 'pending_sign'


@pytest.mark.django_db
def test_manager_reject_with_reason(owner, manager):
    c = _contract(owner)
    api = APIClient(); api.force_authenticate(manager)
    r = api.post(f'/api/v1/crm/contracts/{c.id}/reject/', {'reason': 'giá không hợp lý'}, format='json')
    assert r.status_code == 200
    assert r.data['status'] == 'rejected'
