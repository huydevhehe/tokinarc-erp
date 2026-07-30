"""
Tokinarc V6 — apps/catalog/management/commands/wipe_all_data.py

Xoá SẠCH TOÀN BỘ dữ liệu nghiệp vụ trong toàn hệ thống (CRM, WMS, Mua hàng,
Bán hàng, Danh mục sản phẩm, log...) — CHỈ GIỮ LẠI tài khoản đăng nhập +
phân quyền + các bảng nội bộ của Django/JWT. Quyết định nghiệp vụ (Huy + sếp,
2026-07-30): dữ liệu hiện tại chỉ là test, xoá sạch để người dùng thật tự tạo
từ đầu.

Xoá bằng TRUNCATE ... CASCADE cấp database (không qua ORM từng model) — xử lý
đúng thứ tự khoá ngoại tự động, kể cả các bảng bị PROTECT chặn xoá qua ORM
bình thường (Part/Torch/tồn kho/đơn hàng...).

GIỮ LẠI (không đụng):
  - accounts_user, accounts_capability, accounts_role_capability_grant,
    accounts_user_groups, accounts_user_user_permissions — tài khoản +
    phân quyền.
  - auth_group, auth_group_permissions, auth_permission,
    django_content_type, django_migrations, django_session,
    token_blacklist_* — nội bộ Django/JWT, KHÔNG PHẢI dữ liệu nghiệp vụ,
    đụng vào có thể sập cả hệ thống.

⚠️ KHÔNG THỂ HOÀN TÁC — bắt buộc backup DB (pg_dump) trước khi chạy --yes.

Mặc định CHỈ XEM sẽ xoá bảng nào, giữ bảng nào — KHÔNG đụng gì:
    python manage.py wipe_all_data
Xoá thật:
    python manage.py wipe_all_data --yes
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import connection

# Giữ lại — tài khoản/phân quyền + nội bộ Django/JWT (không phải dữ liệu nghiệp vụ).
KEEP_TABLES = {
    'accounts_user', 'accounts_capability', 'accounts_role_capability_grant',
    'accounts_user_groups', 'accounts_user_user_permissions',
    'auth_group', 'auth_group_permissions', 'auth_permission',
    'django_content_type', 'django_migrations', 'django_session',
    'token_blacklist_blacklistedtoken', 'token_blacklist_outstandingtoken',
}


class Command(BaseCommand):
    help = ('Xoá sạch TOÀN BỘ dữ liệu nghiệp vụ (CRM/WMS/Mua hàng/Bán hàng/Danh mục...), '
            'chỉ giữ tài khoản đăng nhập + phân quyền.')

    def add_arguments(self, parser):
        parser.add_argument('--yes', action='store_true',
                             help='Xác nhận xoá thật. Không có cờ này chỉ in ra sẽ xoá bảng nào, chưa đụng gì.')

    def handle(self, yes, **opts):
        all_tables = set(connection.introspection.table_names())
        # Chỉ đụng bảng của chính project (db_table đặt tên có prefix app,
        # KHÔNG đụng bảng nào không nhận diện được — an toàn hơn là liệt kê thiếu).
        wipe_tables = sorted(t for t in all_tables if t not in KEEP_TABLES)
        keep_present = sorted(t for t in all_tables if t in KEEP_TABLES)

        self.stdout.write(self.style.WARNING(f'GIỮ LẠI {len(keep_present)} bảng (tài khoản + phân quyền + nội bộ Django/JWT):'))
        for t in keep_present:
            self.stdout.write(f'  - {t}')
        self.stdout.write(self.style.ERROR(f'\nSẼ XOÁ SẠCH {len(wipe_tables)} bảng (toàn bộ dữ liệu nghiệp vụ):'))
        for t in wipe_tables:
            self.stdout.write(f'  - {t}')

        if not yes:
            self.stdout.write(self.style.WARNING(
                '\nCHƯA xoá gì (thiếu --yes). ⚠️ Đã backup DB (pg_dump) chưa? Chạy lại kèm --yes để '
                'xoá thật — KHÔNG THỂ HOÀN TÁC, mất sạch dữ liệu ở các bảng trên.'))
            return

        quoted = ', '.join(f'"{t}"' for t in wipe_tables)
        with connection.cursor() as cursor:
            cursor.execute(f'TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE;')
        self.stdout.write(self.style.SUCCESS(
            f'\nĐã xoá sạch {len(wipe_tables)} bảng. Tài khoản đăng nhập + phân quyền vẫn giữ nguyên.'))
