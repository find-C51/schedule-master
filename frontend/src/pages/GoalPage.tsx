import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchGoals, createDecomposedGoal, deleteGoal, scheduleDailyTasks, Goal,
} from '../services/api'
import { localDateStr } from '../utils/date'

const LEVEL_DISPLAY: Record<string, { icon: string; label: string; color: string }> = {
  big: { icon: '🏔️', label: '大目标', color: 'bg-purple-100 text-purple-700' },
  long: { icon: '📅', label: '长期', color: 'bg-blue-100 text-blue-700' },
  mid: { icon: '📆', label: '中期', color: 'bg-amber-100 text-amber-700' },
  daily: { icon: '✅', label: '每日', color: 'bg-green-100 text-green-700' },
}

const QUICK_GOALS = [
  '考研上岸', '考公上岸', '拿下奖学金', '完成毕业论文',
  '通过教资', '四六级600+', '减肥10斤', '学编程', '保研',
]

function collectDailyTitles(g: Goal): string[] {
  if (g.level === 'daily') return [g.title]
  return (g.children ?? []).flatMap(collectDailyTitles)
}

function GoalNode({ goal, depth, onAddSingle, onAddAll, onDelete }: {
  goal: Goal
  depth: number
  onAddSingle: (title: string) => void
  onAddAll: (goal: Goal) => void
  onDelete: (id: number) => void
}) {
  const [open, setOpen] = useState(depth < 2)
  const disp = LEVEL_DISPLAY[goal.level] ?? LEVEL_DISPLAY.big
  const hasChildren = goal.children && goal.children.length > 0
  const isDaily = goal.level === 'daily'
  const dailyCount = isDaily ? 1 : collectDailyTitles(goal).length

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5"
        style={{ paddingLeft: depth * 14 }}
      >
        <button
          onClick={() => hasChildren && setOpen(!open)}
          className={`w-4 text-gray-400 text-xs shrink-0 ${hasChildren ? 'hover:text-gray-600' : 'cursor-default'}`}
          aria-label="展开/收起"
        >
          {hasChildren ? (open ? '▾' : '▸') : ''}
        </button>
        <span className="text-sm shrink-0">{disp.icon}</span>
        <span className={`flex-1 min-w-0 truncate ${isDaily ? 'text-xs text-gray-500' : 'text-sm font-medium text-gray-800'}`}>
          {goal.title}
        </span>
        {isDaily && (
          <button
            onClick={() => onAddSingle(goal.title)}
            className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-600
                       border border-green-200 hover:bg-green-500 hover:text-white transition active:scale-95"
          >
            ＋今日
          </button>
        )}
      </div>
      {open && hasChildren && (
        <div className="border-l border-gray-100 ml-3">
          {goal.children.map((c) => (
            <GoalNode
              key={c.id}
              goal={c}
              depth={depth + 1}
              onAddSingle={onAddSingle}
              onAddAll={onAddAll}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
      {/* Root: daily-count + one-click add-to-today */}
      {depth === 0 && (
        <div className="flex items-center justify-between mt-1 mb-1" style={{ paddingLeft: 14 }}>
          <span className="text-[11px] text-gray-400">
            {dailyCount} 个每日任务 · 自动拆解完成
          </span>
          <button
            onClick={() => onAddAll(goal)}
            className="text-[11px] px-2.5 py-1 rounded-full bg-blue-500 text-white
                       hover:bg-blue-600 active:scale-95 transition shadow-sm"
          >
            📅 加入今日日程
          </button>
        </div>
      )}
    </div>
  )
}

export default function GoalPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)
  const navigate = useNavigate()

  useEffect(() => { fetchGoals().then(setGoals).catch(() => {}) }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2600)
  }

  const handleCreate = async () => {
    if (!title.trim() || loading) return
    setLoading(true)
    try {
      const root = await createDecomposedGoal(title.trim())
      setGoals([...goals, root])
      setTitle('')
      const n = collectDailyTitles(root).length
      showToast(`🎉 已拆解成 ${n} 个每日任务，点「加入今日日程」就能排进今天`)
    } catch {
      showToast('创建失败，请重试')
    }
    setLoading(false)
  }

  const pickQuick = (text: string) => setTitle(text)

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除这个目标及其所有子任务吗？')) return
    await deleteGoal(id)
    setGoals(goals.filter((g) => g.id !== id))
    showToast('已删除')
  }

  const handleAddAll = async (goal: Goal) => {
    const titles = collectDailyTitles(goal)
    if (!titles.length) return
    await scheduleDailyTasks(localDateStr(0), titles)
    showToast(`📅 已把 ${titles.length} 个每日任务排进今天`)
  }

  const handleAddSingle = async (taskTitle: string) => {
    await scheduleDailyTasks(localDateStr(0), [taskTitle])
    showToast('📅 已加入今天的日程')
  }

  return (
    <div className="max-w-md mx-auto p-4 pb-24">
      <h1 className="text-2xl font-bold mb-1">🎯 目标体系</h1>
      <p className="text-gray-500 text-sm mb-4">
        输入大目标，AI 自动拆解成 大目标 → 长期 → 中期 → 每日任务
      </p>

      {/* Quick pick */}
      <div className="mb-4">
        <p className="text-xs text-gray-400 mb-2">💡 快速选择常见目标：</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_GOALS.map((g) => (
            <button
              key={g}
              onClick={() => pickQuick(g)}
              className={`px-3 py-1 rounded-full text-xs border transition-all
                ${title === g
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-500'
                }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Create form */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 border border-gray-100">
        <div className="flex gap-2">
          <input
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400
                       placeholder:text-gray-300"
            placeholder="输入你的大目标，如：考上研究生"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={!title.trim() || loading}
            className="bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium
                       hover:bg-blue-600 active:scale-95 transition disabled:opacity-40 shrink-0"
          >
            {loading ? '拆解中…' : '✨ 拆解'}
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          例：「考研上岸」「减肥10斤」会匹配专属模板；其他目标用通用拆解
        </p>
      </div>

      {/* Goal list */}
      {goals.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-5xl mb-3">🎯</p>
          <p className="text-gray-400 text-sm">还没有目标</p>
          <p className="text-gray-300 text-xs mt-1">添加一个大目标，AI 会帮你拆解成每日小任务</p>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => {
            return (
              <div key={g.id} className="bg-white rounded-2xl shadow-sm p-3 border border-gray-100 hover:shadow-md transition-all">
                <div className="flex justify-between items-start">
                  <span className="text-sm font-semibold text-gray-800">{g.title}</span>
                  <button
                    onClick={() => handleDelete(g.id)}
                    className="text-gray-300 hover:text-red-500 text-lg leading-none px-1 transition shrink-0"
                    title="删除"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-2">
                  <GoalNode
                    goal={g}
                    depth={0}
                    onAddSingle={handleAddSingle}
                    onAddAll={handleAddAll}
                    onDelete={handleDelete}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-[85%]">
          <div className="bg-gray-900 text-white text-sm rounded-xl px-4 py-3 shadow-lg flex items-center gap-2">
            <span className="whitespace-normal">{toast}</span>
            <button onClick={() => navigate('/')} className="shrink-0 text-blue-300 text-xs font-medium">
              去今日页 →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
