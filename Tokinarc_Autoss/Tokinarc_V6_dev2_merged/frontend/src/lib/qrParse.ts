/**
 * Tokinarc frontend — src/lib/qrParse.ts
 * Tách "mã sản phẩm" + "tên sản phẩm" từ nội dung QR — gặp 3 kiểu thực tế
 * (đối chiếu 31 ảnh tem thật trong kho, 2026-08-06):
 *  A) "<mã> ,<tên>"                                        (Tip/Nozzle...)
 *  B) "#<id>,<mã>  ,<tên tiếng Nhật> ,<tên tiếng Anh...>    (Torch Body...)
 *     ,<SL> ,<mã bản vẽ> ,<lô>" — nhận biết qua tiền tố "#" ở đầu.
 *  C) "<mã> ,<mã> ,<tên tiếng Nhật> ,<tên tiếng Anh> ,..."  (Ruột gà/Liner...)
 *     — y hệt bố cục B nhưng đoạn đầu LẶP LẠI mã thay vì mã kho "#G...".
 * Mã 1 đoạn (không có dấu phẩy, VD "YMSA15392") thì trả null — không đoán bừa.
 * Dùng chung cho trang Gán mã vạch/QR (quét lẻ + gán hàng loạt).
 */

// Tách theo dấu phẩy nhưng GIỮ NGUYÊN đoạn nằm trong ngoặc — tên tiếng Anh
// kiểu B có thể chứa dấu phẩy bên trong ngoặc (VD "(Type A2, w/o Tip Body)"),
// tách thô sẽ cắt đôi tên sai.
function splitRespectingParens(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else { cur += ch }
  }
  parts.push(cur)
  return parts.map((s) => s.trim())
}

export function guessPartFromQr(text: string): { tokin_part_no: string; display_name_vi: string } | null {
  const segs = splitRespectingParens(text)
  if (segs.length < 2) return null
  // Kiểu B có 2 biến thể, cùng bố cục (mã ở đoạn 2, tên ở đoạn 3+4), chỉ khác
  // đoạn 1: hoặc là mã kho "#G000…", hoặc LẶP LẠI luôn mã sản phẩm (gặp ở tem
  // ruột gà: "016128 ,016128 ,ﾗｲﾅ… ,Liner…"). Không nhận diện biến thể lặp mã
  // thì nó rơi vào kiểu A và lấy nhầm đoạn 2 (chính là mã) làm TÊN sản phẩm.
  const isLongForm = segs.length >= 4 && (segs[0].startsWith('#') || segs[0] === segs[1])
  if (isLongForm) {
    // Kiểu B (nhiều trường) — mã ở đoạn 2; tên thì lưu GỘP CẢ 2 (tiếng Nhật ở
    // đoạn 3 + tiếng Anh ở đoạn 4) vào 1 ô "Tên sản phẩm" theo yêu cầu sếp —
    // kỹ sư cần thấy tên gốc tiếng Nhật lẫn tên tiếng Anh cùng lúc.
    const code = segs[1] ?? ''
    const name = [segs[2], segs[3]].filter(Boolean).join(' / ')
    if (!code) return null
    return { tokin_part_no: code, display_name_vi: name }
  }
  // Kiểu A (đơn giản, 2 trường).
  return { tokin_part_no: segs[0], display_name_vi: segs[1] ?? '' }
}
