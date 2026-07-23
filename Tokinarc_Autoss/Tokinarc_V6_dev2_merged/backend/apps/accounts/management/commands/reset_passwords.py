"""
Tokinarc — apps/accounts/management/commands/reset_passwords.py

Đặt lại mật khẩu HÀNG LOẠT cho tài khoản về cùng 1 giá trị — dùng khi cần dọn
gọn nhiều mật khẩu khác nhau về 1 mật khẩu dễ nhớ (demo/nội bộ). Idempotent.

    python manage.py reset_passwords                    # tất cả user → 'admin'
    python manage.py reset_passwords --password 123456  # đổi mật khẩu đích
    python manage.py reset_passwords --role sales       # chỉ reset 1 role

Lưu ý: mật khẩu yếu như 'admin' chỉ nên dùng cho giai đoạn demo/nội bộ.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.accounts.models import User


class Command(BaseCommand):
    help = "Đặt lại mật khẩu hàng loạt cho tài khoản về cùng 1 giá trị."

    def add_arguments(self, parser):
        parser.add_argument('--password', default='admin',
                            help="Mật khẩu đích (mặc định 'admin').")
        parser.add_argument('--role', default='',
                            help="Chỉ reset user thuộc role này; bỏ trống = tất cả.")

    def handle(self, password, role, **kw):
        qs = User.objects.all()
        if role:
            qs = qs.filter(role=role)
        n = 0
        for u in qs:
            u.set_password(password)
            u.save(update_fields=['password'])
            n += 1
        scope = f"role '{role}'" if role else "tất cả"
        self.stdout.write(self.style.SUCCESS(
            f"✅ Đã đặt lại mật khẩu cho {n} tài khoản ({scope}) về '{password}'."))
