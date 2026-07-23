"""Test management command reset_passwords + xoá user qua API (admin)."""
from __future__ import annotations

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.accounts.models import Role, User


@pytest.mark.django_db
def test_reset_all_passwords_to_admin():
    a = User.objects.create(username='a', role=Role.SALES); a.set_password('x1'); a.save()
    b = User.objects.create(username='b', role=Role.MANAGER); b.set_password('y2'); b.save()
    call_command('reset_passwords')   # mặc định 'admin'
    a.refresh_from_db(); b.refresh_from_db()
    assert a.check_password('admin')
    assert b.check_password('admin')


@pytest.mark.django_db
def test_reset_passwords_custom_value_and_role_filter():
    s = User.objects.create(username='s', role=Role.SALES); s.set_password('x'); s.save()
    m = User.objects.create(username='m', role=Role.MANAGER); m.set_password('y'); m.save()
    call_command('reset_passwords', password='123456', role=Role.SALES)
    s.refresh_from_db(); m.refresh_from_db()
    assert s.check_password('123456')          # đúng role được reset
    assert not m.check_password('123456')       # role khác giữ nguyên
    assert m.check_password('y')


@pytest.mark.django_db
def test_admin_can_delete_user():
    admin = User.objects.create(username='root', role=Role.ADMIN, is_superuser=True, is_staff=True)
    victim = User.objects.create(username='bye', role=Role.SALES)
    c = APIClient(); c.force_authenticate(admin)
    r = c.delete(f'/api/v1/accounts/users/{victim.id}/')
    assert r.status_code in (200, 204)
    assert not User.objects.filter(id=victim.id).exists()


@pytest.mark.django_db
def test_admin_cannot_delete_self():
    admin = User.objects.create(username='root2', role=Role.ADMIN, is_superuser=True, is_staff=True)
    c = APIClient(); c.force_authenticate(admin)
    r = c.delete(f'/api/v1/accounts/users/{admin.id}/')
    assert r.status_code == 400
    assert User.objects.filter(id=admin.id).exists()


@pytest.mark.django_db
def test_non_admin_cannot_delete_user():
    mgr = User.objects.create(username='mgr', role=Role.MANAGER)
    victim = User.objects.create(username='v2', role=Role.SALES)
    c = APIClient(); c.force_authenticate(mgr)
    r = c.delete(f'/api/v1/accounts/users/{victim.id}/')
    assert r.status_code in (403, 404)
    assert User.objects.filter(id=victim.id).exists()
