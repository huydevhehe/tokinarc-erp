"""
Đối chiếu Tồn kho (InventoryItem.qty_on_hand) với ledger Nhập/Xuất
(StockMovement — nguồn chân lý duy nhất theo thiết kế, xem apps/wms/services.py).
CHỈ ĐỌC, không ghi gì.

    python manage.py reconcile_stock                    # toàn bộ kho
    python manage.py reconcile_stock --warehouse HCM
    python manage.py reconcile_stock --limit 100
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db.models import Sum

from apps.wms.models import InventoryItem, StockMovement


class Command(BaseCommand):
    help = "Đối chiếu qty_on_hand hiện tại với tổng cộng dồn StockMovement theo từng mã hàng."

    def add_arguments(self, parser):
        parser.add_argument('--warehouse', default=None, help='Lọc theo mã kho (vd HCM). Bỏ trống = tất cả kho.')
        parser.add_argument('--limit', type=int, default=50, help='Số dòng lệch nhiều nhất hiển thị.')

    def handle(self, warehouse, limit, **kw):
        inv_qs = InventoryItem.objects.all()
        mv_qs = StockMovement.objects.all()
        if warehouse:
            inv_qs = inv_qs.filter(bin__zone__warehouse__code=warehouse)
            mv_qs = mv_qs.filter(warehouse__code=warehouse)

        actual: dict = {}
        for row in inv_qs.values('part_id', 'torch_id').annotate(qty=Sum('qty_on_hand')):
            key = ('p', row['part_id']) if row['part_id'] else ('t', row['torch_id'])
            actual[key] = actual.get(key, 0) + (row['qty'] or 0)

        ledger: dict = {}
        for row in mv_qs.values('part_id', 'torch_id').annotate(qty=Sum('delta')):
            key = ('p', row['part_id']) if row['part_id'] else ('t', row['torch_id'])
            ledger[key] = ledger.get(key, 0) + (row['qty'] or 0)

        keys = set(actual) | set(ledger)
        rows = []
        for key in keys:
            a = actual.get(key, 0)
            led = ledger.get(key, 0)
            if a != led:
                kind, code = key
                rows.append((code, 'Phụ tùng' if kind == 'p' else 'Súng hàn', a, led, a - led))

        rows.sort(key=lambda r: abs(r[4]), reverse=True)

        self.stdout.write(f"Tổng số mã đang TỒN >< LEDGER khác nhau: {len(rows)} / {len(keys)} mã có dữ liệu\n")
        if not rows:
            self.stdout.write(self.style.SUCCESS("Không có mã nào lệch — ledger khớp hoàn toàn với tồn hiện tại."))
            return
        self.stdout.write(f"{'Mã':<16}{'Loại':<10}{'Tồn hiện tại':>14}{'Ledger (N-X)':>14}{'Lệch':>10}")
        for code, kind, a, led, d in rows[:limit]:
            self.stdout.write(f"{code:<16}{kind:<10}{a:>14}{led:>14}{d:>+10}")
        if len(rows) > limit:
            self.stdout.write(f"... còn {len(rows) - limit} mã lệch khác, tăng --limit để xem hết.")
