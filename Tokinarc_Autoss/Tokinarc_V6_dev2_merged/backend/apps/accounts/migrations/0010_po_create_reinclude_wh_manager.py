from django.db import migrations


def fix_po_create_seed(apps, schema_editor):
    """#16 biên bản: sếp xác nhận lại 2026-07-23 — biên bản gốc chỉ loại "NV kho"
    (Role.WAREHOUSE) khỏi quyền tạo PO, không hề nhắc "Quản lý kho". Migration
    0007 (2026-07-21) đã hiểu nhầm thành loại luôn wh_manager — cấp lại quyền
    này cho wh_manager. Ghi thẳng is_granted=True (giống cách 0007 sửa lệch),
    không seed lại toàn bộ."""
    RoleCapabilityGrant = apps.get_model('accounts', 'RoleCapabilityGrant')
    RoleCapabilityGrant.objects.filter(
        role='wh_manager', capability__key='purchasing.po.create',
    ).update(is_granted=True)


def reverse(apps, schema_editor):
    RoleCapabilityGrant = apps.get_model('accounts', 'RoleCapabilityGrant')
    RoleCapabilityGrant.objects.filter(
        role='wh_manager', capability__key='purchasing.po.create',
    ).update(is_granted=False)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0009_seed_capabilities_batch_b'),
    ]

    operations = [
        migrations.RunPython(fix_po_create_seed, reverse),
    ]
