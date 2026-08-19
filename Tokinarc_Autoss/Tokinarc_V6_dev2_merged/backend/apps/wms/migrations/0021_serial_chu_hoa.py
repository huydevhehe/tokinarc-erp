"""Serial cũ về chữ hoa cho đồng bộ với dữ liệu nhập mới.

Cơ sở dữ liệu phân biệt hoa/thường, nên để lẫn lộn thì 'sn-001' và 'SN-001' là
hai hồ sơ cho cùng một cây hàng: kho đếm thừa, khách mang đi bảo hành tra không
ra. Từ nay mọi serial lưu chữ hoa (xem SerialNumber.save()), migration này kéo
dữ liệu cũ theo cho thống nhất.

Trường hợp hai serial cũ chỉ khác hoa/thường (viết hoa lên sẽ đụng nhau) thì
GIỮ NGUYÊN cả hai và in cảnh báo — không tự gộp, vì gộp là xoá mất một hồ sơ
hàng thật; để người phụ trách kho tự đối chiếu tem rồi quyết.
"""
from django.db import migrations


def len_chu_hoa(apps, schema_editor):
    SerialNumber = apps.get_model('wms', 'SerialNumber')
    da_co = set(SerialNumber.objects.values_list('serial', flat=True))
    doi, dung = 0, []
    for sn in SerialNumber.objects.exclude(serial=None):
        moi = (sn.serial or '').strip().upper()
        if moi == sn.serial:
            continue
        if moi in da_co:
            dung.append((sn.serial, moi))
            continue
        da_co.discard(sn.serial)
        da_co.add(moi)
        sn.serial = moi
        sn.save(update_fields=['serial'])
        doi += 1
    if doi:
        print(f'  -> da chuyen {doi} serial ve chu hoa')
    for cu, moi in dung:
        print(f'  !! GIU NGUYEN "{cu}": viet hoa se dung "{moi}" da co. '
              f'Nho doi chieu tem roi xu ly tay.')


def khong_lam_gi(apps, schema_editor):
    """Không khôi phục được chữ thường gốc — mà cũng không cần."""


class Migration(migrations.Migration):

    dependencies = [
        ('wms', '0020_lot_torch_serialnumber_part_alter_lot_part_and_more'),
    ]

    operations = [
        migrations.RunPython(len_chu_hoa, khong_lam_gi),
    ]