import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { assistantChat, createTask, generateSchedule, fetchBrief, Task, ChatResponse } from '../services/api'
import { localDateStr } from '../utils/date'

interface Msg {
  role: 'user' | 'assistant'
  text: string
  tasks?: Partial<Task>[]
  suggestions?: string[]
  generating?: boolean
}

const QUICK_PROMPTS = ['今天有什么安排？', '帮我安排明天', '我好累', '明天8点上数学课到9点40，下午去图书馆']

const TYPE_COLORS: Record<string, string> = {
  fixed: 'border-red-300 bg-red-50 text-red-700',
  flexible: 'border-blue-300 bg-blue-50 text-blue-700',
  protected: 'border-green-300 bg-green-50 text-green-700',
}

function TypingDots() {
  return (
    <div className="flex gap-1 items-center h-5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const scrollToBottom = () => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)
  }

  // Initial greeting — use today's brief if available
  useEffect(() => {
    if (loaded) return
    setLoaded(true)
    fetchBrief()
      .then((b) => {
        setMessages([{
          role: 'assistant',
          text: `你好呀，我是小暖 💛 你的日程搭子～\n\n${b.headline}\n${b.body}`,
          suggestions: QUICK_PROMPTS,
        }])
      })
      .catch(() => {
        const h = new Date().getHours()
        const greet = h < 12 ? '上午好呀！' : h < 18 ? '下午好呀！' : '晚上好呀！'
        setMessages([{
          role: 'assistant',
          text: `${greet}我是小暖，你的日程搭子 💛\n告诉我今天或明天想做什么，我帮你安排得明明白白～`,
          suggestions: QUICK_PROMPTS,
        }])
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(scrollToBottom, [messages, typing])

  const pushAssistant = (res: ChatResponse) => {
    setMessages((prev) => [...prev, {
      role: 'assistant',
      text: res.reply,
      tasks: res.tasks?.length ? res.tasks : undefined,
      suggestions: res.suggestions?.length ? res.suggestions : undefined,
    }])
  }

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim()
    if (!text || typing) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text }])
    setTyping(true)
    try {
      const res = await assistantChat(text)
      pushAssistant(res)
    } catch {
      pushAssistant({ reply: '哎呀，网络好像开小差了，稍后再试一次好吗？😥', tasks: [], suggestions: [], action: 'fallback' })
    } finally {
      setTyping(false)
    }
  }

  const tomorrow = localDateStr(1)
  const fmtTomorrow = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  })()

  const handleGenerate = async (tasks: Partial<Task>[], msgIndex: number) => {
    // Mark this message as generating
    setMessages((prev) => prev.map((m, i) => i === msgIndex ? { ...m, generating: true } : m))
    try {
      const fixedIds: number[] = []
      const flexIds: number[] = []
      for (const t of tasks) {
        const created = await createTask({
          title: t.title, task_type: t.task_type, priority: t.priority,
          estimated_minutes: t.estimated_minutes, time_hint: t.time_hint,
        })
        if (t.task_type === 'fixed') fixedIds.push(created.id)
        else flexIds.push(created.id)
      }
      const s = await generateSchedule(tomorrow, fixedIds, flexIds)
      const tipText = s.tips?.length ? `\n\n💡 ${s.tips.join('；')}` : ''
      setMessages((prev) => [...prev, {
        role: 'assistant',
        text: `排好啦！明天（${fmtTomorrow}）一共 ${s.slots.length} 个时段，已经帮你锁好了 ✅${tipText}\n\n点下方「查看日程」直接看明天～`,
        suggestions: ['查看日程', '再补充几件事'],
      }])
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        text: '生成的时候出了点小问题，不过任务我已经记下来了，去「排程」页再点一下生成就好～',
        suggestions: ['去排程页'],
      }])
    } finally {
      setMessages((prev) => prev.map((m, i) => i === msgIndex ? { ...m, generating: false } : m))
    }
  }

  return (
    <div className="max-w-md mx-auto flex flex-col h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 z-10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-xl shadow-sm">
          🧡
        </div>
        <div className="flex-1">
          <p className="font-bold text-sm text-gray-800">小暖</p>
          <p className="text-[10px] text-green-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> 在线 · 随时陪你
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/50">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-sm mr-2 shrink-0 self-end">
                🧡
              </div>
            )}
            <div className={`max-w-[80%] ${m.role === 'user' ? 'order-1' : ''}`}>
              <div
                className={`px-4 py-2.5 rounded-2xl whitespace-pre-wrap text-sm leading-relaxed shadow-sm animate-slide-up ${
                  m.role === 'user'
                    ? 'bg-blue-500 text-white rounded-br-sm'
                    : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'
                }`}
              >
                {m.text}
              </div>

              {/* Parsed task cards */}
              {m.tasks && m.tasks.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {m.tasks.map((t, ti) => (
                    <div
                      key={ti}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${TYPE_COLORS[t.task_type || 'flexible'] || 'border-gray-200'}`}
                    >
                      <span>{t.task_type === 'fixed' ? '🔒' : t.task_type === 'protected' ? '🛡' : '📝'}</span>
                      <span className="flex-1 truncate font-medium">{t.title}</span>
                      <span className="text-xs opacity-70 font-mono shrink-0">{t.estimated_minutes}min</span>
                      {t.time_hint && <span className="text-xs opacity-70 font-mono shrink-0">{t.time_hint}</span>}
                    </div>
                  ))}
                  <button
                    onClick={() => handleGenerate(m.tasks!, i)}
                    disabled={m.generating}
                    className="mt-1 w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white py-2.5
                               rounded-xl text-sm font-medium shadow-sm active:scale-[0.98] transition
                               disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {m.generating ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        正在排程...
                      </>
                    ) : (
                      <>✨ 一键生成日程</>
                    )}
                  </button>
                </div>
              )}

              {/* Suggestion chips */}
              {m.suggestions && m.suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.suggestions.map((s, si) => {
                    const isNav = s === '查看日程'
                    return (
                      <button
                        key={si}
                        onClick={() => (isNav ? navigate('/?day=1') : send(s))}
                        className="px-3 py-1.5 rounded-full text-xs border border-amber-200 bg-amber-50 text-amber-700
                                   hover:bg-amber-100 active:scale-95 transition"
                      >
                        {s}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-sm mr-2 self-end">🧡</div>
            <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="bg-white border-t border-gray-100 px-3 py-2.5 safe-bottom">
        <div className="flex gap-2 items-end">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="跟我说说你的安排..."
            className="flex-1 resize-none border border-gray-200 rounded-xl px-4 py-2.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-amber-300 max-h-24"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || typing}
            className="shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl
                       w-11 h-11 flex items-center justify-center shadow-sm
                       active:scale-95 transition disabled:opacity-40"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
