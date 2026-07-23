"""
Tokinarc V6 — apps/accounts/capabilities.py

Engine phân quyền function-based (Giai đoạn 1) — nguồn ĐỘNG (DB), thay cho
set cứng trong `roles.py` cho các action đã "wire" vào đây. `roles.py` vẫn
là nguồn cho mọi action CHƯA migrate (không đổi).

Thêm action mới vào engine: thêm 1 dòng vào CAPABILITY_SEED (dev), chạy lại
`seed_capabilities`, rồi gọi `has_capability(user, key)` tại điểm check quyền
trong view. Sau đó admin/CEO tự tick/bỏ tick role nào được làm qua UI —
KHÔNG cần sửa code lần sau cho riêng action đó.
"""
from __future__ import annotations

from .roles import Role, role_of

# key -> (label hiển thị VI, group hiển thị UI, set role được cấp mặc định khi seed).
# Giá trị mặc định PHẢI khớp hành vi hiện tại của code tại thời điểm thêm — seed
# chỉ đổi *nguồn* quyết định, không đổi hành vi ngày deploy.
CAPABILITY_SEED: dict[str, tuple[str, str, frozenset[str]]] = {
    'purchasing.po.create': (
        # #16 biên bản: đọc lại đúng nghĩa đen — biên bản gốc chỉ loại "NV kho"
        # (Role.WAREHOUSE) ra, không hề nhắc "Quản lý kho". Chốt 2026-07-21 từng
        # hiểu nhầm thành loại luôn cả wh_manager — sếp xác nhận lại 2026-07-23:
        # Quản lý kho (wh_manager) VẪN được tạo PO, chỉ NV kho thường là không.
        # KHÔNG có admin (admin chỉ quản trị hệ thống, không làm nghiệp vụ mua hàng).
        'Tạo đơn mua hàng (PO)', 'Mua hàng',
        frozenset({Role.WAREHOUSE_MANAGER, Role.MANAGER, Role.CEO})),
    'purchasing.po.delete': (
        'Xoá đơn mua hàng (PO nháp)', 'Mua hàng',
        frozenset({Role.ADMIN})),
    'crm.lead.delete': (
        'Xoá Lead', 'CRM',
        frozenset({Role.ADMIN})),
    'crm.opportunity.delete': (
        'Xoá Cơ hội', 'CRM',
        frozenset({Role.ADMIN})),
    'crm.quote.delete': (
        'Xoá Báo giá', 'CRM',
        frozenset({Role.ADMIN})),
    'crm.contract.delete': (
        'Xoá Hợp đồng', 'CRM',
        frozenset({Role.ADMIN})),

    # Đợt A — mục #1 biên bản, mở rộng ra các hành động rõ ràng khác (2026-07-21).
    # Seed PHẢI khớp hành vi is_manager()/is_ceo() đang chạy tại thời điểm chuyển
    # đổi — không đổi ai được làm gì, chỉ đổi *nguồn* cấu hình sang DB.
    'sales.order.amend': (
        'Sửa đơn bán (sau ký)', 'Bán hàng',
        frozenset({Role.MANAGER, Role.CEO})),
    'sales.order.create_invoice': (
        'Xuất hóa đơn VAT từ đơn bán', 'Bán hàng',
        frozenset({Role.MANAGER, Role.CEO})),
    'sales.invoice.mark_synced': (
        'Đánh dấu hóa đơn đã đồng bộ MISA', 'Bán hàng',
        frozenset({Role.MANAGER, Role.CEO})),
    'crm.quote.approve': (
        'Duyệt báo giá (cấp 1)', 'CRM',
        frozenset({Role.MANAGER, Role.CEO})),
    'crm.quote.approve_l2': (
        'Duyệt báo giá (cấp 2 — vượt ngưỡng)', 'CRM',
        frozenset({Role.CEO})),
    'crm.quote.reject': (
        'Từ chối báo giá', 'CRM',
        frozenset({Role.MANAGER, Role.CEO})),
    'crm.contract.approve': (
        'Duyệt hợp đồng (cấp 1)', 'CRM',
        frozenset({Role.MANAGER, Role.CEO})),
    'crm.contract.approve_l2': (
        'Duyệt hợp đồng (cấp 2 — vượt ngưỡng)', 'CRM',
        frozenset({Role.CEO})),
    'crm.contract.reject': (
        'Từ chối hợp đồng', 'CRM',
        frozenset({Role.MANAGER, Role.CEO})),
    'purchasing.po.approve': (
        'Duyệt đơn mua hàng (PO)', 'Mua hàng',
        frozenset({Role.MANAGER, Role.CEO})),
    'purchasing.po.reject': (
        'Từ chối đơn mua hàng (PO)', 'Mua hàng',
        frozenset({Role.MANAGER, Role.CEO})),
    'wms.control.write': (
        'Sửa cấu trúc kho (Kho/Khu/Ô)', 'Kho',
        frozenset({Role.WAREHOUSE_MANAGER, Role.MANAGER, Role.CEO})),

    # Đợt B — mục #1 biên bản, phạm vi nhìn dữ liệu (2026-07-21): role nào được
    # xem TẤT CẢ bản ghi (mặc định khớp is_manager() cũ), role không có chỉ
    # thấy bản ghi của mình (sở hữu qua owner/created_owner/customer.owner).
    'crm.customer.view_all': (
        'Xem tất cả khách hàng (không chỉ của mình)', 'CRM',
        frozenset({Role.MANAGER, Role.CEO})),
    'crm.lead.view_all': (
        'Xem tất cả Lead', 'CRM',
        frozenset({Role.MANAGER, Role.CEO})),
    'crm.opportunity.view_all': (
        'Xem tất cả Cơ hội', 'CRM',
        frozenset({Role.MANAGER, Role.CEO})),
    'crm.quote.view_all': (
        'Xem tất cả Báo giá', 'CRM',
        frozenset({Role.MANAGER, Role.CEO})),
    'crm.visit.view_all': (
        'Xem tất cả lịch thăm KH', 'CRM',
        frozenset({Role.MANAGER, Role.CEO})),
    'crm.contract.view_all': (
        'Xem tất cả Hợp đồng', 'CRM',
        frozenset({Role.MANAGER, Role.CEO})),
    'crm.activity.view_all': (
        'Xem tất cả hoạt động chăm sóc KH', 'CRM',
        frozenset({Role.MANAGER, Role.CEO})),
    'crm.ticket.view_all': (
        'Xem tất cả Ticket bảo hành', 'CRM',
        frozenset({Role.MANAGER, Role.CEO, Role.SERVICE})),
    'sales.order.view_all': (
        'Xem tất cả Đơn bán', 'Bán hàng',
        frozenset({Role.MANAGER, Role.CEO})),
    'sales.invoice.view_all': (
        'Xem tất cả Hóa đơn', 'Bán hàng',
        frozenset({Role.MANAGER, Role.CEO})),
    'sales.return_order.view_all': (
        'Xem tất cả phiếu Trả hàng (RMA)', 'Bán hàng',
        frozenset({Role.MANAGER, Role.CEO, Role.WAREHOUSE, Role.WAREHOUSE_MANAGER})),
}


def has_capability(user, key: str) -> bool:
    """True nếu role của user được cấp capability `key` trong DB.

    Không auto-bypass cho admin/CEO — nếu muốn admin luôn được 1 hành động,
    seed phải tick admin=True (đúng tinh thần "admin chỉ quản trị hệ thống").
    """
    from .models import RoleCapabilityGrant

    return RoleCapabilityGrant.objects.filter(
        role=role_of(user), capability__key=key, is_granted=True).exists()
