from django.db import migrations


def seed_capabilities(apps, schema_editor):
    """Đợt A (mục #1 biên bản, 2026-07-21) — seed các capability mới thêm vào
    CAPABILITY_SEED (Đơn bán/Hóa đơn/Báo giá/Hợp đồng/PO/Kho). Dùng lại đúng
    logic get_or_create của migration 0006 — an toàn chạy lại, không tạo trùng
    và không đụng tới các capability đã seed trước đó."""
    from apps.accounts.capabilities import CAPABILITY_SEED
    from apps.accounts.roles import ALL_ROLES

    Capability = apps.get_model('accounts', 'Capability')
    RoleCapabilityGrant = apps.get_model('accounts', 'RoleCapabilityGrant')

    for key, (label, group, default_roles) in CAPABILITY_SEED.items():
        cap, _ = Capability.objects.get_or_create(
            key=key, defaults={'label': label, 'group': group})
        for role in ALL_ROLES:
            RoleCapabilityGrant.objects.get_or_create(
                role=role, capability=cap,
                defaults={'is_granted': role in default_roles})


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0007_po_create_exclude_wh_manager'),
    ]

    operations = [
        migrations.RunPython(seed_capabilities, noop),
    ]
