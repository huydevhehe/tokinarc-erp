/**
 * Tokinarc frontend — src/lib/list.ts
 * Helper truy vấn list DRF: lấy 1 trang, hoặc gom toàn bộ trang (cho dashboard
 * tổng hợp) bằng cách lần theo `next`. Có trần an toàn để tránh quét vô hạn.
 */
import { api } from '@/lib/api'
import type { Paginated } from '@/lib/types'

export const PAGE_SIZE = 20

/** Lấy 1 trang list. */
export async function fetchPage<T>(
  path: string,
  params: Record<string, unknown> = {},
): Promise<Paginated<T>> {
  const res = await api.get<Paginated<T>>(path, { params })
  return res.data
}

/**
 * Gom toàn bộ bản ghi qua nhiều trang (lần theo `next`).
 * `maxPages` chặn trên để dashboard không quét quá nặng (mặc định 25 trang).
 * Mỗi trang xin `page_size` lớn (500, trừ khi caller tự truyền page_size khác)
 * — tránh bug thật đã gặp: danh mục 944 phụ tùng cần 48 trang ở page_size mặc
 * định (20) nên bị maxPages=25 cắt cụt ÂM THẦM giữa chừng (mất ~half, kể cả
 * mặt hàng vừa tạo) trong khi backend cho phép page_size tới 2000/trang.
 */
export async function fetchAll<T>(
  path: string,
  params: Record<string, unknown> = {},
  maxPages = 25,
): Promise<{ items: T[]; count: number; truncated: boolean }> {
  const p = { page_size: 500, ...params }
  const first = await fetchPage<T>(path, { ...p, page: 1 })
  const items = [...first.results]
  let page = 1
  while (first.count > items.length && page < maxPages) {
    page += 1
    const next = await fetchPage<T>(path, { ...p, page })
    items.push(...next.results)
    if (next.results.length === 0) break
  }
  return { items, count: first.count, truncated: first.count > items.length }
}

/** Chỉ lấy tổng số bản ghi (count) — rẻ, dùng cho KPI đếm. */
export async function fetchCount(path: string, params: Record<string, unknown> = {}): Promise<number> {
  const res = await api.get<Paginated<unknown>>(path, { params: { ...params, page: 1 } })
  return res.data.count
}
