from django.db import migrations


def seed_capabilities(apps, schema_editor):
    """Khởi tạo Capability + RoleCapabilityGrant từ CAPABILITY_SEED — chạy tự
    động lúc migrate, không phụ thuộc bước thủ công (an toàn cho deploy)."""
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
        ('accounts', '0005_capability_rolecapabilitygrant_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_capabilities, noop),
    ]
