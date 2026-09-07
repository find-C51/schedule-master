import { useState, useEffect, useCallback } from 'react'
import { fetchTasks, deleteTask, updateTaskStatus, fetchCompletionDates, Task } from '../services/api'
import { formatLocal } from '../utils/date'

function computeStreak(dates: string[]): number {
  const set = new Set(dates)
  const d = new Date()
  // Today may not be finished yet; don't break the streak for that.
  if (!set.has(formatLocal(d))) d.setDate(d.getDate() - 1)
  let streak = 0
  while (set.has(formatLocal(d))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export default function StatsPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [completionDates, setCompletionDates] = useState<string[]>([])

  const load = useCallback(() => {
    fetchTasks().then(setTasks).catch(() => {})
    fetchCompletionDates().then(setCompletionDates).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除这个任务吗？')) return
    await deleteTask(id)
    load()
  }

  const handleToggleDone = async (t: Task) => {
    const newStatus = t.status === 'done' ? 'pending' : 'done'
    await updateTaskStatus(t.id, newStatus)
    load()
  }

  const total = tasks.length
  const done = tasks.filter(t => t.status === 'done').length
  const inProgress = tasks.filter(t => t.status === 'in_progress').length
  const pending = tasks.filter(t => t.status === 'pending').length
  const rate = total > 0 ? Math.round((done / total) * 100) : 0

  const streakDays = computeStreak(completionDates)
  const totalDoneDays = new Set(completionDates).size
  const streakEmoji = Array.from({ length: 7 }, (_, i) =>
    i < streakDays ? '🔥' : '⚪'
  ).join('')

  return (
    <div className="max-w-md mx-auto p-4 pb-24">
      <h1 className="text-2xl font-bold mb-1">📊 进度追踪</h1>
      <p className="text-gray-500 text-sm mb-4">你的每一步都算数 ✨</p>

      {/* Streak */}
      <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-4 mb-4 border border-orange-100 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-orange-800">连续打卡 {streakDays} 天</p>
            <p className="text-xs text-orange-500 mt-0.5">
              累计 {totalDoneDays} 天有完成记录
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl tracking-wider">{streakEmoji}</div>
            {streakDays >= 3 && (
              <p className="text-xs text-orange-500 font-medium mt-1">状态火热！继续冲 🔥</p>
            )}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-2xl shadow-sm p-4 text-center border border-gray-100 hover:shadow-md transition-all">
          <p className="text-3xl font-bold text-blue-500">{total}</p>
          <p className="text-xs text-gray-400 mt-1">总任务</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4 text-center border border-gray-100 hover:shadow-md transition-all">
          <p className="text-3xl font-bold text-green-500">{done}</p>
          <p className="text-xs text-gray-400 mt-1">已完成</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4 text-center border border-gray-100 hover:shadow-md transition-all">
          <p className="text-3xl font-bold text-orange-500">{pending}</p>
          <p className="text-xs text-gray-400 mt-1">待完成</p>
        </div>
      </div>

      {/* Completion rate */}
      <div className="bg-white rounded-2xl shadow-sm p-5 mb-4 border border-gray-100">
        <div className="flex justify-between items-end mb-3">
          <p className="text-sm font-medium text-gray-600">📈 总体完成率</p>
          <p className="text-2xl font-bold text-green-500">{rate}%</p>
        </div>
        <div className="bg-gray-100 rounded-full h-4 overflow-hidden">
          <div
            className="h-4 rounded-full transition-all duration-1000 bg-gradient-to-r from-green-400 to-green-500"
            style={{ width: `${rate}%` }}
          >
            {rate > 15 && (
              <div className="h-full w-full rounded-full bg-gradient-to-r from-transparent to-white/20" />
            )}
          </div>
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-gray-400">
          <span>0%</span>
          <span>{inProgress > 0 ? `${inProgress} 项进行中` : ''}</span>
          <span>100%</span>
        </div>
      </div>

      {/* Recent tasks */}
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <p className="text-sm font-medium text-gray-600 mb-3">📋 最近任务</p>
        {tasks.slice(0, 15).map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-2 text-sm border-b border-gray-50 last:border-0">
            <button
              onClick={() => handleToggleDone(t)}
              className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] transition
                ${t.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}
              title="标记完成"
            >
              {t.status === 'done' ? '✓' : ''}
            </button>
            <span className={`flex-1 truncate ${t.status === 'done' ? 'line-through text-gray-300' : 'text-gray-700'}`}>
              {t.title}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
              t.status === 'done' ? 'bg-green-50 text-green-600' :
              t.status === 'in_progress' ? 'bg-blue-50 text-blue-600' :
              'bg-gray-100 text-gray-400'
            }`}>
              {t.status === 'done' ? '✅' : t.status === 'in_progress' ? '🔄' : '⏳'}
            </span>
            <button
              onClick={() => handleDelete(t.id)}
              className="shrink-0 text-gray-300 hover:text-red-500 px-1 transition"
              title="删除"
            >
              ×
            </button>
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-gray-400 text-sm">还没有任务记录</p>
            <p className="text-gray-300 text-xs mt-1">去排程页创建你的第一个日程吧</p>
          </div>
        )}
      </div>
    </div>
  )
}
