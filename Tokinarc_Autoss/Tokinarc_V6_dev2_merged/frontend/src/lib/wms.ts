/**
 * Tokinarc frontend — src/lib/wms.ts
 * Nhãn + tone tag cho enum WMS (khớp apps/wms/models.py).
 */
import type {
  SerialStatus, MovementReason, InboundStatus, OutboundStatus, OutboundRule, OutboundPurpose,
} from '@/lib/types'
import type { TagTone } from '@/lib/crm'

export const SERIAL_STATUS_LABEL: Record<SerialStatus, string> = {
  in_stock: 'Trong kho', reserved: 'Đã giữ', shipped: 'Đã giao',
  sold: 'Đã bán', returned: 'Trả lại', scrapped: 'Hủy',
}
export const SERIAL_STATUS_TONE: Record<SerialStatus, TagTone> = {
  in_stock: 'ok', reserved: 'warn', shipped: 'blue',
  sold: 'purple', returned: 'gray', scrapped: 'danger',
}

export const MOVE_REASON_LABEL: Record<MovementReason, string> = {
  inbound: 'Nhập kho', outbound: 'Xuất kho', adjust: 'Điều chỉnh',
  transfer: 'Chuyển kho', return: 'Trả hàng',
}
export const MOVE_REASON_TONE: Record<MovementReason, TagTone> = {
  inbound: 'ok', outbound: 'danger', adjust: 'warn', transfer: 'blue', return: 'purple',
}

export const INBOUND_STATUS_LABEL: Record<InboundStatus, string> = {
  draft: 'Nháp', confirmed: 'Đã xác nhận', partial: 'Nhận một phần',
  putaway: 'Đã cất kho', cancelled: 'Đã xóa',
}
export const INBOUND_STATUS_TONE: Record<InboundStatus, TagTone> = {
  draft: 'gray', confirmed: 'blue', partial: 'flame', putaway: 'ok', cancelled: 'danger',
}

export const OUTBOUND_STATUS_LABEL: Record<OutboundStatus, string> = {
  draft: 'Nháp', picking: 'Đang soạn', picked: 'Đã soạn xong',
  partial: 'Giao một phần', shipped: 'Đã giao', cancelled: 'Hủy',
}
export const OUTBOUND_STATUS_TONE: Record<OutboundStatus, TagTone> = {
  draft: 'gray', picking: 'warn', picked: 'blue',
  partial: 'flame', shipped: 'ok', cancelled: 'danger',
}

export const RULE_LABEL: Record<OutboundRule, string> = {
  FIFO: 'FIFO (nhập trước xuất trước)', FEFO: 'FEFO (hết hạn trước)', NEAREST: 'Gần nhất',
}

export const OUTBOUND_PURPOSE_LABEL: Record<OutboundPurpose, string> = {
  sale: 'Hàng bán', project: 'Hàng xuất dự án',
}
export const OUTBOUND_PURPOSE_TONE: Record<OutboundPurpose, TagTone> = {
  sale: 'blue', project: 'purple',
}

/** yyyy-MM-dd theo giờ ĐỊA PHƯƠNG — KHÔNG dùng toISOString() (quy đổi UTC làm
 * lệch 1 ngày ở múi giờ Việt Nam, VD 01/07 00:00 local -> 30/06 17:00 UTC). */
export function fmtDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
/** Khoảng ngày cho nút nhanh Tháng/Quý/Năm — FE tự tính, BE chỉ nhận field__gte/field__lte. */
export const DATE_QUICK_RANGES: Record<string, () => [string, string]> = {
  month: () => {
    const n = new Date()
    return [fmtDate(new Date(n.getFullYear(), n.getMonth(), 1)), fmtDate(new Date(n.getFullYear(), n.getMonth() + 1, 0))]
  },
  quarter: () => {
    const n = new Date(); const q = Math.floor(n.getMonth() / 3)
    return [fmtDate(new Date(n.getFullYear(), q * 3, 1)), fmtDate(new Date(n.getFullYear(), q * 3 + 3, 0))]
  },
  year: () => {
    const n = new Date()
    return [fmtDate(new Date(n.getFullYear(), 0, 1)), fmtDate(new Date(n.getFullYear(), 11, 31))]
  },
}
