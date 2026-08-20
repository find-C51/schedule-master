import { useState, useEffect } from 'react'
import { fetchGoals, createGoal, deleteGoal, Goal } from '../services/api'

const LEVEL_DISPLAY: Record<string, { icon: string; label: string; color: string }> = {
  big: { icon: '🏔️', label: '大目标', color: 'bg-purple-100 text-purple-700' },
  long: { icon: '📅', label: '长期', color: 'bg-blue-100 text-blue-700' },
  mid: { icon: '📆', label: '中期', color: 'bg-amber-100 text-amber-700' },
  daily: { icon: '✅', label: '每日', color: 'bg-green-100 text-green-700' },
}

const QUICK_GOALS = [
  '考研上岸', '考公上岸', '拿下奖学金', '完成毕业论文',
  '通过教资', '四六级600+', '减肥10斤', '学编程',
]

export default function GoalPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [title, setTitle] = useState('')
  const [level, setLevel] = useState('big')
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchGoals().then(setGoals).catch(() => {}) }, [])

  const handleCreate = async () => {
    if (!title.trim() || loading) return
    setLoading(true)
    try {
      const g = await createGoal({ title: title.trim(), level })
      setGoals([...goals, g])
      setTitle('')
    } catch {}
    setLoading(false)
  }

  const pickQuick = (text: string) => {
    setTitle(text)
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除这个目标吗？')) return
    await deleteGoal(id)
    setGoals(goals.filter((g) => g.id !== id))
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">🎯 目标体系</h1>
      <p className="text-gray-500 text-sm mb-4">
        四层拆解：大目标 → 长期 → 中期 → 每日小任务
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
          <select
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="big">🏔️ 大目标</option>
            <option value="long">📅 长期</option>
            <option value="mid">📆 中期</option>
            <option value="daily">✅ 每日</option>
          </select>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || loading}
            className="bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium
                       hover:bg-blue-600 active:scale-95 transition disabled:opacity-40 shrink-0"
          >
            {loading ? '...' : '添加'}
          </button>
        </div>
      </div>

      {/* Goal list */}
      {goals.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-5xl mb-3">🎯</p>
          <p className="text-gray-400 text-sm">还没有目标</p>
          <p className="text-gray-300 text-xs mt-1">添加一个大目标，AI 会帮你拆解成每日小任务</p>
        </div>
      ) : (
        <div className="space-y-2">
          {goals.map((g) => {
            const disp = LEVEL_DISPLAY[g.level] || LEVEL_DISPLAY.big
            return (
              <div key={g.id} className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100
                                          hover:shadow-md transition-all">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{g.title}</p>
                    {g.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{g.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full ${disp.color}`}>
                      {disp.icon} {disp.label}
                    </span>
                    <button
                      onClick={() => handleDelete(g.id)}
                      className="text-gray-300 hover:text-red-500 text-lg leading-none px-1 transition"
                      title="删除"
                    >
                      ×
                    </button>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-2 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-2.5 rounded-full transition-all duration-700 bg-gradient-to-r from-blue-400 to-blue-600"
                    style={{ width: `${Math.min(100, g.progress || 0)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <p className="text-[10px] text-gray-400">
                    {g.status === 'active' ? '🔄 进行中' : g.status === 'done' ? '✅ 已完成' : '⏸ 暂停'}
                  </p>
                  <p className="text-[10px] text-gray-400">{g.progress || 0}%</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
