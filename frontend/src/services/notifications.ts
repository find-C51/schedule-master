// Local (offline) reminders — fire a system notification when a scheduled
// slot is about to start, so the phone pings the user even when the app is
// closed. No server / push service needed.
//
// No-ops on the web/PWA (Capacitor native plugins only exist inside the app),
// so this file is safe to import from anywhere.

import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

export interface ReminderSlot {
  task_id: number
  label: string
  start_time: string // "HH:MM"
}

export interface ReminderDay {
  date: string
  slots: ReminderSlot[]
}

function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false
  try {
    const res = await LocalNotifications.requestPermissions()
    return res.display === 'granted'
  } catch {
    return false
  }
}

// "YYYY-MM-DD" + "HH:MM" - reminderMinutes → JS Date (local time).
function buildAt(date: string, time: string, reminderMinutes: number): Date | null {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = (time || '').split(':').map(Number)
  if (!y || !m || !d || hh == null || mm == null) return null
  const at = new Date(y, m - 1, d, hh, mm)
  at.setMinutes(at.getMinutes() - reminderMinutes)
  return at
}

// Cancel every reminder we've scheduled (used when reminders are disabled).
export async function cancelAllReminders(): Promise<void> {
  if (!isNative()) return
  try {
    await LocalNotifications.cancelAll()
  } catch {
    // best effort
  }
}

// Rebuild the full reminder set from the saved schedules. Safe to call
// repeatedly; it replaces the previous set so there are no duplicates.
export async function syncReminders(
  schedules: Record<string, ReminderDay>,
  reminderMinutes: number,
): Promise<void> {
  if (!isNative()) return
  try {
    const granted = await requestNotificationPermission()
    if (!granted) return

    await LocalNotifications.cancelAll()

    const now = Date.now()
    const notifications: {
      id: number; title: string; body: string
      schedule: { at: Date; allowWhileIdle: boolean }
    }[] = []

    for (const key of Object.keys(schedules)) {
      const day = schedules[key]
      if (!day || !Array.isArray(day.slots)) continue
      for (const slot of day.slots) {
        if (!slot.task_id || slot.task_id <= 0) continue
        const at = buildAt(day.date, slot.start_time, reminderMinutes)
        if (!at || at.getTime() <= now) continue
        notifications.push({
          id: notifications.length + 1,
          title: '日程提醒 ⏰',
          body: `该做「${slot.label}」啦`,
          schedule: { at, allowWhileIdle: true },
        })
      }
    }

    if (notifications.length) {
      await LocalNotifications.schedule({ notifications })
    }
  } catch {
    // notifications are best-effort; never let them break the app
  }
}
