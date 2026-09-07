import { SlotData } from '../../services/api'

interface Props {
  slots: SlotData[]
  doneTaskIds: Set<number>
  onToggle: (slot: SlotData) => void
}

const QUEST_TITLES = [
  '击败拖延兽', '收集知识碎片', '修炼专注力', '突破舒适区',
  '攻略重点章', '解锁新技能', '扫荡习题本', '挑战限时任务',
  '清除待办魔物', '领取晨间Buff',
]

const REWARDS = [
  '🎁 追一集喜欢的剧', '🍰 奖励一块小蛋糕', '🎵 听一首新歌',
  '📱 刷10分钟小红书', '🎮 打一局游戏', '☕ 买杯奶茶',
  '📺 看半小时综艺', '🍿 边吃零食边休息',
]

export default function GameMode({ slots, doneTaskIds, onToggle }: Props) {
  const lockedCount = slots.filter(s => s.is_locked).length
  const flexCount = slots.filter(s => !s.is_locked).length
  const totalDone = slots.filter(s => doneTaskIds.has(s.task_id)).length
  const totalSlots = slots.length

  // HP: increases as tasks get completed
  const hpPercent = totalSlots > 0
    ? Math.max(20, 100 - Math.round(((totalSlots - totalDone) / totalSlots) * 60))
    : 100

  // EXP
  const expEarned = totalDone * 15
  const totalExp = totalSlots * 15
  const level = Math.floor(expEarned / 50) + 1

  // Streak
  const streak = totalDone >= totalSlots && totalSlots > 0 ? '🔥'.repeat(Math.min(5, totalDone)) : ''

  const getRandomReward = () => REWARDS[Math.floor(Math.random() * REWARDS.length)]

  return (
    <div className="space-y-3">
      {/* Player stats card */}
      <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 text-white rounded-2xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-lg font-bold">⚔️ 日程冒险</p>
            <p className="text-xs text-purple-200">Lv.{level} 冒险者 · {streak}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{totalDone}/{totalSlots}</p>
            <p className="text-xs text-purple-200">任务完成</p>
          </div>
        </div>

        {/* HP Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span>❤️ HP</span>
            <span>{hpPercent}/100</span>
          </div>
          <div className="bg-white/20 rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${
                hpPercent > 60 ? 'bg-green-400' : hpPercent > 30 ? 'bg-yellow-400' : 'bg-red-400'
              }`}
              style={{ width: `${hpPercent}%` }}
            />
          </div>
        </div>

        {/* EXP Bar */}
        <div className="space-y-1.5 mt-2">
          <div className="flex justify-between text-xs">
            <span>⭐ EXP</span>
            <span>{expEarned}/{totalExp}</span>
          </div>
          <div className="bg-white/20 rounded-full h-2 overflow-hidden">
            <div
              className="bg-yellow-300 h-2 rounded-full transition-all duration-500"
              style={{ width: `${totalExp > 0 ? Math.round((expEarned / totalExp) * 100) : 0}%` }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-3 mt-3 text-xs text-purple-200">
          <span>🏰 主线×{lockedCount}</span>
          <span>📜 支线×{flexCount}</span>
          <span>🛡️ 午休回血</span>
        </div>
      </div>

      {/* Quest list */}
      {slots.map((s, i) => {
        const isDone = doneTaskIds.has(s.task_id)
        const questTitle = QUEST_TITLES[i % QUEST_TITLES.length]
        return (
          <button
            key={i}
            onClick={() => onToggle(s)}
            className={`w-full flex items-center gap-3 p-4 rounded-2xl border-l-4 shadow-sm
              transition-all duration-200 hover:shadow-md active:scale-[0.98] text-left
              ${isDone
                ? 'bg-gray-50 border-gray-300 opacity-60'
                : 'bg-white hover:-translate-y-0.5'
              }`}
            style={{ borderLeftColor: isDone ? '#d1d5db' : s.color }}
          >
            {/* Quest icon */}
            <span className={`text-2xl shrink-0 transition-all ${isDone ? 'grayscale' : ''}`}>
              {s.is_locked ? '🏰' : '📜'}
            </span>

            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                {s.label}
              </p>
              <p className="text-[10px] text-gray-400">
                {questTitle} · {s.start_time}-{s.end_time}
              </p>
            </div>

            {/* Reward / check */}
            <div className="text-right shrink-0">
              {isDone ? (
                <span className="text-lg">✅</span>
              ) : (
                <span className="text-xs text-purple-500 font-mono">
                  +{s.is_locked ? 5 : 10}EXP
                </span>
              )}
            </div>
          </button>
        )
      })}

      {/* Completion reward */}
      {totalDone === totalSlots && totalSlots > 0 && (
        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-2xl p-4 text-center border border-yellow-200 shadow-sm animate-bounce">
          <p className="text-lg mb-1">🏆 副本通关！</p>
          <p className="text-sm text-yellow-700">{getRandomReward()}</p>
        </div>
      )}

      {slots.length === 0 && (
        <div className="bg-gray-50 rounded-2xl p-6 text-center shadow-sm">
          <p className="text-4xl mb-2">🏕️</p>
          <p className="text-gray-500 text-sm">暂无副本</p>
          <p className="text-gray-400 text-xs">去排程页创建明天的冒险吧</p>
        </div>
      )}
    </div>
  )
}
