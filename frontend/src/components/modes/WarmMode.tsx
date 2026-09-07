import { SlotData } from '../../services/api'

interface Props {
  slots: SlotData[]
  doneTaskIds: Set<number>
  onToggle: (slot: SlotData) => void
}

function getGreeting(): { emoji: string; text: string } {
  const h = new Date().getHours()
  if (h < 8) return { emoji: '🌅', text: '早上好呀～新的一天开始啦！记得吃早餐哦 ☀️' }
  if (h < 12) return { emoji: '🌤', text: '上午好！精神最好的时候，冲一波重要任务吧～' }
  if (h < 14) return { emoji: '🍜', text: '中午好！吃饱了吗？眯一会儿下午更有精神 💤' }
  if (h < 18) return { emoji: '🌿', text: '下午好～下午茶时间到了吗？再坚持一下就下课啦！' }
  if (h < 21) return { emoji: '🌆', text: '傍晚好～今天白天辛苦啦，晚上属于自己 ✨' }
  return { emoji: '🌙', text: '夜深了～收拾一下准备休息吧，今天超棒的！' }
}

function getClosing(completeCount: number, totalCount: number): string {
  if (totalCount === 0) return '今天好好放松～明天再出发 🌸'
  if (completeCount === totalCount) return '全部完成啦！你太厉害了，快给自己鼓个掌 👏🎉'
  if (completeCount >= totalCount * 0.7) return '大部分都搞定了，剩下的别给自己太大压力～已经很棒了 💪'
  if (completeCount >= totalCount * 0.4) return '进度过半，按自己的节奏来就好～你没问题的 🌟'
  return '慢慢来，每一步都算数，不着急～🍃'
}

function getTaskEmoji(index: number, locked: boolean): string {
  if (locked) return '📌'
  const emojis = ['✨', '📝', '💡', '🎯', '🔖', '🌟', '📖', '🎨']
  return emojis[index % emojis.length]
}

function getEncouragement(index: number): string {
  const encouragements = [
    '从这个开始吧～', '这个也重要哦', '加油加油！', '你可以的！',
    '慢慢来～', '坚持就是胜利', '小暖陪你一起', '这个很快的',
    '做完奖励自己一杯奶茶 🧋', '你已经很棒了',
  ]
  return encouragements[index % encouragements.length]
}

export default function WarmMode({ slots, doneTaskIds, onToggle }: Props) {
  const greeting = getGreeting()
  const doneCount = slots.filter((s) => doneTaskIds.has(s.task_id)).length
  const closing = getClosing(doneCount, slots.length)

  return (
    <div className="space-y-3">
      {/* Greeting card */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-5 shadow-sm border border-amber-100">
        <div className="flex items-start gap-3">
          <span className="text-3xl">{greeting.emoji}</span>
          <div>
            <p className="text-amber-900 font-medium text-sm leading-relaxed">
              {greeting.text}
            </p>
            <p className="text-amber-600 text-xs mt-1">
              — 小暖学姐 💛
            </p>
          </div>
        </div>
      </div>

      {slots.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm border border-gray-100">
          <span className="text-5xl block mb-3">🌿</span>
          <p className="text-gray-500 text-sm">今天没有安排呢～</p>
          <p className="text-gray-400 text-xs mt-1">好好享受悠闲的一天吧</p>
        </div>
      ) : (
        <>
          {slots.map((s, i) => {
            const emoji = getTaskEmoji(i, s.is_locked)
            const encouragement = getEncouragement(i)
            const isDone = doneTaskIds.has(s.task_id)
            return (
              <div
                key={i}
                className={`bg-white rounded-2xl p-4 shadow-sm border border-gray-100
                           transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] ${isDone ? 'opacity-60' : ''}`}
                style={{ borderLeftWidth: '4px', borderLeftColor: isDone ? '#9ca3af' : s.color }}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onToggle(s)}
                    className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs transition
                      ${isDone ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}
                    title={isDone ? '取消完成' : '标记完成'}
                  >
                    {isDone ? '✓' : ''}
                  </button>
                  <span className="text-xl">{emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium text-gray-800 truncate ${isDone ? 'line-through text-gray-400' : ''}`}>
                      {s.label}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400 font-mono">
                        {s.start_time} → {s.end_time}
                      </span>
                      {s.is_locked && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-400 rounded">
                          固定
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-300 shrink-0">
                    {encouragement}
                  </span>
                </div>
              </div>
            )
          })}

          {/* Bottom badge */}
          <div className="text-center text-xs text-gray-400 py-2">
            {doneCount}/{slots.length} 项已完成 · {slots.filter(s => s.is_locked).length} 项固定
          </div>
        </>
      )}

      {/* Closing card */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-4 shadow-sm border border-purple-100">
        <p className="text-purple-800 text-sm text-center">{closing}</p>
      </div>
    </div>
  )
}
