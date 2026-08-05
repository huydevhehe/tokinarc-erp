/**
 * Tokinarc frontend — src/components/CameraScanner.tsx
 * Khung quét barcode/QR bằng camera điện thoại (zxing-wasm). Tái dùng cho:
 *   - Trang Quét mã (lẻ) và modal Quét theo phiếu Nhập/Xuất.
 * Mỗi lần đọc trúng mã → gọi onScan(code, kind) + bíp + flash. Camera cần HTTPS/localhost.
 * kind: 'qr' (họ QRCode/MicroQR/RMQR) hay 'barcode' (mọi symbology còn lại —
 * Code128/EAN13/DataMatrix/PDF417...) — zxing-wasm tự phân loại được, không
 * cần đoán từ nội dung mã.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { readBarcodes, prepareZXingModule } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { Camera, CameraOff, Upload } from 'lucide-react'
import { Button } from '@/components/ui'

// Nạp WASM từ bundle local (kho có thể offline — không phụ thuộc CDN).
prepareZXingModule({ overrides: { locateFile: (p, prefix) => (p.endsWith('.wasm') ? wasmUrl : prefix + p) } })

export type ScanKind = 'qr' | 'barcode'
const kindOf = (symbology: string): ScanKind => (symbology === 'QRCode' ? 'qr' : 'barcode')

export function CameraScanner({ onScan, onMultiScan }: {
  onScan: (code: string, kind: ScanKind) => void
  // Chỉ áp dụng cho "Tải ảnh lên" (ảnh tĩnh) — 1 tấm hình có thể chụp cả 2 tem
  // (QR + Barcode) trên cùng 1 hộp. Nếu ảnh đọc ra ≥2 mã KHÁC loại, gọi
  // onMultiScan thay vì onScan để nơi gọi tự điền đủ cả 2 ô 1 lượt.
  onMultiScan?: (results: { code: string; kind: ScanKind }[]) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const onScanRef = useRef(onScan); onScanRef.current = onScan
  const [scanning, setScanning] = useState(false)
  const [camError, setCamError] = useState('')
  const [hit, setHit] = useState('')   // mã vừa quét — flash "✓ đã quét"
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Camera chỉ chạy ở "secure context" (HTTPS / localhost).
  const cameraReady = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setScanning(false)
  }, [])
  useEffect(() => () => stop(), [stop])   // dọn camera khi rời

  const beep = () => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.frequency.value = 880; g.gain.value = 0.08
      o.start(); o.stop(ctx.currentTime + 0.12)
      setTimeout(() => ctx.close(), 200)
    } catch { /* trình duyệt chặn audio — bỏ qua */ }
  }

  const scanLoop = () => {
    const canvas = canvasRef.current ?? (canvasRef.current = document.createElement('canvas'))
    let reading = false
    // Chống quét trùng theo VỊ TRÍ (còn thấy mã hay không), không theo số khung
    // hình: giữ camera đứng yên trên cùng 1 mã bao lâu cũng chỉ tính 1 lần —
    // phải đưa mã ra khỏi khung (hoặc đổi mã khác) rồi đưa lại mới tính là quét
    // mới. Đếm theo THỜI GIAN THỰC (ms) chứ không đếm số khung: đếm khung phụ
    // thuộc tốc độ xử lý từng máy (máy yếu/camera rung nhẹ đã đủ rớt quá vài
    // khung, hiểu nhầm "đã rời mã" rồi bắn lại onScan dù không di chuyển đi
    // đâu — đúng lỗi tester báo "nhúc nhích nhẹ là thông báo nhảy liên tục").
    let lastText = ''
    let lastSeenAt = 0
    const LOST_MS = 1200   // phải mất dấu mã liên tục >1.2s mới coi là "đã rời mã" — đủ trừ hao rung tay/mờ thoáng qua
    const tick = async () => {
      const v = videoRef.current
      if (!v || v.readyState < 2 || !streamRef.current) { rafRef.current = requestAnimationFrame(tick); return }
      if (!reading) {
        reading = true
        try {
          canvas.width = v.videoWidth; canvas.height = v.videoHeight
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const results = await readBarcodes(img, { tryHarder: true, maxNumberOfSymbols: 1 })
          const text = results[0]?.text
          const now = performance.now()
          if (text) {
            lastSeenAt = now
            if (text !== lastText) {
              lastText = text
              beep(); setHit(text); setTimeout(() => setHit(''), 1300)
              onScanRef.current(text, kindOf(results[0].symbology))
            }
          } else if (lastText && now - lastSeenAt > LOST_MS) {
            lastText = ''
          }
        } catch { /* bỏ qua frame lỗi */ }
        reading = false
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  // Tải ảnh có sẵn lên (chụp trước đó / ảnh chép từ máy khác) — đọc thẳng mã
  // vạch/QR trong ảnh tĩnh, không cần camera trực tiếp. Dùng chung 1 luồng
  // readBarcodes như quét camera (zxing-wasm nhận Blob/File luôn).
  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''   // cho chọn lại đúng file cũ nếu cần
    if (!file) return
    setUploading(true)
    try {
      // maxNumberOfSymbols > 1: 1 tấm ảnh có thể chụp cả tem QR lẫn Barcode
      // trên cùng 1 hộp — đọc hết ra, không chỉ lấy mã đầu tiên thấy được.
      const results = await readBarcodes(file, { tryHarder: true, maxNumberOfSymbols: 4 })
      const found = results.filter((r) => r.text)
      if (found.length === 0) { setCamError('Không đọc được mã vạch/QR trong ảnh này — thử ảnh rõ nét hơn.'); return }
      setCamError('')
      const first = found[0]
      beep(); setHit(found.map((r) => r.text).join('  +  ')); setTimeout(() => setHit(''), 1300)
      if (found.length > 1 && onMultiScan) {
        onMultiScan(found.map((r) => ({ code: r.text, kind: kindOf(r.symbology) })))
      } else {
        onScanRef.current(first.text, kindOf(first.symbology))
      }
    } catch {
      setCamError('Không đọc được mã vạch/QR trong ảnh này — thử ảnh rõ nét hơn.')
    } finally {
      setUploading(false)
    }
  }

  const start = async () => {
    setCamError('')
    if (!cameraReady) {
      setCamError('Camera bị chặn vì trang chạy HTTP. Chỉ chạy khi mở https://… hoặc localhost — '
        + 'tạm thời nhập mã bằng tay hoặc dùng máy quét USB.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      streamRef.current = stream
      const v = videoRef.current!
      v.srcObject = stream
      v.setAttribute('playsinline', 'true')
      await v.play()
      setScanning(true)
      scanLoop()
    } catch (e) {
      setCamError(e instanceof Error ? e.message : 'Không mở được camera.')
      stop()
    }
  }

  return (
    <div>
      <div className="aspect-video bg-ink rounded-lg overflow-hidden grid place-items-center relative">
        <video ref={videoRef} className={`w-full h-full object-cover ${scanning ? '' : 'hidden'}`} />
        {!scanning && cameraReady && (
          <button onClick={start} className="flex flex-col items-center gap-2 text-txt-2 hover:text-flame text-sm">
            <Camera size={28} /> Bật camera quét
          </button>
        )}
        {!scanning && !cameraReady && (
          <div className="text-txt-2 text-xs flex flex-col items-center gap-2 px-6 text-center">
            <CameraOff size={28} className="text-warn" />
            <span>Camera bị chặn (cần <b>HTTPS</b>). Nhập mã bằng tay bên dưới.</span>
          </div>
        )}
        {scanning && (
          <>
            <div className="absolute inset-0 pointer-events-none grid place-items-center">
              <div className="relative w-[72%] h-[58%] rounded-lg border-2 border-flame/50">
                <span className="absolute -top-0.5 -left-0.5 w-5 h-5 border-t-4 border-l-4 border-flame rounded-tl" />
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 border-t-4 border-r-4 border-flame rounded-tr" />
                <span className="absolute -bottom-0.5 -left-0.5 w-5 h-5 border-b-4 border-l-4 border-flame rounded-bl" />
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 border-b-4 border-r-4 border-flame rounded-br" />
                <div className="absolute inset-x-1 h-0.5 bg-flame shadow-[0_0_8px_2px] shadow-flame/70 animate-scanline" />
              </div>
            </div>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[11px] bg-ink/75 text-flame px-2.5 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-flame animate-pulse" /> Đang quét… đưa mã vào khung
            </div>
          </>
        )}
        {hit && (
          <div className="absolute inset-0 grid place-items-center bg-ok/25 pointer-events-none">
            <div className="bg-ok text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg">
              ✓ {hit}
            </div>
          </div>
        )}
      </div>
      {camError && <p className="text-danger text-xs mt-1.5">{camError}</p>}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
        <Button variant="ghost" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          <Upload size={13} /> {uploading ? 'Đang đọc ảnh…' : 'Tải ảnh lên'}
        </Button>
        {scanning && (
          <Button variant="ghost" size="sm" onClick={stop}><CameraOff size={13} /> Dừng camera</Button>
        )}
      </div>
    </div>
  )
}
