"""
Tokinarc V6 — apps/catalog/management/commands/consolidate_product_groups.py

Gom TẤT CẢ sản phẩm (Part) về đúng 1 Nhóm sản phẩm duy nhất (mặc định "Tokinarc"),
rồi xoá hết các Nhóm/Danh mục cũ (những nhóm "ảo" như D, N, OTC, TCC, Binzel,
Chung, "test thêm nhóm"... đang bị lẫn lộn trên Tồn kho theo nhóm).

Súng hàn (Torch) KHÔNG bị đụng — Torch gộp nhóm theo field `family` riêng,
không thuộc hệ Nhóm/Danh mục này (xem models.py).

Chạy (mặc định CHỈ XEM sẽ đổi/xoá gì, chưa đụng gì thật):
    python manage.py consolidate_product_groups
Chạy thật:
    python manage.py consolidate_product_groups --yes
Đổi tên nhóm/danh mục đích (mặc định Nhóm "Tokinarc", Danh mục "Chung"):
    python manage.py consolidate_product_groups --yes --group "Tokinarc" --category "Chung"
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.catalog.models import Part, ProductCategory, ProductGroup


class Command(BaseCommand):
    help = ('Gom tất cả Part về đúng 1 Nhóm sản phẩm (mặc định "Tokinarc"), '
            'xoá hết các Nhóm/Danh mục cũ.')

    def add_arguments(self, parser):
        parser.add_argument('--yes', action='store_true',
                             help='Xác nhận làm thật. Không có cờ này chỉ in ra sẽ đổi/xoá bao nhiêu, không đụng gì.')
        parser.add_argument('--group', default='Tokinarc', help='Tên Nhóm sản phẩm đích (mặc định "Tokinarc").')
        parser.add_argument('--category', default='Chung', help='Tên Danh mục đích trong nhóm đó (mặc định "Chung").')

    def handle(self, yes, group, category, **opts):
        old_groups = list(ProductGroup.objects.exclude(name=group))
        total_parts = Part.objects.count()
        already_target = Part.objects.filter(product_category__group__name=group).count()

        self.stdout.write(f'Nhóm đích: "{group}" > Danh mục "{category}"')
        self.stdout.write(f'Tổng số Part trong hệ thống: {total_parts}')
        self.stdout.write(f'  - Sẽ gắn lại vào nhóm đích: {total_parts - already_target}')
        self.stdout.write(f'  - Đã ở đúng nhóm đích từ trước: {already_target}')
        self.stdout.write(f'Nhóm/Danh mục cũ sẽ bị xoá ({len(old_groups)}):')
        for g in old_groups:
            self.stdout.write(f'  - "{g.name}" ({g.categories.count()} danh mục con)')

        if not yes:
            self.stdout.write(self.style.WARNING(
                '\nCHƯA đụng gì — chạy lại kèm --yes để thực hiện thật.'))
            return

        with transaction.atomic():
            target_group, _ = ProductGroup.objects.get_or_create(name=group)
            target_category, _ = ProductCategory.objects.get_or_create(
                group=target_group, name=category)
            updated = Part.objects.exclude(product_category=target_category).update(
                product_category=target_category)
            deleted_groups, _ = ProductGroup.objects.exclude(pk=target_group.pk).delete()

        self.stdout.write(self.style.SUCCESS(
            f'\nXong: {updated} sản phẩm đã gắn vào "{group}" > "{category}"; '
            f'đã xoá {len(old_groups)} nhóm cũ (kèm danh mục con).'))
