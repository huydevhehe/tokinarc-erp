# Biên bản #11: thuế chuyển từ CẤP PHIẾU (InboundOrder.tax_pct) sang CẤP DÒNG
# (InboundLine.tax_pct) — mỗi mặt hàng có thể khác thuế suất (8%/10%), khớp
# catalog.Part.tax_pct thay vì gộp 1 mức chung cho cả phiếu.
from django.db import migrations, models


def backfill_line_tax_pct(apps, schema_editor):
    """Phiếu NCC cũ đã có tax_pct cấp phiếu -> copy xuống từng dòng trước khi xóa cột cũ."""
    InboundOrder = apps.get_model('wms', 'InboundOrder')
    for order in InboundOrder.objects.exclude(tax_pct__isnull=True):
        order.lines.filter(tax_pct__isnull=True).update(tax_pct=order.tax_pct)


class Migration(migrations.Migration):

    dependencies = [
        ('wms', '0010_inbound_flow_type_tax_delivered_received'),
    ]

    operations = [
        migrations.AddField(
            model_name='inboundline',
            name='tax_pct',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True),
        ),
        migrations.RunPython(backfill_line_tax_pct, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='inboundorder',
            name='tax_pct',
        ),
    ]
