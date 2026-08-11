"""
Tokinarc V6.C — apps/wms/serializers.py

Theo pattern apps/crm: list serializer gọn, detail serializer đầy đủ,
validate_*() cho business rule. Action serializers cho adjust/transfer/pick.
"""
from __future__ import annotations

from rest_framework import serializers

from .models import (
    ASN, Bin, InboundFlowType, InboundLine, InboundOrder, InventoryItem, Lot,
    OutboundLine, OutboundOrder, PickListItem, SerialNumber, StockMovement,
    Warehouse, Zone,
)


# ─── Cấu trúc kho ────────────────────────────────────────────────────────────
class WarehouseSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Warehouse
        fields = ['id', 'code', 'name', 'address', 'is_active', 'is_default',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class ZoneSerializer(serializers.ModelSerializer):
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    bin_count      = serializers.SerializerMethodField()

    class Meta:
        model  = Zone
        fields = ['id', 'warehouse', 'warehouse_code', 'code', 'name', 'purpose', 'bin_count']

    def get_bin_count(self, obj) -> int:
        return obj.bins.count()


class BinSerializer(serializers.ModelSerializer):
    warehouse_code = serializers.CharField(source='zone.warehouse.code', read_only=True)
    zone_code      = serializers.CharField(source='zone.code', read_only=True)
    zone_name      = serializers.CharField(source='zone.name', read_only=True)

    class Meta:
        model  = Bin
        fields = ['id', 'zone', 'zone_code', 'zone_name', 'warehouse_code', 'rack',
                  'bin_code', 'full_code', 'capacity']
        read_only_fields = ['full_code']


# ─── Tồn kho ─────────────────────────────────────────────────────────────────
class InventoryItemSerializer(serializers.ModelSerializer):
    bin_code       = serializers.CharField(source='bin.full_code', read_only=True)
    warehouse_code = serializers.CharField(source='bin.zone.warehouse.code', read_only=True)
    qty_available  = serializers.IntegerField(read_only=True)
    item_name      = serializers.SerializerMethodField()
    # Tên hàng hóa RIÊNG (không kèm mã) — cho FE tách cột "Mã số" / "Tên hàng
    # hóa" trên bảng Tồn kho thay vì gộp chung 1 cột (item_name giữ nguyên,
    # vẫn dùng ở chỗ khác nếu có).
    display_name   = serializers.SerializerMethodField()
    category       = serializers.SerializerMethodField()
    unit           = serializers.SerializerMethodField()
    cost_vnd       = serializers.SerializerMethodField()
    is_low         = serializers.BooleanField(read_only=True)

    class Meta:
        model  = InventoryItem
        fields = ['id', 'bin', 'bin_code', 'warehouse_code', 'part', 'torch',
                  'item_name', 'display_name', 'category', 'unit', 'cost_vnd', 'qty_on_hand',
                  'qty_reserved', 'qty_available', 'min_level', 'is_low', 'updated_at']
        read_only_fields = ['id', 'updated_at']

    def get_item_name(self, obj) -> str:
        if obj.part_id:
            return f"{obj.part_id} — {getattr(obj.part, 'display_name_vi', '')}"
        return f"{obj.torch_id} — {getattr(obj.torch, 'display_name_vi', '')}"

    def get_display_name(self, obj) -> str:
        o = obj.part or obj.torch
        return getattr(o, 'display_name_vi', '') if o else ''

    def get_category(self, obj) -> str:
        # Loại sản phẩm (đặt tên kệ): category cho phụ tùng, family cho súng hàn.
        if obj.part_id:
            return getattr(obj.part, 'category', '') or ''
        return getattr(obj.torch, 'family', '') or ''

    def get_unit(self, obj) -> str:
        o = obj.part or obj.torch
        return getattr(o, 'price_unit', '') if o else ''

    def get_cost_vnd(self, obj):
        o = obj.part or obj.torch
        return getattr(o, 'cost_vnd', None) if o else None

    def validate(self, attrs):
        if bool(attrs.get('part')) == bool(attrs.get('torch')):
            raise serializers.ValidationError("Phải có đúng một trong part hoặc torch.")
        return attrs


class SerialNumberSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SerialNumber
        fields = ['id', 'serial', 'torch', 'bin', 'status', 'sold_to_customer',
                  'sold_order', 'received_at', 'warranty_until',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class LotSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Lot
        fields = ['id', 'lot_no', 'part', 'qty_remaining', 'received_date',
                  'expires_at', 'bin']


class StockMovementSerializer(serializers.ModelSerializer):
    by_username = serializers.CharField(source='by_user.username', read_only=True)

    class Meta:
        model  = StockMovement
        fields = ['id', 'ts', 'warehouse', 'part', 'torch', 'bin', 'delta',
                  'reason', 'ref_kind', 'ref_id', 'by_username', 'note']


# ─── Inbound / Outbound (nested lines) ───────────────────────────────────────
def _line_item_name(obj):
    """Tên hiển thị của mặt hàng (part hoặc torch) cho 1 dòng phiếu kho."""
    o = obj.part or obj.torch
    return (getattr(o, 'display_name_vi', '') or str(o.pk)) if o else ''


def _line_unit(obj) -> str:
    """Đơn vị tính (Part/Torch.price_unit, mặc định 'cái') cho 1 dòng phiếu kho."""
    o = obj.part or obj.torch
    return getattr(o, 'price_unit', '') if o else ''


class InboundLineSerializer(serializers.ModelSerializer):
    part_name = serializers.SerializerMethodField()
    unit = serializers.SerializerMethodField()
    # `target_bin` là id số (Bin.pk) — không đọc được. Trả kèm mã vị trí dạng
    # 'HCM-A-R01-B03' để bảng Nhập kho hiện được cột "Bin đích" mà khỏi phải
    # tải thêm danh sách bin rồi tự dò id.
    target_bin_code = serializers.CharField(source='target_bin.full_code',
                                            default=None, read_only=True)
    # Trước đây không chặn: SL = 0 tạo được phiếu rỗng (bấm Nhận đủ cộng 0 vào
    # kho, nhìn phiếu tưởng đã nhận hàng), SL âm thì vỡ ràng buộc DB và hiện
    # màn hình lỗi kỹ thuật thay vì câu thông báo người dùng hiểu được.
    qty_expected = serializers.IntegerField(
        min_value=1, error_messages={'min_value': 'Số lượng phải lớn hơn 0.'})

    class Meta:
        model  = InboundLine
        fields = ['id', 'part', 'torch', 'part_name', 'unit', 'qty_expected', 'qty_received',
                  'target_bin', 'target_bin_code', 'lot_no', 'lot_expires', 'unit_cost',
                  'tax_pct', 'serials_raw', 'order_idx']

    def get_unit(self, obj) -> str:
        return _line_unit(obj)

    def get_part_name(self, obj) -> str:
        return _line_item_name(obj)


class InboundOrderSerializer(serializers.ModelSerializer):
    lines = InboundLineSerializer(many=True, required=False)
    po_code = serializers.CharField(source='purchase_order.code', read_only=True, default='')
    received_by_username = serializers.CharField(source='received_by.username', read_only=True, default='')

    class Meta:
        model  = InboundOrder
        fields = ['id', 'code', 'warehouse', 'asn', 'purchase_order', 'po_code', 'manual_po_no', 'status',
                  'supplier', 'invoice_no', 'invoice_date', 'shortage_note', 'received_at', 'lines', 'notes',
                  'flow_type', 'delivered_by_name', 'received_by', 'received_by_username',
                  'is_active', 'created_at', 'updated_at']
        # received_at: hệ thống tự set khi confirm() nhận hàng, nhưng vẫn cho SỬA
        # LẠI sau đó (đối chiếu đúng ngày hàng thực tế về kho, VD nhận hàng hôm
        # confirm trên hệ thống trễ hơn ngày NCC giao thực tế).
        read_only_fields = ['id', 'status', 'received_by', 'created_at', 'updated_at']
        # code: nếu client không gửi → view tự sinh (IN-YYYY-NNN).
        extra_kwargs = {'code': {'required': False}}

    def validate(self, attrs):
        """Ba chốt chặn thêm 2026-08-11 (rà soát nhập liệu cùng ban lãnh đạo):

        1. Bin đích phải thuộc ĐÚNG kho của phiếu. Trước đây không kiểm: phiếu
           ghi nhập kho A nhưng chọn ô của kho B thì hàng cộng vào kho B —
           tồn kho cả hai kho cùng sai mà nhìn phiếu không thấy gì bất thường.
        2. Ngày nhập kho không được ở tương lai — hàng chưa về thì chưa nhập.
        3. Phiếu Nhà cung cấp phải ghi rõ mua của ai.
        """
        from django.utils import timezone

        wh = attrs.get('warehouse') or getattr(self.instance, 'warehouse', None)
        lines = attrs.get('lines')
        if lines is None and self.instance:
            lines = [{'target_bin': l.target_bin} for l in self.instance.lines.all()]
        if wh and lines:
            sai = {l['target_bin'].full_code for l in lines
                   if l.get('target_bin') and l['target_bin'].zone.warehouse_id != wh.id}
            if sai:
                raise serializers.ValidationError({'lines':
                    f"Bin đích {', '.join(sorted(sai))} không thuộc kho {wh.code} — "
                    f"chọn lại ô nằm trong kho của phiếu."})

        received = attrs.get('received_at')
        if received and received.date() > timezone.localdate():
            raise serializers.ValidationError({'received_at':
                'Ngày nhập kho không được ở tương lai — hàng chưa về thì chưa nhập kho được.'})

        flow = attrs.get('flow_type') or getattr(self.instance, 'flow_type', '')
        if flow == InboundFlowType.SUPPLIER:
            sup = attrs.get('supplier', getattr(self.instance, 'supplier', '') if self.instance else '')
            if not (sup or '').strip():
                raise serializers.ValidationError({'supplier':
                    'Phiếu nhập từ Nhà cung cấp phải chọn nhà cung cấp.'})
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop('lines', [])
        order = InboundOrder.objects.create(**validated_data)
        InboundLine.objects.bulk_create([InboundLine(inbound=order, **l) for l in lines])
        return order

    def update(self, instance, validated_data):
        is_active = validated_data.pop('is_active', None)
        # Ngày nhập kho (received_at) là mốc đối chiếu, KHÔNG phải SL/tồn kho —
        # cho sửa lại ở mọi trạng thái đã nhận (giống is_active), để chỉnh đúng
        # ngày hàng thực tế về khi ngày bấm "Nhận" trên hệ thống lệch thực tế.
        received_at = validated_data.pop('received_at', None)
        # "Xóa" (is_active=false) chỉ đổi hiển thị, không đụng nội dung/tồn kho →
        # cho phép ở MỌI trạng thái (giống Supplier/Part/Torch). Sửa NỘI DUNG
        # (kho/dòng hàng/...) vẫn chỉ cho phiếu Nháp (chưa nhận) để tránh lệch tồn.
        # 'updated_by' loại khỏi check vì perform_update() luôn tự thêm (không phải
        # nội dung client gửi) — nếu không loại, is_active-only PATCH sẽ bị chặn oan.
        content = {k: v for k, v in validated_data.items() if k != 'updated_by'}
        if content and instance.status != 'draft':
            raise serializers.ValidationError('Chỉ sửa nội dung được phiếu Nháp (chưa nhận hàng).')
        lines = validated_data.pop('lines', None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if is_active is not None:
            instance.is_active = is_active
        if received_at is not None:
            instance.received_at = received_at
        instance.save()
        if lines is not None:   # thay toàn bộ dòng (draft chưa nhận nên an toàn)
            instance.lines.all().delete()
            InboundLine.objects.bulk_create([InboundLine(inbound=instance, **l) for l in lines])
        return instance


class OutboundLineSerializer(serializers.ModelSerializer):
    part_name = serializers.SerializerMethodField()
    unit = serializers.SerializerMethodField()

    class Meta:
        model  = OutboundLine
        fields = ['id', 'part', 'torch', 'part_name', 'unit', 'qty_ordered', 'qty_picked', 'order_idx',
                  'unit_price', 'tax_pct', 'line_total']

    def get_unit(self, obj) -> str:
        return _line_unit(obj)

    def get_part_name(self, obj) -> str:
        return _line_item_name(obj)


class OutboundOrderSerializer(serializers.ModelSerializer):
    lines = OutboundLineSerializer(many=True, required=False)
    customer_name = serializers.CharField(source='customer.name', read_only=True, default='')
    shipped_by_username = serializers.CharField(source='shipped_by.username', read_only=True, default='')

    class Meta:
        model  = OutboundOrder
        fields = ['id', 'code', 'warehouse', 'sales_order_code', 'customer', 'customer_name',
                  'rule', 'status', 'purpose', 'shipped_at', 'lines', 'notes',
                  'delivered_by_name', 'shipped_by', 'shipped_by_username',
                  'is_active', 'created_at', 'updated_at']
        # shipped_at: hệ thống tự set khi ship() giao hàng, nhưng vẫn cho SỬA LẠI
        # sau đó (đối chiếu đúng ngày giao thực tế, giống received_at bên Inbound).
        read_only_fields = ['id', 'status', 'shipped_by', 'created_at', 'updated_at']
        # code: nếu client không gửi → view tự sinh (OUT-YYYY-NNN).
        extra_kwargs = {'code': {'required': False}}

    def create(self, validated_data):
        lines = validated_data.pop('lines', [])
        order = OutboundOrder.objects.create(**validated_data)
        OutboundLine.objects.bulk_create([OutboundLine(outbound=order, **l) for l in lines])
        return order

    def update(self, instance, validated_data):
        is_active = validated_data.pop('is_active', None)
        # Ngày xuất (shipped_at) là mốc đối chiếu, KHÔNG phải SL/tồn kho — cho sửa
        # lại ở mọi trạng thái đã giao (giống is_active), để chỉnh đúng ngày giao
        # thực tế khi ngày bấm "Giao" trên hệ thống lệch thực tế.
        shipped_at = validated_data.pop('shipped_at', None)
        # "Xóa" (is_active=false) chỉ đổi hiển thị, không đụng nội dung/tồn kho →
        # cho phép ở MỌI trạng thái (giống Supplier/Part/Torch). Sửa NỘI DUNG
        # (kho/dòng hàng/...) vẫn chỉ cho phiếu Nháp (chưa soạn) để tránh lệch tồn.
        # 'updated_by' loại khỏi check vì được tự thêm khi save() (không phải nội
        # dung client gửi) — nếu không loại, is_active-only PATCH sẽ bị chặn oan.
        content = {k: v for k, v in validated_data.items() if k != 'updated_by'}
        if content and instance.status != 'draft':
            raise serializers.ValidationError('Chỉ sửa nội dung được phiếu Nháp (chưa soạn hàng).')
        lines = validated_data.pop('lines', None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if is_active is not None:
            instance.is_active = is_active
        if shipped_at is not None:
            instance.shipped_at = shipped_at
        instance.save()
        if lines is not None:   # thay toàn bộ dòng (draft chưa soạn nên an toàn)
            instance.lines.all().delete()
            OutboundLine.objects.bulk_create(
                [OutboundLine(outbound=instance, **ln) for ln in lines])
        return instance


class PickListItemSerializer(serializers.ModelSerializer):
    bin_code = serializers.CharField(source='bin.full_code', read_only=True)

    class Meta:
        model  = PickListItem
        fields = ['id', 'outbound_line', 'bin', 'bin_code', 'lot', 'serial',
                  'qty', 'is_picked']


class ASNSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ASN
        fields = ['id', 'code', 'warehouse', 'supplier', 'eta', 'is_arrived',
                  'notes', 'created_at', 'updated_at']
        read_only_fields = ['id', 'is_arrived', 'created_at', 'updated_at']


# ─── Action payloads ─────────────────────────────────────────────────────────
class AdjustSerializer(serializers.Serializer):
    bin     = serializers.PrimaryKeyRelatedField(queryset=Bin.objects.all())
    part    = serializers.CharField(required=False, allow_null=True)
    torch   = serializers.CharField(required=False, allow_null=True)
    new_qty = serializers.IntegerField(min_value=0)
    reason  = serializers.CharField(required=False, default='adjust')
    note    = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        if bool(attrs.get('part')) == bool(attrs.get('torch')):
            raise serializers.ValidationError("Phải có đúng một trong part hoặc torch.")
        return attrs


class TransferSerializer(serializers.Serializer):
    from_bin = serializers.PrimaryKeyRelatedField(queryset=Bin.objects.all())
    to_bin   = serializers.PrimaryKeyRelatedField(queryset=Bin.objects.all())
    part     = serializers.CharField(required=False, allow_null=True)
    torch    = serializers.CharField(required=False, allow_null=True)
    qty      = serializers.IntegerField(min_value=1)

    def validate(self, attrs):
        if attrs['from_bin'] == attrs['to_bin']:
            raise serializers.ValidationError("Bin nguồn và đích phải khác nhau.")
        if bool(attrs.get('part')) == bool(attrs.get('torch')):
            raise serializers.ValidationError("Phải có đúng một trong part hoặc torch.")
        return attrs
