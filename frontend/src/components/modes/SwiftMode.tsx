import { SlotData } from '../../services/api'

interface Props { slots: SlotData[]; date: string }

export default function SwiftMode({ slots, date }: Props) {
  const freeCount = slots.filter(s => !s.is_locked).length
  const locked = slots.filter(s => s.is_locked)
  const flexible = slots.filter(s => !s.is_locked)

  return (
    <div className="bg-gray-900 text-green-400 rounded-xl shadow-lg p-4 space-y-1 font-mono text-sm">
      {/* Terminal header */}
      <p className="text-gray-500 text-xs mb-3">
        $ schedule --date {date} --mode swift
      </p>
      <p className="text-green-300">{'>'} 日程加载完成。</p>
      <p className="text-gray-500">
        锁定 {locked.length} 项 · 灵活 {flexible.length} 项 · 合计 {slots.length} 项
      </p>

      <div className="border-t border-gray-700 my-2" />

      {locked.length > 0 && (
        <>
          <p className="text-yellow-400 text-xs uppercase tracking-wider">// 固定任务</p>
          {locked.map((s, i) => (
            <p key={i} className="flex gap-2 text-green-300">
              <span className="text-gray-500 shrink-0">{s.start_time}</span>
              <span>→</span>
              <span>{s.label}</span>
              <span className="text-gray-600 ml-auto">{s.end_time}</span>
            </p>
          ))}
        </>
      )}

      {flexible.length > 0 && (
        <>
          <p className="text-blue-400 text-xs uppercase tracking-wider mt-2">// 灵活任务</p>
          {flexible.map((s, i) => (
            <p key={i} className="flex gap-2 text-blue-300">
              <span className="text-gray-500 shrink-0">{s.start_time}</span>
              <span>≈</span>
              <span>{s.label}</span>
              <span className="text-gray-600 ml-auto">{s.end_time}</span>
            </p>
          ))}
        </>
      )}

      <div className="border-t border-gray-700 my-2" />

      {/* Daily stats */}
      <p className="text-gray-500 text-xs">
        $ efficiency_score: {Math.round((locked.length / Math.max(1, slots.length)) * 100)}% 结构化
      </p>
      <p className="text-gray-500 text-xs">
        $ free_blocks: {flexible.length} · 可弹性调度
      </p>
      <p className="text-green-300 mt-2">$ _</p>
    </div>
  )
}
