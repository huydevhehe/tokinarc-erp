/**
 * Tokinarc frontend — src/lib/partArchiveConflict.ts
 *
 * Tạo sản phẩm mới mà mã trùng với một sản phẩm ĐÃ XOÁ (chỉ bị ẩn, dòng cũ vẫn
 * nằm trong hệ thống) — backend trả 409 PART_HIDDEN_EXISTS thay vì chặn cứng.
 * Ở đây hỏi lại người dùng 1 câu, đồng ý thì gửi lại kèm archive_existing để
 * backend dời sản phẩm cũ sang mã lưu trữ rồi tạo mới bình thường.
 *
 * Trước đây gặp ca này là ngõ cụt: quét tem hàng đã xoá → báo "chưa có" → bấm
 * Thêm mới → lỗi "mã đã tồn tại", không gán được mà cũng không tạo được.
 * Dùng chung cho form Sửa/Thêm phụ tùng và modal "Thêm nhanh" lúc quét mã.
 */
import type { AxiosError } from 'axios'

export interface PartHiddenConflict {
  code: 'PART_HIDDEN_EXISTS'
  part_no: string
  display_name_vi: string
  stock_qty: number
  archived_code: string
}

/** Lỗi này có phải "trùng mã với hàng đã xoá" không (khác với trùng mã hàng
 *  đang dùng — ca đó vẫn chặn thật). */
export function asHiddenPartConflict(e: unknown): PartHiddenConflict | null {
  const res = (e as AxiosError<PartHiddenConflict>).response
  if (res?.status === 409 && res.data?.code === 'PART_HIDDEN_EXISTS') return res.data
  return null
}

/** Câu hỏi xác nhận — nói rõ chuyện gì sắp xảy ra, kể cả tồn kho sẽ mất khỏi sổ. */
export function confirmArchiveExisting(c: PartHiddenConflict): boolean {
  const canhBaoTon = c.stock_qty > 0
    ? `\n⚠ Sản phẩm cũ đang có ${c.stock_qty} tồn kho — sau khi chuyển, số này sẽ KHÔNG còn hiển thị ở tồn kho nữa.\n`
    : ''
  return confirm(
    `Mã "${c.part_no}" đang thuộc sản phẩm "${c.display_name_vi}" đã bị xoá.\n`
    + `${canhBaoTon}\n`
    + `Hệ thống sẽ chuyển sản phẩm cũ sang mã lưu trữ "${c.archived_code}" để giải phóng mã này, `
    + `rồi tạo sản phẩm mới hoàn toàn sạch.\n\n`
    + `Chứng từ nhập/xuất cũ vẫn giữ nguyên nhưng sẽ hiện theo mã lưu trữ.\n\nTiếp tục?`,
  )
}
