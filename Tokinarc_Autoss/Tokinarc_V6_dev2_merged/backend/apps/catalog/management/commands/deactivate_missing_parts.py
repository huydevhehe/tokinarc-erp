"""
Tokinarc V6 — apps/catalog/management/commands/deactivate_missing_parts.py

Sau khi Import file phụ tùng "chuẩn" (đã tự cập nhật/tạo mới qua nút Import —
xem apps/catalog/imports.py), lệnh này dọn nốt phần Import KHÔNG làm được:
những mã phụ tùng đang có trong hệ thống nhưng KHÔNG có trong file chuẩn.

KHÔNG xoá cứng (Part bị PROTECT ở nhiều bảng — Tồn kho/Lô/phiếu Nhập-Xuất/Đơn
mua/Đơn bán, xoá thật sẽ báo lỗi hoặc mất lịch sử) — chỉ ẩn is_active=False,
giống cách "Xóa" NCC/phiếu nhập vẫn dùng trong hệ thống này.

Chạy (mặc định CHỈ XEM sẽ ẩn bao nhiêu mã, chưa đụng gì):
    python manage.py deactivate_missing_parts "duong_dan/file_chuan.xlsx"
Chạy thật:
    python manage.py deactivate_missing_parts "duong_dan/file_chuan.xlsx" --yes
"""
from __future__ import annotations

import io

from django.core.management.base import BaseCommand, CommandError

from apps.catalog.imports import _parse_file
from apps.catalog.models import Part


class Command(BaseCommand):
    help = ('Ẩn (is_active=false) các Part KHÔNG có trong file Excel/CSV chuẩn — '
            'dọn phần Import (chỉ thêm/sửa) không tự làm được.')

    def add_arguments(self, parser):
        parser.add_argument('file_path')
        parser.add_argument('--yes', action='store_true',
                             help='Xác nhận ẩn thật. Không có cờ này chỉ in ra sẽ ẩn bao nhiêu mã, chưa đụng gì.')

    def handle(self, file_path, yes, **opts):
        try:
            with open(file_path, 'rb') as fh:
                buf = io.BytesIO(fh.read())
            buf.name = file_path   # _parse_file dò đuôi file qua .name (BytesIO cho gán được)
            rows = _parse_file(buf)
        except FileNotFoundError:
            raise CommandError(f'Không tìm thấy file: {file_path}')
        except Exception as e:   # noqa: BLE001 — báo lỗi đọc file thân thiện
            raise CommandError(f'Không đọc được file: {e}')

        file_codes = {(row.get('tokin_part_no') or '').strip() for row in rows}
        file_codes.discard('')
        if not file_codes:
            raise CommandError('File không có mã phụ tùng nào (cột tokin_part_no) — dừng, không ẩn nhầm hết.')

        to_hide = Part.objects.filter(is_active=True).exclude(tokin_part_no__in=file_codes)
        count = to_hide.count()
        total_active = Part.objects.filter(is_active=True).count()

        self.stdout.write(f'File chuẩn có {len(file_codes)} mã. Hệ thống đang có {total_active} mã đang hoạt động.')
        self.stdout.write(f'Sẽ ẩn (is_active=false) {count} mã KHÔNG có trong file.')

        if not yes:
            self.stdout.write(self.style.WARNING(
                '\nCHƯA ẩn gì (thiếu --yes). Vài mã sẽ bị ẩn (mẫu):'))
            for p in to_hide[:15]:
                self.stdout.write(f'  {p.tokin_part_no}: {p.display_name_vi}')
            return

        updated = to_hide.update(is_active=False)
        self.stdout.write(self.style.SUCCESS(f'Đã ẩn {updated} mã phụ tùng không có trong file chuẩn.'))
