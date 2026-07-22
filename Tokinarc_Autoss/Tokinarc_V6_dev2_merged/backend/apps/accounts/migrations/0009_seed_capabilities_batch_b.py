from django.db import migrations


def seed_capabilities(apps, schema_editor):
    """Đợt B (mục #1 biên bản, 2026-07-21) — seed capability phạm vi nhìn dữ
    liệu (view_all) mới thêm vào CAPABILITY_SEED. Dùng lại đúng logic
    get_or_create của migration 0006/0008 — an toàn chạy lại."""
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
        ('accounts', '0008_seed_capabilities_batch_a'),
    ]

    operations = [
        migrations.RunPython(seed_capabilities, noop),
    ]
