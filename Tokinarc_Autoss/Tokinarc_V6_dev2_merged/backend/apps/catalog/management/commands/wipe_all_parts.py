"""
Tokinarc V6 — apps/catalog/management/commands/wipe_all_parts.py

Xoá SẠCH toàn bộ Part (phụ tùng, cả cũ lẫn mới) để nạp lại từ đầu bằng file
Excel riêng — quyết định nghiệp vụ (Huy + sếp, 2026-07-30). KHÔNG đụng Torch
(súng hàn) — chỉ Part.

Part đang bị PROTECT (chặn xoá) ở rất nhiều bảng nghiệp vụ khác — muốn xoá
được Part thì phải xoá hết các dòng tham chiếu tới nó TRƯỚC:
  Tồn kho, Lô hàng, dòng phiếu Nhập/Xuất kho, Nhật ký biến động kho,
  dòng Kiểm kê, dòng Đơn mua, dòng Đơn bán, dòng Trả hàng.
(PickListItem tự mất theo khi OutboundLine bị xoá — quan hệ CASCADE, không
cần đụng tay riêng.)

⚠️ KHÔNG THỂ HOÀN TÁC — nhớ backup DB (pg_dump) trước khi chạy --yes.

Mặc định CHỈ XEM sẽ xoá bao nhiêu dòng mỗi bảng, KHÔNG đụng gì:
    python manage.py wipe_all_parts
Xoá thật:
    python manage.py wipe_all_parts --yes
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.catalog.models import Part
from apps.purchasing.models import PurchaseOrderLine
from apps.sales.models import ReturnLine, SalesOrderLine
from apps.wms.models import (
    CycleCountLine, InboundLine, InventoryItem, Lot, OutboundLine, StockMovement,
)


class Command(BaseCommand):
    help = ('Xoá sạch toàn bộ Part (phụ tùng) + mọi dữ liệu tham chiếu (tồn kho/lô/dòng '
            'phiếu nhập-xuất/nhật ký kho/kiểm kê/đơn mua/đơn bán/trả hàng). Không đụng Torch.')

    def add_arguments(self, parser):
        parser.add_argument('--yes', action='store_true',
                             help='Xác nhận xoá thật. Không có cờ này chỉ in ra sẽ xoá bao nhiêu dòng, chưa đụng gì.')

    def handle(self, yes, **opts):
        targets = [
            ('Tồn kho (InventoryItem)', InventoryItem.objects.filter(part__isnull=False)),
            ('Lô hàng (Lot)', Lot.objects.filter(part__isnull=False)),
            ('Dòng phiếu Nhập kho (InboundLine)', InboundLine.objects.filter(part__isnull=False)),
            ('Dòng phiếu Xuất kho (OutboundLine)', OutboundLine.objects.filter(part__isnull=False)),
            ('Nhật ký biến động kho (StockMovement)', StockMovement.objects.filter(part__isnull=False)),
            ('Dòng kiểm kê (CycleCountLine)', CycleCountLine.objects.filter(part__isnull=False)),
            ('Dòng Đơn mua (PurchaseOrderLine)', PurchaseOrderLine.objects.filter(part__isnull=False)),
            ('Dòng Đơn bán (SalesOrderLine)', SalesOrderLine.objects.filter(part__isnull=False)),
            ('Dòng Trả hàng (ReturnLine)', ReturnLine.objects.filter(part__isnull=False)),
        ]
        total_parts = Part.objects.count()
        self.stdout.write(f'Sẽ xoá {total_parts} Part (Phụ tùng) — Torch (súng hàn) KHÔNG bị đụng.\n')
        self.stdout.write('Kèm theo sẽ xoá các dòng dữ liệu đang tham chiếu tới Part (bắt buộc, không thì Part không xoá được):')
        for label, qs in targets:
            self.stdout.write(f'  - {label}: {qs.count()} dòng')

        if not yes:
            self.stdout.write(self.style.WARNING(
                '\nCHƯA xoá gì (thiếu --yes). ⚠️ Đã backup DB chưa? Chạy lại kèm --yes để xoá '
                'thật — KHÔNG THỂ HOÀN TÁC.'))
            return

        with transaction.atomic():
            for label, qs in targets:
                n, _ = qs.delete()
                self.stdout.write(f'Đã xoá {label}: {n} dòng.')
            n_parts, _ = Part.objects.all().delete()
            self.stdout.write(self.style.SUCCESS(f'\nĐã xoá {n_parts} Part. Xong — vào trang Import để nạp file mới.'))
