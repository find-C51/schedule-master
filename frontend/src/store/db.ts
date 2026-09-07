// Local data layer — replaces SQLite + API with localStorage, so the app
// runs fully offline on the phone with no backend needed.

import type { SlotOutput } from '../engine/scheduler'

export interface DbTask {
  id: number
  title: string
  description: string
  task_type: string
  priority: string
  estimated_minutes: number
  time_hint: string | null
  deadline: string | null
  status: string
  goal_id: number | null
  completed_at: string | null
  created_at: string
}

export interface DbGoal {
  id: number
  title: string
  description: string
  level: string
  parent_id: number | null
  progress: number
  deadline: string | null
  status: string
}

export interface StoredSchedule {
  date: string
  slots: SlotOutput[]
  deferred_task_ids: number[]
  message: string
  tips?: string[]
}

export interface ProtectionRule {
  start: string
  end: string
}

export interface DbSettings {
  protection_rules: Record<string, ProtectionRule>
  schedule_policy: string
  interaction_mode: string
  reminder_enabled: number
  reminder_minutes: number
}

interface Db {
  tasks: DbTask[]
  goals: DbGoal[]
  schedules: Record<string, StoredSchedule>
  settings: DbSettings
  nextTaskId: number
  nextGoalId: number
}

const KEY = 'schedule-agent-db'

const DEFAULT_SETTINGS: DbSettings = {
  protection_rules: {
    breakfast: { start: '07:00', end: '08:00' },
    lunch: { start: '12:00', end: '13:00' },
    nap: { start: '12:30', end: '13:30' },
    dinner: { start: '18:00', end: '19:00' },
    sleep: { start: '23:00', end: '07:00' },
  },
  schedule_policy: 'efficiency_first',
  interaction_mode: 'table',
  reminder_enabled: 1,
  reminder_minutes: 10,
}

function defaultDb(): Db {
  return {
    tasks: [],
    goals: [],
    schedules: {},
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    nextTaskId: 1,
    nextGoalId: 1,
  }
}

function loadDb(): Db {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultDb()
    const parsed = JSON.parse(raw)
    return {
      ...defaultDb(),
      ...parsed,
      settings: { ...defaultDb().settings, ...(parsed.settings ?? {}) },
    }
  } catch {
    return defaultDb()
  }
}

function saveDb(db: Db): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    // localStorage full — best effort, ignore
  }
}

export function getDb(): Db {
  return loadDb()
}

export function mutateDb(fn: (db: Db) => void): Db {
  const db = loadDb()
  fn(db)
  saveDb(db)
  return db
}

// ── Task helpers ──

export function addTask(db: Db, data: Partial<DbTask>): DbTask {
  const task: DbTask = {
    id: db.nextTaskId++,
    title: data.title ?? '',
    description: data.description ?? '',
    task_type: data.task_type ?? 'flexible',
    priority: data.priority ?? 'normal',
    estimated_minutes: data.estimated_minutes ?? 60,
    time_hint: data.time_hint ?? null,
    deadline: data.deadline ?? null,
    status: data.status ?? 'pending',
    goal_id: data.goal_id ?? null,
    completed_at: data.completed_at ?? null,
    created_at: new Date().toISOString(),
  }
  db.tasks.unshift(task)
  return task
}

export function findTask(db: Db, id: number): DbTask | undefined {
  return db.tasks.find((t) => t.id === id)
}

// ── Goal helpers ──

export function addGoal(db: Db, data: Partial<DbGoal>): DbGoal {
  const goal: DbGoal = {
    id: db.nextGoalId++,
    title: data.title ?? '',
    description: data.description ?? '',
    level: data.level ?? 'big',
    parent_id: data.parent_id ?? null,
    progress: data.progress ?? 0,
    deadline: data.deadline ?? null,
    status: data.status ?? 'active',
  }
  db.goals.push(goal)
  return goal
}

// Recursively build the goal tree (children of children) for the API shape.
export function buildGoalTree(db: Db, parentId: number | null, level: string): any[] {
  return db.goals
    .filter((g) => g.parent_id === parentId)
    .map((g) => ({
      ...g,
      children: buildGoalTree(db, g.id, g.level),
    }))
}

// Persist a decomposed goal tree (from assistant / decompose).
export function saveGoalTree(db: Db, node: { title: string; level: string; children: any[] }): DbGoal {
  const root = addGoal(db, { title: node.title, level: node.level })
  const recurse = (children: any[], parentId: number) => {
    for (const child of children) {
      const c = addGoal(db, { title: child.title, level: child.level, parent_id: parentId })
      recurse(child.children ?? [], c.id)
    }
  }
  recurse(node.children ?? [], root.id)
  return root
}
