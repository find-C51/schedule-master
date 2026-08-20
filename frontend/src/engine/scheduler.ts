// Core scheduling engine — turns tasks into a daily timetable.
// Ported from backend/engine/scheduler.py + time_utils.py (runs fully offline).

export interface TaskItem {
  id: number
  title: string
  task_type: string // fixed | flexible | protected | emergent
  priority: string // urgent | normal | low
  estimated_minutes: number
  time_hint?: string | null // "09:00" or null
  deadline?: string | null
}

export interface SlotOutput {
  task_id: number
  label: string
  start_time: string // "HH:MM"
  end_time: string // "HH:MM"
  color: string
  is_locked: boolean
}

export interface ScheduleResult {
  date: string
  slots: SlotOutput[]
  deferred: TaskItem[]
  message: string
  tips: string[]
}

export function parseTimeStr(t: string): number {
  const parts = t.trim().split(':')
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0)
}

export function minutesToTime(m: number): string {
  m = ((m % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function priorityScore(priority: string): number {
  return { urgent: 100, normal: 50, low: 0 }[priority] ?? 50
}

function colorForType(taskType: string): string {
  return {
    fixed: '#EF4444',
    protected: '#10B981',
    flexible: '#3B82F6',
    emergent: '#F59E0B',
  }[taskType] ?? '#6B7280'
}

function mergeAdjacent(slots: Array<[number, number]>): Array<[number, number]> {
  if (!slots.length) return []
  const sorted = [...slots].sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i]
    const last = merged[merged.length - 1]
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end)
    } else {
      merged.push([start, end])
    }
  }
  return merged
}

function findFreeSlots(
  occupied: Array<[number, number]>,
  dayStart: number,
  dayEnd: number,
): Array<[number, number]> {
  const merged = mergeAdjacent(occupied)
  const free: Array<[number, number]> = []
  let cursor = dayStart
  for (const [os, oe] of merged) {
    if (os > cursor) free.push([cursor, os])
    if (oe > cursor) cursor = oe
  }
  if (cursor < dayEnd) free.push([cursor, dayEnd])
  return free
}

function fitsIn(slot: [number, number], durationMinutes: number): boolean {
  return slot[1] - slot[0] >= durationMinutes
}

export interface ScheduleDayOptions {
  schedule_date: string
  fixed_tasks: TaskItem[]
  flexible_tasks: TaskItem[]
  protection_rules: Record<string, { start: string; end: string }>
  emergent_tasks?: TaskItem[]
  day_start?: string
  day_end?: string
  schedule_policy?: string
}

export function scheduleDay(opts: ScheduleDayOptions): ScheduleResult {
  const dayStart = parseTimeStr(opts.day_start ?? '07:00')
  const dayEnd = parseTimeStr(opts.day_end ?? '23:00')

  const allSlots: SlotOutput[] = []
  const occupied: Array<[number, number]> = []

  // Step 1: Place fixed tasks
  for (const task of opts.fixed_tasks) {
    if (!task.time_hint) continue
    const start = parseTimeStr(task.time_hint)
    const end = start + task.estimated_minutes
    allSlots.push({
      task_id: task.id, label: task.title,
      start_time: minutesToTime(start), end_time: minutesToTime(end),
      color: colorForType(task.task_type), is_locked: true,
    })
    occupied.push([start, end])
  }

  // Step 2: Apply protection rules
  for (const rule of Object.values(opts.protection_rules ?? {})) {
    const ps = parseTimeStr(rule.start)
    const pe = parseTimeStr(rule.end)
    if (pe <= ps) {
      occupied.push([ps, 23 * 60 + 59])
      occupied.push([0, pe])
    } else {
      occupied.push([ps, pe])
    }
  }

  // Explicit protected tasks from DB
  for (const task of opts.flexible_tasks) {
    if (task.task_type === 'protected' && task.time_hint) {
      const ps = parseTimeStr(task.time_hint)
      const pe = ps + task.estimated_minutes
      allSlots.push({
        task_id: task.id, label: task.title,
        start_time: minutesToTime(ps), end_time: minutesToTime(pe),
        color: colorForType('protected'), is_locked: true,
      })
      occupied.push([ps, pe])
    }
  }

  let freeSlots = findFreeSlots(occupied, dayStart, dayEnd)

  // Step 4: Sort flexible tasks — time-hinted ones MUST come first
  const flexPool = opts.flexible_tasks.filter((t) => t.task_type === 'flexible')
  const sortedFlex = [...flexPool].sort((a, b) => {
    const ah = a.time_hint ? 0 : 1
    const bh = b.time_hint ? 0 : 1
    if (ah !== bh) return ah - bh
    const ap = -priorityScore(a.priority)
    const bp = -priorityScore(b.priority)
    if (ap !== bp) return ap - bp
    return a.estimated_minutes - b.estimated_minutes
  })

  // Step 5: Greedy bin-packing
  const deferred: TaskItem[] = []

  for (const task of sortedFlex) {
    let placed = false
    if (task.time_hint) {
      const hintStart = parseTimeStr(task.time_hint)
      const hintEnd = hintStart + task.estimated_minutes
      for (const fs of freeSlots) {
        if (hintStart >= fs[0] && hintEnd <= fs[1]) {
          allSlots.push({
            task_id: task.id, label: task.title,
            start_time: minutesToTime(hintStart), end_time: minutesToTime(hintEnd),
            color: colorForType('flexible'), is_locked: false,
          })
          occupied.push([hintStart, hintEnd])
          freeSlots = findFreeSlots(occupied, dayStart, dayEnd)
          placed = true
          break
        }
      }
    }
    if (!placed) {
      for (const fs of freeSlots) {
        if (fitsIn(fs, task.estimated_minutes)) {
          const start = fs[0]
          const end = start + task.estimated_minutes
          allSlots.push({
            task_id: task.id, label: task.title,
            start_time: minutesToTime(start), end_time: minutesToTime(end),
            color: colorForType('flexible'), is_locked: false,
          })
          occupied.push([start, end])
          freeSlots = findFreeSlots(occupied, dayStart, dayEnd)
          placed = true
          break
        }
      }
    }
    if (!placed) deferred.push(task)
  }

  // Step 6: Integrate emergent tasks
  for (const task of opts.emergent_tasks ?? []) {
    let placed = false
    if (task.time_hint) {
      const es = parseTimeStr(task.time_hint)
      const ee = es + task.estimated_minutes
      allSlots.push({
        task_id: task.id, label: `⚠ ${task.title}`,
        start_time: minutesToTime(es), end_time: minutesToTime(ee),
        color: colorForType('emergent'), is_locked: false,
      })
      placed = true
    }
    if (!placed) {
      const fs2 = findFreeSlots(occupied, dayStart, dayEnd)
      for (const fs of fs2) {
        if (fitsIn(fs, task.estimated_minutes)) {
          const start = fs[0]
          const end = start + task.estimated_minutes
          allSlots.push({
            task_id: task.id, label: `⚠ ${task.title}`,
            start_time: minutesToTime(start), end_time: minutesToTime(end),
            color: colorForType('emergent'), is_locked: false,
          })
          occupied.push([start, end])
          placed = true
          break
        }
      }
    }
    if (!placed) deferred.push(task)
  }

  allSlots.sort((a, b) => parseTimeStr(a.start_time) - parseTimeStr(b.start_time))

  const msgParts = [`📅 ${opts.schedule_date} 日程已生成`, `共 ${allSlots.length} 个时段`]
  if (deferred.length) {
    msgParts.push(`⚠ ${deferred.length} 项溢出，建议顺延: ${deferred.map((t) => t.title).join(', ')}`)
  }

  return {
    date: opts.schedule_date,
    slots: allSlots,
    deferred,
    message: msgParts.join(' | '),
    tips: buildTips(allSlots, deferred.length),
  }
}

function buildTips(slots: SlotOutput[], deferredCount: number): string[] {
  const tips: string[] = []
  if (!slots.length) return tips

  let firstStart = slots[0].start_time
  let lastEnd = slots[0].end_time
  for (const s of slots) {
    if (parseTimeStr(s.start_time) < parseTimeStr(firstStart)) firstStart = s.start_time
    if (parseTimeStr(s.end_time) > parseTimeStr(lastEnd)) lastEnd = s.end_time
  }

  const locked = slots.filter((s) => s.is_locked)
  if (locked.length) tips.push(`${locked.length} 项固定任务已锁定，记得提前备好资料，到点直接进入状态 🔒`)

  const firstMin = parseTimeStr(firstStart)
  const lastMin = parseTimeStr(lastEnd)
  if (firstMin <= 8 * 60) tips.push('第一件事开始得早，今晚早点休息，明早才有精神 ☀️')
  if (lastMin >= 21 * 60) tips.push('晚上排到比较晚，睡前留点放松时间，少刷手机哦 🌙')
  if (slots.length >= 8) tips.push('今天挺满的，记得留点喝水和起身活动的空档 🍵')
  if (deferredCount) tips.push(`有 ${deferredCount} 件事排不下，明天优先处理，别焦虑 💛`)
  if (!tips.length) tips.push('节奏很舒服，记得按计划走，也别给自己太大压力 ✨')
  return tips
}
