import { SlotData } from '../../services/api'

interface Props { slots: SlotData[] }

function getCurrentTimeSlot(slots: SlotData[]): string | null {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  for (const s of slots) {
    const [sh, sm] = s.start_time.split(':').map(Number)
    const [eh, em] = s.end_time.split(':').map(Number)
    if (currentMinutes >= sh * 60 + sm && currentMinutes < eh * 60 + em) {
      return s.label
    }
  }
  return null
}

function timeLabel(start: string, end: string): string {
  const [sh, sm] = start.split(':')
  const [eh, em] = end.split(':')
  return `${sh}:${sm} - ${eh}:${em}`
}

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7) // 07:00 - 23:00

export default function TableMode({ slots }: Props) {
  const currentActivity = getCurrentTimeSlot(slots)
  const now = new Date()
  const progressPct = Math.round(((now.getHours() - 7) / 16) * 100)

  return (
    <div className="space-y-0">
      {/* Day progress header */}
      <div className="bg-white rounded-xl shadow-sm p-3 mb-3">
        <div className="flex justify-between items-center text-xs text-gray-500 mb-1">
          <span>🌅 07:00</span>
          <span>🌙 23:00</span>
        </div>
        <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className="bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full transition-all duration-1000"
            style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
          />
        </div>
        {currentActivity && (
          <p className="text-xs text-blue-600 mt-1 animate-pulse">
            📍 当前：{currentActivity}
          </p>
        )}
      </div>

      {/* Timeline */}
      {HOURS.map((hour) => {
        const slotAtHour = slots.filter((s) => {
          const [sh] = s.start_time.split(':').map(Number)
          return sh === hour
        })
        const isNow = now.getHours() === hour

        return (
          <div key={hour} className="flex gap-2 min-h-[48px]">
            {/* Time label */}
            <div className={`w-12 text-right shrink-0 pt-0.5 text-xs font-mono ${
              isNow ? 'text-blue-600 font-bold' : 'text-gray-400'
            }`}>
              {String(hour).padStart(2, '0')}:00
              {isNow && <span className="block text-[10px]">now</span>}
            </div>

            {/* Content */}
            <div className={`flex-1 border-l-2 pb-1 pl-3 ${
              isNow ? 'border-blue-500' : 'border-gray-200'
            }`}>
              {slotAtHour.length > 0 ? (
                slotAtHour.map((s, i) => (
                  <div
                    key={i}
                    className="p-2 rounded-lg text-sm mb-1 shadow-sm transition-all hover:scale-[1.02] active:scale-95"
                    style={{
                      backgroundColor: `${s.color}15`,
                      borderLeft: `3px solid ${s.color}`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{s.label}</span>
                      <span className="text-xs text-gray-400">
                        {s.is_locked ? '🔒' : '📝'}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      {timeLabel(s.start_time, s.end_time)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="h-4" />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
