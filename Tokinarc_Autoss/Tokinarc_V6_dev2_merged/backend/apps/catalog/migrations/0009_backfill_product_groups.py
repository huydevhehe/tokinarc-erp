"""
Backfill Nhóm/Danh mục sản phẩm từ dữ liệu cũ (Part.ecosystem / Part.category).

Tạo ProductGroup theo từng giá trị `ecosystem` khác rỗng, ProductCategory theo
từng cặp (ecosystem, category), rồi gắn Part.product_category tương ứng — để
nhân viên không phải phân loại lại 800+ sản phẩm từ đầu. Tên Nhóm/Danh mục lấy
nguyên chuỗi cũ; người dùng có thể đổi tên/sắp xếp lại sau qua giao diện.

Part có ecosystem hoặc category rỗng → để chưa phân loại (product_category=null).
Reverse: gỡ toàn bộ liên kết + xoá Nhóm/Danh mục sinh ra (an toàn, không đụng
ecosystem/category cũ).
"""
from django.db import migrations


def backfill(apps, schema_editor):
    Part = apps.get_model('catalog', 'Part')
    ProductGroup = apps.get_model('catalog', 'ProductGroup')
    ProductCategory = apps.get_model('catalog', 'ProductCategory')

    # Cặp (ecosystem, category) phân biệt, bỏ giá trị rỗng.
    pairs = (Part.objects.exclude(ecosystem='').exclude(category='')
             .values_list('ecosystem', 'category').distinct())

    group_cache: dict[str, object] = {}
    cat_cache: dict[tuple[str, str], object] = {}
    for eco, cat in pairs:
        eco = (eco or '').strip()
        cat = (cat or '').strip()
        if not eco or not cat:
            continue
        group = group_cache.get(eco)
        if group is None:
            group, _ = ProductGroup.objects.get_or_create(name=eco)
            group_cache[eco] = group
        key = (eco, cat)
        if key not in cat_cache:
            category, _ = ProductCategory.objects.get_or_create(group=group, name=cat)
            cat_cache[key] = category

    # Gắn từng Part vào đúng Danh mục theo (ecosystem, category) của nó.
    for (eco, cat), category in cat_cache.items():
        Part.objects.filter(ecosystem=eco, category=cat).update(product_category=category)


def unbackfill(apps, schema_editor):
    Part = apps.get_model('catalog', 'Part')
    ProductGroup = apps.get_model('catalog', 'ProductGroup')
    Part.objects.update(product_category=None)
    ProductGroup.objects.all().delete()   # CASCADE xoá luôn ProductCategory


class Migration(migrations.Migration):
    dependencies = [
        ('catalog', '0008_productcategory_productgroup_part_product_category_and_more'),
    ]
    operations = [migrations.RunPython(backfill, unbackfill)]
