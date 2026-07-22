"""
Tokinarc V6 — apps/accounts/tests/test_capabilities.py

Giai đoạn 1 hệ thống phân quyền function-based:
  - has_capability() khớp đúng CAPABILITY_SEED cho mọi role (đặc tả seed).
  - API ma trận quyền (GET/PATCH) chỉ admin/CEO.
  - GET /accounts/me/capabilities/ trả đúng theo role hiện tại.
  - Xoá Lead/Opportunity/Quote/Contract/PO: chặn đúng theo capability (owner vẫn
    xoá được bản ghi mình, trừ PO không có nhánh owner).
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.capabilities import CAPABILITY_SEED, has_capability
from apps.accounts.models import RoleCapabilityGrant, User
from apps.accounts.roles import ALL_ROLES, Role


@pytest.fixture
def make_user(db):
    def _make(role, username=None):
        u = User.objects.create(username=username or f'u_{role}', role=role)
        u.set_password('secret12345')
        u.save()
        return u
    return _make


# ─── has_capability() khớp seed cho mọi role ─────────────────────────────────

@pytest.mark.django_db
@pytest.mark.parametrize('key', list(CAPABILITY_SEED.keys()))
def test_has_capability_matches_seed_for_every_role(make_user, key):
    _, _, default_roles = CAPABILITY_SEED[key]
    for role in ALL_ROLES:
        u = make_user(role, username=f'chk_{role}_{key}'.replace('.', '_'))
        assert has_capability(u, key) == (role in default_roles), (
            f"role={role} key={key} kỳ vọng {role in default_roles}")


@pytest.mark.django_db
def test_has_capability_unknown_key_is_false(make_user):
    u = make_user(Role.ADMIN)
    assert has_capability(u, 'not.a.real.capability') is False


# ─── API ma trận quyền ────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_capability_matrix_get_requires_admin_or_ceo(make_user):
    sale = make_user(Role.SALES)
    admin = make_user(Role.ADMIN)
    ceo = make_user(Role.CEO)

    c = APIClient(); c.force_authenticate(sale)
    assert c.get('/api/v1/accounts/capabilities/').status_code == 403

    c = APIClient(); c.force_authenticate(admin)
    r = c.get('/api/v1/accounts/capabilities/')
    assert r.status_code == 200
    assert len(r.data) == len(CAPABILITY_SEED) * len(ALL_ROLES)

    c = APIClient(); c.force_authenticate(ceo)
    assert c.get('/api/v1/accounts/capabilities/').status_code == 200


@pytest.mark.django_db
def test_capability_matrix_patch_toggles_grant(make_user):
    admin = make_user(Role.ADMIN)
    c = APIClient(); c.force_authenticate(admin)

    # Mặc định wh_manager KHÔNG được xoá PO.
    assert has_capability(make_user(Role.WAREHOUSE_MANAGER, 'whm_check'), 'purchasing.po.delete') is False

    r = c.patch('/api/v1/accounts/capabilities/', {
        'role': Role.WAREHOUSE_MANAGER, 'capability_key': 'purchasing.po.delete', 'is_granted': True,
    }, format='json')
    assert r.status_code == 200

    grant = RoleCapabilityGrant.objects.get(role=Role.WAREHOUSE_MANAGER,
                                            capability__key='purchasing.po.delete')
    assert grant.is_granted is True
    assert grant.updated_by_id == admin.id


@pytest.mark.django_db
def test_my_capabilities_returns_role_grants(make_user):
    admin = make_user(Role.ADMIN)
    c = APIClient(); c.force_authenticate(admin)
    r = c.get('/api/v1/accounts/me/capabilities/')
    assert r.status_code == 200
    assert set(r.data['capabilities']) == {
        'crm.lead.delete', 'crm.opportunity.delete', 'crm.quote.delete',
        'crm.contract.delete', 'purchasing.po.delete',
    }

    sale = make_user(Role.SALES)
    c2 = APIClient(); c2.force_authenticate(sale)
    r2 = c2.get('/api/v1/accounts/me/capabilities/')
    assert r2.data['capabilities'] == []


# ─── Xoá Lead (owner fallback) ────────────────────────────────────────────────

@pytest.mark.django_db
def test_lead_delete_blocked_for_non_owner_non_admin(make_user):
    from apps.crm.models import Lead

    owner = make_user(Role.SALES, 'lead_owner')
    # Manager thấy MỌI lead (_own_filter bỏ qua ownership cho manager+) nên tới
    # được perform_destroy — nhưng không phải owner và không có capability
    # (mặc định chỉ admin) → phải bị chặn ở tầng capability, không phải 404.
    manager = make_user(Role.MANAGER, 'lead_manager')
    admin = make_user(Role.ADMIN, 'lead_admin')
    lead = Lead.objects.create(name='Cty ABC', owner=owner)

    c = APIClient(); c.force_authenticate(manager)
    r = c.delete(f'/api/v1/crm/leads/{lead.id}/')
    assert r.status_code == 403

    c = APIClient(); c.force_authenticate(owner)
    r = c.delete(f'/api/v1/crm/leads/{lead.id}/')
    assert r.status_code == 204
    lead.refresh_from_db()
    assert lead.deleted_at is not None   # soft-delete, không mất bản ghi

    lead2 = Lead.objects.create(name='Cty XYZ', owner=owner)
    c = APIClient(); c.force_authenticate(admin)
    r = c.delete(f'/api/v1/crm/leads/{lead2.id}/')
    assert r.status_code == 204


# ─── Xoá PO (chỉ admin, không có nhánh owner) ─────────────────────────────────

@pytest.mark.django_db
def test_po_delete_only_admin_and_only_draft(make_user):
    from apps.purchasing.models import PurchaseOrder, PurchaseStatus, Supplier
    from apps.wms.models import Warehouse

    manager = make_user(Role.MANAGER, 'po_manager')
    admin = make_user(Role.ADMIN, 'po_admin')
    wh = Warehouse.objects.create(code='HCM', name='Kho HCM', is_active=True, is_default=True)
    sup = Supplier.objects.create(code='NCC-0001', name='NCC Test')
    po = PurchaseOrder.objects.create(code='PO-2026-900', supplier=sup, warehouse=wh,
                                      owner=manager, status=PurchaseStatus.DRAFT)

    # Manager tạo được PO (has_capability) nhưng KHÔNG được xoá (chỉ admin).
    c = APIClient(); c.force_authenticate(manager)
    r = c.delete(f'/api/v1/purchasing/orders/{po.id}/')
    assert r.status_code == 403

    c = APIClient(); c.force_authenticate(admin)
    r = c.delete(f'/api/v1/purchasing/orders/{po.id}/')
    assert r.status_code == 204
    po.refresh_from_db()
    assert po.deleted_at is not None


# ─── Xoá Contract (customer__owner_id, không phải instance.owner_id) ─────────

@pytest.mark.django_db
def test_contract_delete_blocked_then_admin_ok(make_user):
    from apps.crm.models import Contract, Customer

    owner = make_user(Role.SALES, 'ct_owner')
    manager = make_user(Role.MANAGER, 'ct_manager')
    admin = make_user(Role.ADMIN, 'ct_admin')
    cust = Customer.objects.create(code='KHT-0001', name='Cty T', owner=owner)
    contract = Contract.objects.create(code='HD-9001', customer=cust, owner=owner)

    c = APIClient(); c.force_authenticate(manager)
    r = c.delete(f'/api/v1/crm/contracts/{contract.id}/')
    assert r.status_code == 403

    c = APIClient(); c.force_authenticate(admin)
    r = c.delete(f'/api/v1/crm/contracts/{contract.id}/')
    assert r.status_code == 204
    contract.refresh_from_db()
    assert contract.deleted_at is not None
