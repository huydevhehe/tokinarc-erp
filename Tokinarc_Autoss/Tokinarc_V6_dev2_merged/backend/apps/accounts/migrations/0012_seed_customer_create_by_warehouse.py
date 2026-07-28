from django.db import migrations


def seed_capabilities(apps, schema_editor):
    """Seed capability 'crm.customer.create_by_warehouse' mới thêm vào
    CAPABILITY_SEED (2026-07-28) — NV kho/QL kho tự tạo KH lẻ ngay lúc lập
    phiếu xuất kho. Dùng lại đúng logic get_or_create của các migration seed
    trước — an toàn chạy lại."""
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
        ('accounts', '0011_seed_supplier_create_capability'),
    ]

    operations = [
        migrations.RunPython(seed_capabilities, noop),
    ]
