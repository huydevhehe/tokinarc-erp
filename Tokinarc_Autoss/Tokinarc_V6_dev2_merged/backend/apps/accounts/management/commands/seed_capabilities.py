"""
Tokinarc V6 — apps/accounts/management/commands/seed_capabilities.py

Khởi tạo/đồng bộ bảng Capability + RoleCapabilityGrant từ CAPABILITY_SEED
(`apps/accounts/capabilities.py`). Idempotent — KHÔNG ghi đè giá trị admin
đã tự chỉnh qua UI, chỉ tạo mới nếu thiếu (capability mới thêm trong code,
hoặc lần seed đầu tiên).

    python manage.py seed_capabilities            # tạo/bổ sung
    python manage.py seed_capabilities --check     # chỉ kiểm tra thiếu gì, exit 1 nếu có
"""
from __future__ import annotations

import sys

from django.core.management.base import BaseCommand

from apps.accounts.capabilities import CAPABILITY_SEED
from apps.accounts.roles import ALL_ROLES


class Command(BaseCommand):
    help = "Seed Capability + RoleCapabilityGrant từ CAPABILITY_SEED (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument('--check', action='store_true',
                             help='Chỉ kiểm tra thiếu capability/grant nào, không ghi.')

    def handle(self, *args, **opts):
        from apps.accounts.models import Capability, RoleCapabilityGrant

        missing = []
        created_caps = created_grants = 0

        for key, (label, group, default_roles) in CAPABILITY_SEED.items():
            cap = Capability.objects.filter(key=key).first()
            if cap is None:
                missing.append(f"Capability '{key}' chưa tồn tại")
                if not opts['check']:
                    cap = Capability.objects.create(key=key, label=label, group=group)
                    created_caps += 1
                else:
                    continue

            for role in ALL_ROLES:
                exists = RoleCapabilityGrant.objects.filter(role=role, capability=cap).exists()
                if not exists:
                    missing.append(f"RoleCapabilityGrant '{role}' x '{key}' chưa tồn tại")
                    if not opts['check']:
                        RoleCapabilityGrant.objects.create(
                            role=role, capability=cap, is_granted=role in default_roles)
                        created_grants += 1

        if opts['check']:
            if missing:
                self.stderr.write(self.style.ERROR(
                    "LỆCH: chạy `python manage.py seed_capabilities` để bổ sung:\n  "
                    + "\n  ".join(missing)))
                sys.exit(1)
            self.stdout.write(self.style.SUCCESS("OK: DB đã khớp CAPABILITY_SEED."))
            return

        self.stdout.write(self.style.SUCCESS(
            f"Đã tạo {created_caps} capability, {created_grants} grant mới "
            f"(giữ nguyên grant đã có sẵn/đã chỉnh qua UI)."))
