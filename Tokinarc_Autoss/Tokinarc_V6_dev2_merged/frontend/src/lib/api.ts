/**
 * Tokinarc frontend — src/lib/api.ts
 * Axios client: gắn JWT vào mọi request, tự refresh khi 401, logout khi refresh fail.
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1'

export const TOKEN_KEY = 'tokinarc_access'
export const REFRESH_KEY = 'tokinarc_refresh'

export const tokens = {
  access: () => localStorage.getItem(TOKEN_KEY),
  refresh: () => localStorage.getItem(REFRESH_KEY),
  set: (access: string, refresh?: string) => {
    localStorage.setItem(TOKEN_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

export const api = axios.create({ baseURL: BASE })

api.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const t = tokens.access()
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})

// Auto-refresh: gặp 401 một lần → thử refresh → retry; fail → clear + về login.
let refreshing: Promise<string | null> | null = null

async function doRefresh(): Promise<string | null> {
  const r = tokens.refresh()
  if (!r) return null
  try {
    const res = await axios.post(`${BASE}/auth/refresh/`, { refresh: r })
    const access = res.data.access as string
    tokens.set(access, res.data.refresh)
    return access
  } catch {
    return null
  }
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const cfg = err.config as InternalAxiosRequestConfig & { _retry?: boolean }
    if (err.response?.status === 401 && cfg && !cfg._retry) {
      cfg._retry = true
      refreshing = refreshing ?? doRefresh()
      const newAccess = await refreshing
      refreshing = null
      if (newAccess) {
        cfg.headers.Authorization = `Bearer ${newAccess}`
        return api(cfg)
      }
      tokens.clear()
      if (location.pathname !== '/login') location.assign('/login')
    }
    return Promise.reject(err)
  },
)

/** Đào sâu vào lỗi validate DRF để tìm CHUỖI lỗi đầu tiên — xử lý cả lỗi
 * serializer lồng nhau (VD dòng hàng PO/Nhập/Xuất/Báo giá: `{lines: [{},
 * {part: ["..."]}]}`), không chỉ field phẳng (`{phone: ["..."]}`). Không có
 * bước này thì gặp lỗi lồng nhau sẽ in ra "[object Object]" vô nghĩa (do gọi
 * String() thẳng lên 1 object thay vì lấy đúng câu lỗi bên trong). */
function _firstErrorString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (Array.isArray(v)) {
    for (const item of v) {
      const found = _firstErrorString(item)
      if (found) return found
    }
    return null
  }
  if (v && typeof v === 'object') {
    for (const val of Object.values(v)) {
      const found = _firstErrorString(val)
      if (found) return found
    }
  }
  return null
}

/** Lấy message lỗi từ response Django (DRF detail / non_field_errors).
 * Luôn trả CHUỖI CÓ NỘI DUNG — không bao giờ rỗng (tránh hiển thị "Lỗi:" trống khi
 * backend chưa chạy / proxy trả body rỗng). */
export function apiError(e: unknown): string {
  const ax = e as AxiosError<any>
  const d = ax.response?.data

  // Body là chuỗi có nội dung (bỏ qua trang HTML lỗi của proxy/server).
  if (typeof d === 'string' && d.trim() && !/^\s*<(!doctype|html)/i.test(d)) {
    return d.trim()
  }
  // DRF chuẩn: {detail} · {non_field_errors} · hoặc lỗi field đầu tiên, kể cả lồng nhau.
  if (d && typeof d === 'object') {
    if (typeof d.detail === 'string' && d.detail.trim()) return d.detail.trim()
    if (Array.isArray(d.non_field_errors) && d.non_field_errors.length) {
      return String(d.non_field_errors[0])
    }
    const found = _firstErrorString(d)
    if (found) return found
  }
  // Không có phản hồi (mất mạng) hoặc proxy trả rỗng vì backend chưa chạy.
  const status = ax.response?.status
  if (ax.code === 'ERR_NETWORK' || !ax.response) {
    return 'Không kết nối được máy chủ — kiểm tra mạng hoặc backend (API) có đang chạy không.'
  }
  if (status && status >= 500) {
    return `Máy chủ gặp sự cố (lỗi ${status}) — thử lại sau, hoặc kiểm tra backend đang chạy.`
  }
  if (status) return `Yêu cầu thất bại (lỗi ${status}).`
  return ax.message || 'Đã có lỗi xảy ra.'
}
