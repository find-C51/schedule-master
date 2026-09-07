import { SlotData } from '../../services/api'

interface Props {
  slots: SlotData[]
  date: string
  doneTaskIds: Set<number>
  onToggle: (slot: SlotData) => void
}

export default function SwiftMode({ slots, date, doneTaskIds, onToggle }: Props) {
  const freeCount = slots.filter(s => !s.is_locked).length
  const locked = slots.filter(s => s.is_locked)
  const flexible = slots.filter(s => !s.is_locked)
  const doneCount = slots.filter(s => doneTaskIds.has(s.task_id)).length

  return (
    <div className="bg-gray-900 text-green-400 rounded-xl shadow-lg p-4 space-y-1 font-mono text-sm">
      {/* Terminal header */}
      <p className="text-gray-500 text-xs mb-3">
        $ schedule --date {date} --mode swift
      </p>
      <p className="text-green-300">{'>'} 日程加载完成。</p>
      <p className="text-gray-500">
        锁定 {locked.length} 项 · 灵活 {flexible.length} 项 · 完成 {doneCount}/{slots.length}
      </p>

      <div className="border-t border-gray-700 my-2" />

      {locked.length > 0 && (
        <>
          <p className="text-yellow-400 text-xs uppercase tracking-wider">// 固定任务</p>
          {locked.map((s, i) => {
            const isDone = doneTaskIds.has(s.task_id)
            return (
              <button
                key={i}
                onClick={() => onToggle(s)}
                className="flex gap-2 w-full text-left hover:bg-gray-800 rounded px-0.5 py-0.5 transition"
              >
                <span className="shrink-0 text-gray-500">{isDone ? '[x]' : '[ ]'}</span>
                <span className="text-gray-500 shrink-0">{s.start_time}</span>
                <span>→</span>
                <span className={`text-green-300 ${isDone ? 'line-through opacity-50' : ''}`}>{s.label}</span>
                <span className="text-gray-600 ml-auto">{s.end_time}</span>
              </button>
            )
          })}
        </>
      )}

      {flexible.length > 0 && (
        <>
          <p className="text-blue-400 text-xs uppercase tracking-wider mt-2">// 灵活任务</p>
          {flexible.map((s, i) => {
            const isDone = doneTaskIds.has(s.task_id)
            return (
              <button
                key={i}
                onClick={() => onToggle(s)}
                className="flex gap-2 w-full text-left hover:bg-gray-800 rounded px-0.5 py-0.5 transition"
              >
                <span className="shrink-0 text-gray-500">{isDone ? '[x]' : '[ ]'}</span>
                <span className="text-gray-500 shrink-0">{s.start_time}</span>
                <span>≈</span>
                <span className={`text-blue-300 ${isDone ? 'line-through opacity-50' : ''}`}>{s.label}</span>
                <span className="text-gray-600 ml-auto">{s.end_time}</span>
              </button>
            )
          })}
        </>
      )}

      <div className="border-t border-gray-700 my-2" />

      {/* Daily stats */}
      <p className="text-gray-500 text-xs">
        $ efficiency_score: {Math.round((locked.length / Math.max(1, slots.length)) * 100)}% 结构化
      </p>
      <p className="text-gray-500 text-xs">
        $ free_blocks: {freeCount} · 可弹性调度
      </p>
      <p className="text-green-300 mt-2">$ _</p>
    </div>
  )
}
