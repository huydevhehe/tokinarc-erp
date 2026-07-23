"""
Tokinarc V6.C — apps/accounts/tests/test_delete_user.py

1) Xóa qua DELETE (hard delete) khi tài khoản đã tạo/sửa dữ liệu
   (created_by/updated_by/AuditLog.user đều PROTECT) từng văng ProtectedError
   chưa bắt -> 500 thô. Phải trả 409 rõ ràng.
2) FE hiện dùng "Xóa" = PATCH is_active=false (đổi trạng thái, KHÔNG xóa row) —
   danh sách /accounts/users/ phải ẩn các tài khoản is_active=false, nhưng
   record vẫn còn nguyên trong DB (không mất liên kết created_by/updated_by).
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.common.models import AuditLog


@pytest.fixture
def admin(db):
    return User.objects.create(username='root', role=Role.ADMIN, is_staff=True, is_superuser=True)


@pytest.mark.django_db
def test_delete_user_with_history_returns_409_not_500(admin):
    target = User.objects.create(username='kho1', role=Role.WAREHOUSE)
    AuditLog.record(user=target, action='login', entity='accounts.User', entity_id=target.id)

    c = APIClient(); c.force_authenticate(admin)
    r = c.delete(f'/api/v1/accounts/users/{target.id}/')

    assert r.status_code == 409
    assert r.data['code'] == 'CONFLICT'
    assert User.objects.filter(pk=target.id).exists()   # không bị xóa dở


@pytest.mark.django_db
def test_delete_user_without_history_succeeds(admin):
    target = User.objects.create(username='fresh1', role=Role.WAREHOUSE)

    c = APIClient(); c.force_authenticate(admin)
    r = c.delete(f'/api/v1/accounts/users/{target.id}/')

    assert r.status_code == 204
    assert not User.objects.filter(pk=target.id).exists()


@pytest.mark.django_db
def test_cannot_delete_self(admin):
    c = APIClient(); c.force_authenticate(admin)
    r = c.delete(f'/api/v1/accounts/users/{admin.id}/')

    assert r.status_code == 400
    assert User.objects.filter(pk=admin.id).exists()


@pytest.mark.django_db
def test_deactivated_user_hidden_from_list_but_kept_in_db(admin):
    """"Xóa" trên FE = PATCH is_active=false — record vẫn còn, chỉ ẩn khỏi list."""
    target = User.objects.create(username='kho2', role=Role.WAREHOUSE)
    AuditLog.record(user=target, action='login', entity='accounts.User', entity_id=target.id)

    c = APIClient(); c.force_authenticate(admin)
    r = c.patch(f'/api/v1/accounts/users/{target.id}/', {'is_active': False}, format='json')
    assert r.status_code == 200

    usernames = [u['username'] for u in c.get('/api/v1/accounts/users/').data['results']]
    assert 'kho2' not in usernames
    target.refresh_from_db()
    assert target.is_active is False   # vẫn còn trong DB, chỉ đổi trạng thái
