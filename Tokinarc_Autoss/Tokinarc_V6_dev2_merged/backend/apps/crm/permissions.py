"""
Tokinarc V6.C — apps/crm/permissions.py

Refactor V6.C-fix: import Role + helpers từ `apps.accounts.roles` (single source).
KHÔNG còn define ROLE_HIERARCHY ở đây.
"""
from __future__ import annotations

from rest_framework import permissions
from rest_framework.permissions import SAFE_METHODS

from apps.accounts.capabilities import has_capability
from apps.accounts.roles import (
    ALL_ROLES, Role,
    is_manager, role_of,   # noqa: F401 (is_manager re-export — dùng ở views.py cho owner-override, ngoài phạm vi Đợt B)
)

WRITE_ROLES = frozenset({Role.SALES, Role.MANAGER, Role.CEO})   # admin = quản trị hệ thống, không làm nghiệp vụ


class IsAuthenticatedWithRole(permissions.BasePermission):
    message = "Bạn cần đăng nhập với một role hợp lệ."

    def has_permission(self, request, view) -> bool:
        u = request.user
        return bool(u and u.is_authenticated and role_of(u) in ALL_ROLES)


class CustomerPermission(permissions.BasePermission):
    """
    - GET/HEAD/OPTIONS: mọi authenticated role (queryset đã filter owner)
    - POST: sale, manager, admin
    - PATCH/PUT/DELETE: owner KH, hoặc manager/admin
    """
    message = "Bạn không có quyền thao tác KH này."

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return role_of(request.user) in WRITE_ROLES

    def has_object_permission(self, request, view, obj) -> bool:
        # CustomerPermission được TÁI DÙNG cho cả Contract (owner-or-manager) —
        # chọn đúng capability theo model của obj để 2 loại cấu hình độc lập.
        from .models import Contract
        key = 'crm.contract.view_all' if isinstance(obj, Contract) else 'crm.customer.view_all'
        return has_capability(request.user, key) or obj.owner_id == request.user.id


def filter_customers_for_user(qs, user):
    """Manager+ xem hết; sale/service/warehouse chỉ KH của mình."""
    if has_capability(user, 'crm.customer.view_all'):
        return qs
    return qs.filter(owner_id=user.id)
