"""
Truy vết chi tiết 1 mã hàng: liệt kê từng dòng StockMovement (sổ cái) theo thời
gian, cộng dồn số dư sau mỗi dòng, và so với InventoryItem.qty_on_hand hiện tại.
CHỈ ĐỌC, không ghi gì.

    python manage.py trace_stock MSK-WLD-01           # Part
    python manage.py trace_stock TK-508RR --torch      # Torch (model_code)
"""
from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Sum

from apps.wms.models import InventoryItem, StockMovement


class Command(BaseCommand):
    help = "Truy vết toàn bộ lịch sử StockMovement của 1 mã hàng + so với tồn hiện tại."

    def add_arguments(self, parser):
        parser.add_argument('code', help='Mã phụ tùng (tokin_part_no) hoặc mã súng hàn (model_code).')
        parser.add_argument('--torch', action='store_true', help='code là súng hàn, không phải phụ tùng.')

    def handle(self, code, torch, **kw):
        filt = {'torch_id': code} if torch else {'part_id': code}
        moves = StockMovement.objects.filter(**filt).select_related('bin', 'warehouse').order_by('ts')
        if not moves.exists():
            raise CommandError(f"Không có StockMovement nào cho mã '{code}'. Kiểm tra lại mã hoặc --torch.")

        self.stdout.write(f"{'Thời gian':<20}{'Kho':<6}{'Ô':<20}{'Lý do':<12}{'Delta':>8}{'Dư sau':>10}  Tham chiếu")
        running = 0
        for m in moves:
            running += m.delta
            ts = m.ts.strftime('%Y-%m-%d %H:%M')
            bin_code = m.bin.full_code if m.bin_id else '—'
            wh_code = m.warehouse.code if m.warehouse_id else '—'
            self.stdout.write(
                f"{ts:<20}{wh_code:<6}{bin_code:<20}{m.reason:<12}{m.delta:>+8}{running:>10}  {m.ref_id or '—'}")

        actual = InventoryItem.objects.filter(**filt).aggregate(total=Sum('qty_on_hand'))['total'] or 0

        self.stdout.write(f"\nTổng cộng dồn từ ledger: {running}")
        self.stdout.write(f"Tồn hiện tại (InventoryItem.qty_on_hand, mọi ô/kho): {actual}")
        if running == actual:
            self.stdout.write(self.style.SUCCESS("=> KHỚP."))
        else:
            self.stdout.write(self.style.ERROR(f"=> LỆCH {actual - running:+d} — có thay đổi tồn không qua ledger."))
