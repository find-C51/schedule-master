import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  getSchedule, SlotData, fetchSettings, updateSettings, fetchTasks, fetchGoals,
  updateTaskStatus,
} from '../services/api'
import { localDateStr } from '../utils/date'
import TableMode from '../components/modes/TableMode'
import SwiftMode from '../components/modes/SwiftMode'
import WarmMode from '../components/modes/WarmMode'
import GameMode from '../components/modes/GameMode'

const MODE_OPTIONS = [
  { key: 'table', label: '📋 表格', desc: '经典时间表' },
  { key: 'swift', label: '⚡ 效率', desc: '一句话说明白' },
  { key: 'warm', label: '🍃 暖心', desc: '小暖学姐陪你' },
  { key: 'game', label: '🎮 趣味', desc: '闯关打怪升级' },
]

function getGreeting(): { emoji: string; text: string } {
  const h = new Date().getHours()
  if (h < 6) return { emoji: '🌙', text: '夜深了，记得早点休息呀' }
  if (h < 9) return { emoji: '🌅', text: '早上好！新的一天元气满满' }
  if (h < 12) return { emoji: '🌤', text: '上午好，精神最好的时候' }
  if (h < 14) return { emoji: '🍜', text: '中午好，记得吃午饭呀' }
  if (h < 18) return { emoji: '🌿', text: '下午好，再坚持一下' }
  if (h < 21) return { emoji: '🌆', text: '傍晚好，给自己留点放松' }
  return { emoji: '🌙', text: '晚上好，今天辛苦了' }
}

export default function HomePage() {
  const [searchParams] = useSearchParams()
  const [slots, setSlots] = useState<SlotData[]>([])
  const [dayOffset, setDayOffset] = useState(() => {
    const raw = parseInt(searchParams.get('day') ?? '0', 10)
    return Number.isNaN(raw) || raw < 0 || raw > 2 ? 0 : raw
  })
  const [mode, setMode] = useState('table')
  const [doneIds, setDoneIds] = useState<Set<number>>(new Set())
  const [taskCount, setTaskCount] = useState(0)
  const [goalCount, setGoalCount] = useState(0)
  const navigate = useNavigate()

  const date = localDateStr(dayOffset)
  const dayLabel = dayOffset === 0 ? '今天' : dayOffset === 1 ? '明天' : '后天'

  useEffect(() => {
    getSchedule(date).then((d) => setSlots(d.slots || []))
    fetchTasks().then((ts) => {
      setTaskCount(ts.length)
      setDoneIds(new Set(ts.filter((t) => t.status === 'done').map((t) => t.id)))
    })
    fetchGoals().then((gs) => setGoalCount(gs.length)).catch(() => {})
    fetchSettings().then((s) => setMode(s.interaction_mode || 'table')).catch(() => {})
  }, [date])

  const switchMode = async (newMode: string) => {
    setMode(newMode)
    try {
      await updateSettings({ interaction_mode: newMode })
    } catch {}
  }

  const handleToggle = async (slot: SlotData) => {
    const id = slot.task_id
    if (!id || id <= 0) return
    const isDone = doneIds.has(id)
    await updateTaskStatus(id, isDone ? 'pending' : 'done')
    setDoneIds((prev) => {
      const next = new Set(prev)
      if (isDone) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const greeting = getGreeting()
  const isFirstRun = slots.length === 0 && taskCount === 0 && goalCount === 0 && dayOffset === 0

  const renderMode = () => {
    if (slots.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400">
          <p className="text-5xl mb-4">📭</p>
          <p>{dayLabel}还没有日程</p>
          <p className="text-sm mt-1">
            {dayOffset === 0 ? '去和小暖聊聊，让她帮你安排今天吧' : '去「排程」页安排这一天吧'}
          </p>
          <button
            onClick={() => navigate(dayOffset === 0 ? '/assistant' : '/schedule')}
            className="mt-4 px-5 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium
                       shadow-sm active:scale-95 transition hover:bg-blue-600"
          >
            {dayOffset === 0 ? '🧡 找小暖聊聊' : '📋 去排程'}
          </button>
        </div>
      )
    }
    switch (mode) {
      case 'swift': return <SwiftMode slots={slots} date={date} doneTaskIds={doneIds} onToggle={handleToggle} />
      case 'warm': return <WarmMode slots={slots} doneTaskIds={doneIds} onToggle={handleToggle} />
      case 'game': return <GameMode slots={slots} doneTaskIds={doneIds} onToggle={handleToggle} />
      default: return <TableMode slots={slots} doneTaskIds={doneIds} onToggle={handleToggle} />
    }
  }

  return (
    <div className="max-w-md mx-auto p-4 pb-24">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h1 className="text-2xl font-bold">日程智排</h1>
          <p className="text-gray-500 text-sm">
            {slots.length > 0 ? `${dayLabel} · ${slots.length} 项日程` : `${dayLabel} · 暂无日程`}
          </p>
        </div>
      </div>

      {/* Greeting banner */}
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl p-4 mb-3 border border-blue-100/60 flex items-center gap-3">
        <span className="text-3xl">{greeting.emoji}</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-700">{greeting.text}</p>
          <p className="text-xs text-gray-400 mt-0.5">小暖一直在，需要就喊我 🧡</p>
        </div>
        <button
          onClick={() => navigate('/assistant')}
          className="shrink-0 px-3 py-1.5 rounded-full text-xs bg-white text-blue-600 font-medium
                     border border-blue-200 shadow-sm active:scale-95 transition"
        >
          去聊聊
        </button>
      </div>

      {/* First-run onboarding */}
      {isFirstRun && (
        <div className="bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl p-4 mb-3 text-white shadow-lg">
          <p className="font-bold mb-2">👋 欢迎使用日程智排，三步开启高效一天：</p>
          <div className="space-y-2 text-sm">
            <button
              onClick={() => navigate('/goals')}
              className="w-full flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2 hover:bg-white/25 active:scale-[0.98] transition text-left"
            >
              <span className="text-lg">🎯</span>
              <span className="flex-1"><b>1. 设定目标</b> — AI 帮你拆解成每日任务</span>
              <span className="opacity-70">→</span>
            </button>
            <button
              onClick={() => navigate('/assistant')}
              className="w-full flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2 hover:bg-white/25 active:scale-[0.98] transition text-left"
            >
              <span className="text-lg">🧡</span>
              <span className="flex-1"><b>2. 和小暖说</b> — 一句话语音排程</span>
              <span className="opacity-70">→</span>
            </button>
            <button
              onClick={() => navigate('/schedule')}
              className="w-full flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2 hover:bg-white/25 active:scale-[0.98] transition text-left"
            >
              <span className="text-lg">📅</span>
              <span className="flex-1"><b>3. 查看今日</b> — 一键打卡完成任务</span>
              <span className="opacity-70">→</span>
            </button>
          </div>
        </div>
      )}

      {/* Date selector */}
      <div className="flex gap-2 mb-3">
        {[
          { offset: 0, label: '今天' },
          { offset: 1, label: '明天' },
          { offset: 2, label: '后天' },
        ].map((d) => (
          <button
            key={d.offset}
            onClick={() => setDayOffset(d.offset)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
              dayOffset === d.offset
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-blue-300'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Mode switcher */}
      <div className="flex gap-1 mb-1 overflow-x-auto pb-1">
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => switchMode(opt.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs transition ${
              mode === opt.key
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {slots.length > 0 && (
        <p className="text-[11px] text-gray-400 mb-3">💡 点一下日程就能打卡完成，再点取消</p>
      )}

      {renderMode()}
    </div>
  )
}
