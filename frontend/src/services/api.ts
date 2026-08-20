// Offline data facade — same API shape as before, but backed by the local
// engine + localStorage instead of a backend server. The app now runs fully
// offline with no network or computer required.

import { parseIntent } from '../engine/intentParser'
import { scheduleDay, TaskItem, ScheduleResult } from '../engine/scheduler'
import { assistantChat, fetchBrief, ChatResponse, BriefResponse } from '../engine/assistant'
import {
  getDb, mutateDb, addTask, addGoal, buildGoalTree,
  DbTask, DbGoal,
} from '../store/db'

export interface Task {
  id: number; title: string; task_type: string; priority: string
  estimated_minutes: number; time_hint?: string; deadline?: string; status: string
}

export interface Goal {
  id: number; title: string; description: string; level: string
  parent_id?: number | null; progress: number; deadline?: string | null; status: string
  children: Goal[]
}

export interface SlotData {
  task_id: number; label: string; start_time: string; end_time: string
  color: string; is_locked: boolean
}

export interface ScheduleResponse {
  date: string; slots: SlotData[]; deferred_task_ids: number[]; message: string; tips?: string[]
}

function toTask(t: DbTask): Task {
  return {
    id: t.id, title: t.title, task_type: t.task_type, priority: t.priority,
    estimated_minutes: t.estimated_minutes, time_hint: t.time_hint ?? undefined,
    deadline: t.deadline ?? undefined, status: t.status,
  }
}

function toItem(t: DbTask): TaskItem {
  return {
    id: t.id, title: t.title, task_type: t.task_type, priority: t.priority,
    estimated_minutes: t.estimated_minutes, time_hint: t.time_hint, deadline: t.deadline,
  }
}

export async function fetchTasks(): Promise<Task[]> {
  return getDb().tasks.map(toTask)
}

export async function createTask(data: Partial<Task>): Promise<Task> {
  let created: DbTask | undefined
  mutateDb((db) => { created = addTask(db, data as Partial<DbTask>) })
  return toTask(created!)
}

export async function deleteTask(id: number): Promise<boolean> {
  let deleted = false
  mutateDb((db) => {
    const before = db.tasks.length
    db.tasks = db.tasks.filter((t) => t.id !== id)
    deleted = db.tasks.length < before
    // also drop the task from any saved schedules
    for (const key of Object.keys(db.schedules)) {
      db.schedules[key].slots = db.schedules[key].slots.filter((s) => s.task_id !== id)
    }
  })
  return deleted
}

export async function updateTaskStatus(id: number, status: string): Promise<boolean> {
  let found = false
  mutateDb((db) => {
    const t = db.tasks.find((x) => x.id === id)
    if (t) { t.status = status; found = true }
  })
  return found
}

export async function fetchGoals(): Promise<Goal[]> {
  return buildGoalTree(getDb(), null, 'big') as Goal[]
}

export async function createGoal(data: Partial<Goal>): Promise<Goal> {
  let created: DbGoal | undefined
  mutateDb((db) => { created = addGoal(db, data as Partial<DbGoal>) })
  return { ...created!, children: [] }
}

export async function deleteGoal(id: number): Promise<boolean> {
  let deleted = false
  mutateDb((db) => {
    // collect the goal and all its descendants
    const ids = new Set<number>([id])
    let changed = true
    while (changed) {
      changed = false
      for (const g of db.goals) {
        if (g.parent_id != null && ids.has(g.parent_id) && !ids.has(g.id)) {
          ids.add(g.id)
          changed = true
        }
      }
    }
    const before = db.goals.length
    db.goals = db.goals.filter((g) => !ids.has(g.id))
    deleted = db.goals.length < before
  })
  return deleted
}

export async function generateSchedule(date: string, fixedIds: number[], flexIds: number[]): Promise<ScheduleResponse> {
  let result!: ScheduleResult
  mutateDb((db) => {
    const fixed = db.tasks.filter((t) => fixedIds.includes(t.id)).map(toItem)
    const flexible = db.tasks.filter((t) => flexIds.includes(t.id)).map(toItem)

    result = scheduleDay({
      schedule_date: date,
      fixed_tasks: fixed,
      flexible_tasks: flexible,
      protection_rules: db.settings.protection_rules,
      schedule_policy: db.settings.schedule_policy,
    })

    db.schedules[date] = {
      date,
      slots: result.slots,
      deferred_task_ids: result.deferred.map((d) => d.id),
      message: result.message,
      tips: result.tips,
    }
  })

  return {
    date,
    slots: result.slots,
    deferred_task_ids: result.deferred.map((d) => d.id),
    message: result.message,
    tips: result.tips,
  }
}

export async function getSchedule(date: string): Promise<{ date: string; slots: SlotData[] }> {
  const sched = getDb().schedules[date]
  if (!sched) return { date, slots: [] }
  return { date, slots: sched.slots }
}

export async function parseVoice(text: string): Promise<{ tasks: Partial<Task>[] }> {
  return {
    tasks: parseIntent(text).map((p) => ({
      title: p.title, task_type: p.task_type, priority: p.priority,
      estimated_minutes: p.estimated_minutes, time_hint: p.time_hint ?? undefined,
    })),
  }
}

export { assistantChat, fetchBrief }
export type { ChatResponse, BriefResponse }

export async function adjustSchedule(date: string, emergent: Partial<Task>, strategy = 'auto'): Promise<any> {
  let slots: SlotData[] = []
  let message = ''
  mutateDb((db) => {
    const sched = db.schedules[date]
    const existingIds = sched ? sched.slots.map((s) => s.task_id).filter((id) => id > 0) : []
    const tasks = db.tasks.filter((t) => existingIds.includes(t.id))
    const fixed = tasks.filter((t) => t.task_type === 'fixed').map(toItem)
    const flexible = tasks.filter((t) => t.task_type !== 'fixed').map(toItem)

    const em = addTask(db, {
      title: emergent.title ?? '',
      task_type: emergent.task_type ?? 'flexible',
      priority: emergent.priority ?? 'normal',
      estimated_minutes: emergent.estimated_minutes ?? 60,
      time_hint: emergent.time_hint ?? null,
    })

    const result = scheduleDay({
      schedule_date: date,
      fixed_tasks: fixed,
      flexible_tasks: flexible,
      protection_rules: db.settings.protection_rules,
      emergent_tasks: [toItem(em)],
    })
    slots = result.slots
    message = result.message
  })
  return { slots, message }
}

export async function fetchSettings(): Promise<any> {
  return { ...getDb().settings, user_id: 'default' }
}

export async function updateSettings(data: any): Promise<any> {
  const db = mutateDb((d) => {
    if (data.protection_rules !== undefined) d.settings.protection_rules = data.protection_rules
    if (data.schedule_policy !== undefined) d.settings.schedule_policy = data.schedule_policy
    if (data.interaction_mode !== undefined) d.settings.interaction_mode = data.interaction_mode
    if (data.reminder_enabled !== undefined) d.settings.reminder_enabled = data.reminder_enabled ? 1 : 0
    if (data.reminder_minutes !== undefined) d.settings.reminder_minutes = data.reminder_minutes
  })
  return { ...db.settings, user_id: 'default' }
}
