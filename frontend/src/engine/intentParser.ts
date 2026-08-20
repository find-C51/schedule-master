// Intent parser — converts natural language text into structured task lists.
// Ported 1:1 from backend/engine/intent_parser.py so the app runs fully offline.

export interface ParsedTask {
  title: string
  task_type: 'fixed' | 'flexible' | 'protected'
  priority: 'urgent' | 'normal' | 'low'
  estimated_minutes: number
  time_hint: string | null
}

// ── Type/priority keywords ──
const FIXED_KEYWORDS = ['课', '上课', '开会', '组会', '班会', '考试', '答辩', '家教', '兼职', '值班', '实习']
const PROTECTED_KEYWORDS = ['吃饭', '午饭', '晚饭', '早餐', '午餐', '晚餐', '午休', '午睡', '睡觉', '休息', '洗漱']
const URGENT_KEYWORDS = ['今天截止', '明天截止', 'ddl', '截止', '赶紧', '马上', '必须', '急', '尽快']
const LOW_KEYWORDS = ['取快递', '打印', '顺路', '顺便', '有空再', '不急']

// ── Period-to-time mapping ──
const PERIOD_MAP: Record<string, string> = {
  一: '08:00', 二: '10:00', 三: '10:00',
  四: '10:00', 五: '14:00', 六: '14:00',
  七: '16:00', 八: '16:00', 九: '19:00',
}

// Chinese numeral to int
const CN_NUM: Record<string, number> = {
  一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12,
}

function toInt(s: string): number {
  s = s.trim()
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  return CN_NUM[s] ?? 0
}

// A time atom like "8点", "8点30", "8点30分", "7点半", "12时"
const TIME_ATOM = '[0-9一二两三四五六七八九十]+[点时](?:[0-9一二两三四五六七八九十半]+分?)?'

function parseTimeAtom(s: string): [number, number] {
  s = s.trim()
  const m = s.match(/^([0-9一二两三四五六七八九十]+)[点时](?:([0-9一二两三四五六七八九十半]+)分?)?/)
  if (!m) return [0, 0]
  const hour = toInt(m[1])
  const minuteStr = m[2]
  let minute = 0
  if (minuteStr == null || minuteStr === '') minute = 0
  else if (minuteStr === '半') minute = 30
  else minute = toInt(minuteStr)
  return [hour, minute]
}

function applyPeriod(prefix: string, h: number): number {
  if ((prefix === '下午' || prefix === '晚上') && h <= 11) return h + 12
  return h
}

function getPeriodPrefix(text: string): string {
  for (const p of ['凌晨', '早上', '上午', '中午', '下午', '晚上']) {
    if (text.includes(p)) return p
  }
  return ''
}

const DUR_PATTERNS: Array<{ re: RegExp; extract: (m: RegExpMatchArray) => number }> = [
  { re: /一个半小?时/, extract: () => 90 },
  { re: /两个半小?时/, extract: () => 150 },
  { re: /(\d+)\s*分[钟钟]/, extract: (m) => parseInt(m[1], 10) },
  { re: /(\d+)\s*(?:个)?(?:小?时|小时)/, extract: (m) => parseInt(m[1], 10) * 60 },
  { re: /半小?时/, extract: () => 30 },
  { re: /(一|两|二)\s*个?\s*小?时/, extract: (m) => (m[1] === '一' ? 60 : 120) },
]

function findDuration(text: string): number {
  for (const { re, extract } of DUR_PATTERNS) {
    const m = text.match(re)
    if (m) {
      try {
        return extract(m)
      } catch {
        continue
      }
    }
  }
  return 0
}

function periodToTime(periodChars: string): string | null {
  if (periodChars && periodChars[0] in PERIOD_MAP) return PERIOD_MAP[periodChars[0]]
  return null
}

function extractTimeAndDuration(text: string): { start: string | null; duration: number } {
  const prefix = getPeriodPrefix(text)

  // ── Pattern A: adjacent range "8点到10点" / "8点30到9点50" ──
  let m = text.match(new RegExp('(' + TIME_ATOM + ')\\s*[到至\\-～~]\\s*(' + TIME_ATOM + ')'))
  if (m) {
    const [h1, m1] = parseTimeAtom(m[1])
    const [h2, m2] = parseTimeAtom(m[2])
    if (h1 > 0 && h2 > 0) {
      let hh1 = applyPeriod(prefix, h1)
      let hh2 = applyPeriod(prefix, h2)
      const start = `${pad(hh1)}:${pad(m1)}`
      let duration = hh2 * 60 + m2 - (hh1 * 60 + m1)
      if (duration < 0) duration += 12 * 60
      duration = Math.max(30, duration)
      return { start, duration }
    }
  }

  // ── Pattern B: range with task in middle "8点上数学课到9点40" ──
  m = text.match(new RegExp('(' + TIME_ATOM + ')\\s*(.+?)\\s*[到至]\\s*(' + TIME_ATOM + ')'))
  if (m) {
    const [h1, m1] = parseTimeAtom(m[1])
    const [h2, m2] = parseTimeAtom(m[3])
    const middle = m[2]
    if (h1 > 0 && h2 > 0 && middle.length <= 15 && !new RegExp(TIME_ATOM).test(middle)) {
      let hh1 = applyPeriod(prefix, h1)
      let hh2 = applyPeriod(prefix, h2)
      const start = `${pad(hh1)}:${pad(m1)}`
      let duration = hh2 * 60 + m2 - (hh1 * 60 + m1)
      if (duration < 0) duration += 12 * 60
      duration = Math.max(30, duration)
      return { start, duration }
    }
  }

  // ── Find a standalone start time (single time, no range) ──
  let start: string | null = null

  // Pattern C: with period prefix "下午3点" / "晚上7点半"
  m = text.match(new RegExp('(?:凌晨|早上|上午|中午|下午|晚上)\\s*(' + TIME_ATOM + ')'))
  if (m) {
    const [h, minute] = parseTimeAtom(m[1])
    if (h > 0) {
      const hh = applyPeriod(prefix, h)
      start = `${pad(hh)}:${pad(minute)}`
    }
  }

  // Pattern D: bare time "8点"
  if (start === null) {
    m = text.match(new RegExp('(' + TIME_ATOM + ')'))
    if (m) {
      const [h, minute] = parseTimeAtom(m[1])
      if (h > 0) start = `${pad(h)}:${pad(minute)}`
    }
  }

  // Pattern E: "一二节" / "第N节" → period-based
  if (start === null) {
    const periodMatch = text.match(/([一二三四五六七八九]+)[节节]/)
    if (periodMatch) {
      start = periodToTime(periodMatch[1])
    } else {
      m = text.match(/[第]?([0-9一二三四五六七八九]{1,2})\s*[节][课]?/)
      if (m) {
        const p = m[1]
        if (/^\d+$/.test(p)) {
          const pn = parseInt(p, 10)
          const periodStarts: Record<number, string> = { 1: '08:00', 3: '10:00', 5: '14:00', 7: '16:00', 9: '19:00' }
          start = periodStarts[pn] ?? null
        } else {
          start = periodToTime(p)
        }
      }
    }
  }

  const duration = findDuration(text)
  return { start, duration }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// ── Title cleanup ──
const TITLE_LEAD: RegExp[] = [
  /^(明天|今天|另外|我还要|还有|还要)\s*/,
  /^(上午|下午|晚上|早上|中午|凌晨)\s*/,
  new RegExp('^' + TIME_ATOM + '\\s*[到至\\-～~]\\s*' + TIME_ATOM),
  new RegExp('^' + TIME_ATOM),
  /^第?[0-9一二三四五六七八九十]+\s*[节节]/,
]

const TITLE_TRAIL: RegExp[] = [
  new RegExp('[到至]\\s*' + TIME_ATOM + '\\s*$'),
  /(?:大概|大约|约|需要|要|差不多|估计|得|花)*\s*(?:一个半|两个半|半)\s*小?时\s*$/,
  /(?:大概|大约|约|需要|要|差不多|估计|得|花)*\s*[0-9一二两三四五六七八九十]+(?:个)?(?:小?时|分钟|分)[钟]?\s*$/,
  /(?:一个半|两个半|半)\s*小?时\s*$/,
  /[0-9一二两三四五六七八九十]+(?:个)?(?:小?时|分钟|分)[钟]?\s*$/,
]

function cleanTitle(clause: string): string {
  let clean = clause.trim()
  let changed = true
  while (changed) {
    changed = false
    for (const pat of TITLE_LEAD) {
      const m = clean.match(pat)
      if (m) {
        const newTitle = clean.slice((m.index ?? 0) + m[0].length).trim()
        if (newTitle.length < clean.length) {
          clean = newTitle
          changed = true
          break
        }
      }
    }
    if (changed) continue
    for (const pat of TITLE_TRAIL) {
      const m = clean.match(pat)
      if (m && m.index !== undefined && m.index + m[0].length === clean.length) {
        const newTitle = clean.slice(0, m.index).trim()
        if (newTitle.length < clean.length) {
          clean = newTitle
          changed = true
          break
        }
      }
    }
  }
  return clean
}

function classifyType(text: string): 'fixed' | 'flexible' | 'protected' {
  for (const kw of PROTECTED_KEYWORDS) {
    if (text.includes(kw)) return 'protected'
  }
  for (const kw of FIXED_KEYWORDS) {
    if (text.includes(kw)) return 'fixed'
  }
  if (new RegExp(TIME_ATOM + '\\s*[到至\\-～~]\\s*' + TIME_ATOM).test(text)) return 'fixed'
  return 'flexible'
}

function classifyPriority(text: string): 'urgent' | 'normal' | 'low' {
  const lower = text.toLowerCase()
  for (const kw of URGENT_KEYWORDS) {
    if (lower.includes(kw)) return 'urgent'
  }
  for (const kw of LOW_KEYWORDS) {
    if (text.includes(kw)) return 'low'
  }
  return 'normal'
}

export function parseIntent(text: string): ParsedTask[] {
  let input = text.trim().replace(/^(明天|今天)\s*/, '')

  // Split by sentence delimiters, then fine-split
  const sentences = input.split(/[。；;]/)
  let allClauses: string[] = []
  for (const sent of sentences) {
    const sub = sent.split(/[，,、]/).map((s) => s.trim()).filter((s) => s && s.length > 1)
    allClauses = allClauses.concat(sub)
  }

  if (allClauses.length === 0) allClauses = [input.trim()]

  const results: ParsedTask[] = []
  for (const clause of allClauses) {
    const clean = cleanTitle(clause)
    if (clean.length < 1) continue

    const taskType = classifyType(clause)
    const priority = classifyPriority(clause)
    const { start: timeHint, duration } = extractTimeAndDuration(clause)

    let dur = duration
    if (dur === 0) {
      if (taskType === 'fixed') dur = 100
      else if (taskType === 'protected') dur = 60
      else dur = 60
    }

    results.push({
      title: clean.slice(0, 100),
      task_type: taskType,
      priority,
      estimated_minutes: dur,
      time_hint: timeHint,
    })
  }

  return results
}
