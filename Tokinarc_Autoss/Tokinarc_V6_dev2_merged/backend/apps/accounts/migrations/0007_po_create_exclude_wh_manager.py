from django.db import migrations


def fix_po_create_seed(apps, schema_editor):
    """#16 biên bản (2026-07-21): 'Quản lý kho' (wh_manager) không còn được tạo
    PO — chỉ 'Quản lý' (manager) + CEO. `seed_capabilities`/migration 0006 chỉ
    TẠO MỚI grant còn thiếu (không ghi đè grant đã có, để giữ tuỳ chỉnh của
    admin qua UI) — nên đổi default ở CAPABILITY_SEED không tự cập nhật DB đã
    seed trước đó. Migration này sửa đúng 1 dòng dữ liệu bị lệch do đổi chính
    sách, không phải seed lại toàn bộ."""
    RoleCapabilityGrant = apps.get_model('accounts', 'RoleCapabilityGrant')
    RoleCapabilityGrant.objects.filter(
        role='wh_manager', capability__key='purchasing.po.create',
    ).update(is_granted=False)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0006_seed_capabilities'),
    ]

    operations = [
        migrations.RunPython(fix_po_create_seed, noop),
    ]
