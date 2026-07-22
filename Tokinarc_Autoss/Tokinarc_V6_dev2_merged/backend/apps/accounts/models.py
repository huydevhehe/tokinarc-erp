"""
Tokinarc V6.C — apps/accounts/models.py

User model. Role enum đến từ `apps.accounts.roles` (single source of truth) —
không define lại tại đây.
"""
from __future__ import annotations

from django.contrib.auth.models import AbstractUser
from django.db import models

from .roles import Role as _R, get_django_choices

# Backward-compat re-export — tests cũ import `from apps.accounts.models import Role`
Role = _R

# Lazy TextChoices — Django sẵn sàng khi file này import
RoleChoices = get_django_choices()


class User(AbstractUser):
    display_name = models.CharField(max_length=100, blank=True)
    phone        = models.CharField(max_length=20, blank=True)
    role         = models.CharField(max_length=20, choices=RoleChoices.choices,
                                    default=_R.SALES, db_index=True)
    # customer FK added in migration 0002 (tránh circular dep với crm)
    customer     = models.ForeignKey('crm.Customer', null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='users')

    class Meta:
        db_table = 'accounts_user'

    def __str__(self) -> str:
        return f"{self.username} ({self.role})"

    @property
    def is_manager(self) -> bool:
        from .roles import is_manager as _im
        return _im(self)


class Capability(models.Model):
    """1 hành động cụ thể cần gán quyền (VD 'purchasing.po.create').

    Danh sách hàng do dev thêm qua `capabilities.py` (mỗi hàng khớp 1 điểm
    check quyền thật trong code) — admin/CEO KHÔNG tự tạo hàng mới qua UI,
    chỉ tick/bỏ tick RoleCapabilityGrant cho hàng đã có.
    """
    key   = models.CharField(max_length=80, unique=True)
    label = models.CharField(max_length=200)
    group = models.CharField(max_length=40)

    class Meta:
        db_table = 'accounts_capability'
        ordering = ['group', 'key']

    def __str__(self) -> str:
        return self.key


class RoleCapabilityGrant(models.Model):
    """Role X có được làm Capability Y không — nguồn động thay cho set cứng
    trong `roles.py`. Insert đủ mọi role (cả is_granted=False) để UI hiển thị
    đầy đủ ma trận."""
    role       = models.CharField(max_length=20, choices=RoleChoices.choices)
    capability = models.ForeignKey(Capability, on_delete=models.CASCADE, related_name='grants')
    is_granted = models.BooleanField(default=False)
    updated_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'accounts_role_capability_grant'
        constraints = [
            models.UniqueConstraint(fields=['role', 'capability'], name='uniq_role_capability'),
        ]

    def __str__(self) -> str:
        return f"{self.role} -> {self.capability_id} = {self.is_granted}"
