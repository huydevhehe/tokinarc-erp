"""
Tokinarc V6 — apps/crm/duplicate_check.py

Mục #7 biên bản PMQL: kiểm tra trùng khách hàng giữa các sale — theo SĐT
(Contact.phone) hoặc MST (Customer.tax_code). Dùng chung cho tạo tay
(CustomerViewSet) và Import Excel (imports.py) để không lệch logic.

Không phải hard-unique-constraint — trả về danh sách nghi trùng, người gọi
tự quyết định chặn hay chỉ cảnh báo (FE có thể cho "vẫn tạo" qua allow_duplicate).
"""
from __future__ import annotations

from .models import Contact, Customer


def find_duplicate_customers(*, tax_code: str = '', phone: str = '',
                              exclude_pk=None) -> list[Customer]:
    """Trả list Customer (không trùng lặp) khớp tax_code HOẶC phone (qua Contact).
    exclude_pk: bỏ qua chính bản ghi đang sửa (dùng khi update)."""
    matches: dict = {}
    tax_code = (tax_code or '').strip()
    phone = (phone or '').strip()

    if tax_code:
        qs = Customer.objects.filter(tax_code=tax_code)
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        for c in qs:
            matches[c.pk] = c

    if phone:
        qs = Contact.objects.filter(phone=phone).select_related('customer')
        if exclude_pk:
            qs = qs.exclude(customer_id=exclude_pk)
        for ct in qs:
            matches[ct.customer_id] = ct.customer

    return list(matches.values())
