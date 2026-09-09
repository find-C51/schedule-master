import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import VoiceInput from '../components/VoiceInput'
import { parseVoice, createTask, generateSchedule, ScheduleResponse } from '../services/api'
import { localDateStr } from '../utils/date'

interface ParsedTask {
  title: string; task_type: string; priority: string
  estimated_minutes: number; time_hint?: string
}

const TYPE_COLORS: Record<string, string> = {
  fixed: 'border-red-400 bg-red-50',
  flexible: 'border-blue-400 bg-blue-50',
  protected: 'border-green-400 bg-green-50',
}

const TYPE_ICONS: Record<string, string> = {
  fixed: '🔒', flexible: '📝', protected: '🛡',
}

export default function SchedulePage() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<ParsedTask[]>([])
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [inputText, setInputText] = useState('')
  const [error, setError] = useState('')
  const [dayOffset, setDayOffset] = useState(1) // 0=今天 1=明天 2=后天

  const selectedDate = localDateStr(dayOffset)
  const dayLabelText = dayOffset === 0 ? '今日' : dayOffset === 1 ? '明日' : '后日'
  const dayWord = dayOffset === 0 ? '今天' : dayOffset === 1 ? '明天' : '后天'

  const doGenerate = async (parsedTasks: ParsedTask[]) => {
    setLoading(true)
    setError('')
    try {
      const fixedIds: number[] = []
      const flexIds: number[] = []
      for (const t of parsedTasks) {
        const created = await createTask({
          title: t.title, task_type: t.task_type, priority: t.priority,
          estimated_minutes: t.estimated_minutes, time_hint: t.time_hint,
        })
        if (t.task_type === 'fixed') fixedIds.push(created.id)
        else flexIds.push(created.id)
      }
      const s = await generateSchedule(selectedDate, fixedIds, flexIds)
      setSchedule(s)
      // 排好后直接跳转到「今日」页，让用户立刻看到排程结果
      navigate(`/?day=${dayOffset}`)
    } catch (e) {
      console.error('Generate failed:', e)
      setError('排程失败，请重试')
    }
    setLoading(false)
  }

  const handleVoiceResult = async (text: string) => {
    setInputText(text)
    setParsing(true)
    setSchedule(null)
    setError('')
    try {
      const result = await parseVoice(text)
      const parsedTasks = result.tasks as ParsedTask[]
      setTasks(parsedTasks)
      if (parsedTasks.length === 0) {
        setError('没识别到任务，请换个说法，例如：明天上午8点到10点上课')
      } else {
        await doGenerate(parsedTasks)
      }
    } catch {
      setTasks([])
      setError('识别失败，请重试')
    }
    setParsing(false)
  }

  const handleGenerate = async () => {
    if (tasks.length === 0) {
      setError('请先输入或说出要做的事')
      return
    }
    await doGenerate(tasks)
  }

  const removeTask = (index: number) => {
    setTasks(tasks.filter((_, i) => i !== index))
  }

  const fmtDate = (d: string) => {
    const parts = d.split('-')
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
    return `${parts[1]}月${parts[2]}日 周${weekdays[date.getDay()]}`
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">📋 智能排程</h1>
      <p className="text-gray-500 text-sm mb-3">📅 {fmtDate(selectedDate)}</p>

      {/* Date selector */}
      <div className="flex gap-2 mb-4">
        {[
          { offset: 0, label: '今天' },
          { offset: 1, label: '明天' },
          { offset: 2, label: '后天' },
        ].map((d) => (
          <button
            key={d.offset}
            onClick={() => { setDayOffset(d.offset); setSchedule(null) }}
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

      <VoiceInput onResult={handleVoiceResult} title={`🗣️ 说说你${dayWord}要做什么`} />

      {/* Parsing state */}
      {parsing && (
        <div className="mt-4 p-4 bg-purple-50 rounded-2xl text-center animate-pulse">
          <p className="text-purple-600 text-sm">🤔 AI 正在理解你说的话...</p>
        </div>
      )}

      {/* Input text feedback */}
      {inputText && !parsing && (
        <div className="mt-3 p-3 bg-gray-50 rounded-xl text-sm">
          <span className="text-gray-400 text-xs">你说的：</span>
          <p className="text-gray-700 mt-0.5">"{inputText}"</p>
        </div>
      )}

      {/* Error feedback */}
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 flex items-start gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Parsed tasks */}
      {tasks.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold text-sm text-gray-600">
              🎯 识别到 {tasks.length} 个任务
            </h2>
            <button
              onClick={() => { setTasks([]); setInputText(''); setSchedule(null) }}
              className="text-xs text-gray-400 hover:text-red-400 transition"
            >
              清除
            </button>
          </div>

          {tasks.map((t, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 p-3 rounded-xl border shadow-sm ${TYPE_COLORS[t.task_type] || 'border-gray-200 bg-white'}`}
            >
              <span className="text-lg">{TYPE_ICONS[t.task_type] || '📋'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.title}</p>
                <div className="flex gap-2 text-[10px] text-gray-400 mt-0.5">
                  <span>{t.task_type === 'fixed' ? '固定任务' : t.task_type === 'protected' ? '保护时间' : '灵活任务'}</span>
                  <span>·</span>
                  <span>{t.priority === 'urgent' ? '🔴 紧急' : t.priority === 'low' ? '🟢 不急' : '🟡 普通'}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-sm font-mono text-gray-600">{t.estimated_minutes}min</span>
                {t.time_hint && (
                  <span className="block text-xs text-blue-500 mt-0.5 font-mono">{t.time_hint}</span>
                )}
              </div>
              <button
                onClick={() => removeTask(i)}
                className="shrink-0 text-gray-300 hover:text-red-500 text-lg leading-none px-1 transition"
                title="删除"
              >
                ×
              </button>
            </div>
          ))}

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full mt-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3.5
                       rounded-xl font-medium shadow-md hover:shadow-lg active:scale-[0.98]
                       disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                正在排程...
              </>
            ) : (
              <>🤖 生成{dayLabelText}日程</>
            )}
          </button>
        </div>
      )}

      {/* Generated schedule */}
      {schedule && (
        <div className="mt-6 space-y-2">
          <div className="bg-green-50 text-green-800 rounded-xl p-3 text-sm font-medium">
            {schedule.message}
          </div>
          {schedule.tips && schedule.tips.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800">
              <p className="font-medium mb-1.5 flex items-center gap-1">💡 小暖的贴心提醒</p>
              <ul className="space-y-1">
                {schedule.tips.map((tip, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-amber-400 shrink-0">·</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {schedule.slots.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3.5 rounded-xl border-l-4 bg-white shadow-sm
                         transition-all hover:shadow-md hover:-translate-y-0.5"
              style={{ borderLeftColor: s.color }}
            >
              <span className="text-xs font-mono text-gray-500 w-24 shrink-0">
                {s.start_time}-{s.end_time}
              </span>
              <span className="flex-1 text-sm font-medium">{s.label}</span>
              <span className="text-xs text-gray-300">
                {s.is_locked ? '🔒' : '📝'}
              </span>
            </div>
          ))}
          {schedule.deferred_task_ids.length > 0 && (
            <div className="p-3 bg-orange-50 rounded-xl text-sm text-orange-600 flex items-center gap-2">
              <span>⚠️</span>
              <span>{schedule.deferred_task_ids.length} 项任务今天排不下，已建议顺延到后天</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
