// Local-timezone date helpers. `toISOString().slice(0,10)` is UTC-based and
// would report the wrong day in early-morning hours (China is UTC+8).

export function formatLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function localDateStr(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return formatLocal(d)
}

export function isoToLocalDateStr(iso: string): string {
  return formatLocal(new Date(iso))
}

export function fmtDateCN(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const date = new Date(y, m - 1, d)
  return `${m}月${d}日 周${weekdays[date.getDay()]}`
}
