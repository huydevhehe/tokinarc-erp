from django.db import migrations


def seed_capabilities(apps, schema_editor):
    """Seed capability 'purchasing.supplier.create' mới thêm vào CAPABILITY_SEED
    (2026-07-26) — NV kho tự tạo NCC ngay khi lập phiếu nhập kho. Dùng lại đúng
    logic get_or_create của migration 0006/0008/0009 — an toàn chạy lại."""
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
        ('accounts', '0010_po_create_reinclude_wh_manager'),
    ]

    operations = [
        migrations.RunPython(seed_capabilities, noop),
    ]
