"""
Test lệnh `manage.py consolidate_product_groups` — gom tất cả Part về đúng 1
Nhóm sản phẩm duy nhất, xoá hết Nhóm/Danh mục cũ.
"""
from __future__ import annotations

from io import StringIO

import pytest
from django.core.management import call_command

from apps.catalog.models import Part, ProductCategory, ProductGroup


def _make_junk_groups():
    for name in ['D', 'N', 'OTC', 'Binzel']:
        g = ProductGroup.objects.create(name=name)
        cat = ProductCategory.objects.create(group=g, name=f'{name} cat')
        Part.objects.create(tokin_part_no=f'{name}-001', category='Tip',
                            display_name_vi=f'Part {name}', product_category=cat)
    # 1 part chưa phân loại (product_category=None)
    Part.objects.create(tokin_part_no='NONE-001', category='Tip', display_name_vi='Chưa phân loại')


@pytest.mark.django_db
def test_dry_run_does_not_change_anything():
    _make_junk_groups()
    out = StringIO()
    call_command('consolidate_product_groups', stdout=out)
    assert ProductGroup.objects.count() == 4   # chưa xoá gì
    assert not ProductGroup.objects.filter(name='Tokinarc').exists()
    assert 'CHƯA đụng gì' in out.getvalue()


@pytest.mark.django_db
def test_yes_moves_all_parts_and_deletes_old_groups():
    _make_junk_groups()
    call_command('consolidate_product_groups', '--yes')

    assert ProductGroup.objects.count() == 1
    group = ProductGroup.objects.get(name='Tokinarc')
    category = ProductCategory.objects.get(group=group, name='Chung')

    assert Part.objects.count() == 5   # không mất sản phẩm nào
    for p in Part.objects.all():
        assert p.product_category_id == category.id

    # Nhóm/danh mục cũ đã bị xoá sạch.
    assert not ProductGroup.objects.filter(name__in=['D', 'N', 'OTC', 'Binzel']).exists()
    assert ProductCategory.objects.filter(group=group).count() == 1


@pytest.mark.django_db
def test_custom_group_and_category_names():
    _make_junk_groups()
    call_command('consolidate_product_groups', '--yes', '--group', 'MyGroup', '--category', 'MyCat')
    assert ProductGroup.objects.count() == 1
    group = ProductGroup.objects.get(name='MyGroup')
    assert ProductCategory.objects.get(group=group, name='MyCat')
    assert Part.objects.count() == 5


@pytest.mark.django_db
def test_idempotent_running_twice():
    _make_junk_groups()
    call_command('consolidate_product_groups', '--yes')
    call_command('consolidate_product_groups', '--yes')   # chạy lại không lỗi, không đổi gì thêm
    assert ProductGroup.objects.count() == 1
    assert Part.objects.count() == 5
