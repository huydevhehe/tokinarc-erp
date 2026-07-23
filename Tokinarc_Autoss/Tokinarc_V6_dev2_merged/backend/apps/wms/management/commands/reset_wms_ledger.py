"""
Tokinarc V6 — apps/wms/management/commands/reset_wms_ledger.py

Xoá sạch dữ liệu TEST của Nhập kho / Xuất kho / Tồn kho (đang rối, nhiều dòng
StockMovement thiếu người thao tác) rồi nạp lại 1 bộ mẫu có liên kết đầy đủ,
dùng ĐÚNG service nghiệp vụ thật (receive_stock / generate_pick_list /
confirm_pick_and_ship — apps/wms/services.py) thay vì tạo thẳng StockMovement
tay, để đảm bảo mọi dòng luôn có người thao tác + khớp 100% với Tồn kho
(kiểm lại bằng `python manage.py reconcile_stock` sau khi chạy xong).

KHÔNG đụng: catalog (Part/Torch/Nhóm-Danh mục SP), Warehouse/Zone/Bin (layout
kho thật), Supplier, PurchaseOrder, CRM, Sales — dùng lại parts/kho/bin THẬT
đang có sẵn, không tạo mới.

Chạy (mặc định CHỈ XEM sẽ xoá gì, chưa xoá thật):
    python manage.py reset_wms_ledger
Xoá + nạp lại thật:
    python manage.py reset_wms_ledger --yes
    python manage.py reset_wms_ledger --yes --user quanly1   # gán người cho data mẫu
"""
from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import User
from apps.catalog.models import Part
from apps.wms import services
from apps.wms.models import (
    Bin, InboundLine, InboundOrder, InventoryItem, Lot, OutboundLine,
    OutboundOrder, SerialNumber, StockMovement, Warehouse,
)


class Command(BaseCommand):
    help = ("Xoá sạch Nhập kho/Xuất kho/Tồn kho (test) rồi nạp lại mẫu có liên kết "
            "đầy đủ, dùng service thật để đảm bảo luôn có người thao tác.")

    def add_arguments(self, parser):
        parser.add_argument('--yes', action='store_true',
                             help='Xác nhận xoá thật. Không có cờ này chỉ in ra sẽ xoá bao nhiêu dòng, không xoá.')
        parser.add_argument('--user', default='',
                             help='Username gán làm người thao tác cho dữ liệu mẫu (mặc định: admin).')

    def handle(self, yes, user, **opts):
        counts = {
            'InboundOrder': InboundOrder.objects.count(),
            'OutboundOrder': OutboundOrder.objects.count(),
            'StockMovement': StockMovement.objects.count(),
            'InventoryItem': InventoryItem.objects.count(),
            'Lot': Lot.objects.count(),
            'SerialNumber': SerialNumber.objects.count(),
        }
        self.stdout.write("Sẽ xoá:")
        for k, v in counts.items():
            self.stdout.write(f"  {k}: {v}")

        if not yes:
            self.stdout.write(self.style.WARNING(
                "\nCHƯA xoá gì cả (thiếu --yes). Chạy lại kèm --yes để xoá + nạp lại thật."))
            return

        actor = User.objects.filter(username=user).first() if user else None
        actor = actor or User.objects.filter(username='admin').first() or User.objects.filter(is_admin=True).first()
        if actor is None:
            raise CommandError("Không tìm thấy user để gán cho dữ liệu mẫu (thử --user <username>).")

        with transaction.atomic():
            StockMovement.objects.all().delete()
            InventoryItem.objects.all().delete()
            Lot.objects.all().delete()
            SerialNumber.objects.all().delete()
            OutboundOrder.objects.all().delete()   # cascade OutboundLine + PickListItem
            InboundOrder.objects.all().delete()    # cascade InboundLine

        self.stdout.write(self.style.SUCCESS("Đã xoá sạch Nhập/Xuất/Tồn kho cũ."))

        warehouses = list(Warehouse.objects.filter(is_active=True).prefetch_related('zones__bins'))
        if not warehouses:
            raise CommandError("Không có kho active nào để nạp mẫu — kiểm tra lại Warehouse.")
        parts = list(Part.objects.all().order_by('tokin_part_no')[:12])
        if not parts:
            raise CommandError("Không có Part nào trong danh mục sản phẩm để nạp mẫu.")

        in_seq = out_seq = 1
        from apps.wms.models import CycleCountLine
        locked_bin_ids = set(CycleCountLine.objects.filter(session__status='open')
                              .values_list('bin_id', flat=True))

        for wh in warehouses:
            bins = [b for z in wh.zones.all() for b in z.bins.all() if b.id not in locked_bin_ids]
            if not bins:
                self.stdout.write(self.style.WARNING(
                    f"Kho {wh.code}: mọi ô đều đang bị khoá bởi phiên kiểm kê mở — bỏ qua, không nạp mẫu."))
                continue
            sample_bins = bins[:6]
            sample_parts = (parts * (len(sample_bins) // len(parts) + 1))[:len(sample_bins)]

            # ── Nhập mẫu: nạp tồn thật qua receive_stock (ghi StockMovement đúng) ──
            code_in = f"IN-RESET-{in_seq:03d}"
            inb = InboundOrder.objects.create(
                code=code_in, warehouse=wh, status='draft', flow_type='internal',
                created_by=actor, updated_by=actor)
            for i, b in enumerate(sample_bins):
                p = sample_parts[i]
                qty = 100 + i * 20
                InboundLine.objects.create(inbound=inb, part=p, qty_expected=qty,
                                            target_bin=b, qty_received=qty, qty_putaway=qty)
                services.receive_stock(bin_obj=b, part=p, qty=qty, user=actor, ref_id=code_in)
            inb.status = 'putaway'
            inb.received_by = actor
            inb.save(update_fields=['status', 'received_by'])
            in_seq += 1

            # ── Xuất mẫu: xuất bớt 1 phần vừa nhập qua pick + ship thật ──
            code_out = f"OUT-RESET-{out_seq:03d}"
            out = OutboundOrder.objects.create(
                code=code_out, warehouse=wh, rule='FIFO', purpose='sale',
                status='draft', created_by=actor, updated_by=actor)
            for i, b in enumerate(sample_bins[:3]):
                p = sample_parts[i]
                OutboundLine.objects.create(outbound=out, part=p, qty_ordered=10 + i * 5)
            services.generate_pick_list(out)
            services.confirm_pick_and_ship(out, user=actor)
            out_seq += 1

        self.stdout.write(self.style.SUCCESS(
            f"Đã nạp lại mẫu: {InboundOrder.objects.count()} phiếu nhập, "
            f"{OutboundOrder.objects.count()} phiếu xuất, "
            f"{InventoryItem.objects.count()} dòng tồn, "
            f"{StockMovement.objects.count()} biến động."))
        self.stdout.write("Chạy `python manage.py reconcile_stock` để xác nhận Tồn kho khớp Ledger.")
