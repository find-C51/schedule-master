import { useState, useRef, useEffect } from 'react'

interface Props {
  onResult: (text: string) => void
  title?: string
}

// 常用任务快捷模板（贴合学生生活）
const QUICK_TEMPLATES = [
  { label: '📚 上课', text: '上午8点到10点上课' },
  { label: '📝 写作业', text: '晚上写作业大概一小时' },
  { label: '📖 自习', text: '下午去图书馆自习两小时' },
  { label: '🍚 吃饭', text: '中午12点吃饭' },
  { label: '😴 午休', text: '中午12点半午休' },
  { label: '🏃 运动', text: '晚上跑步半小时' },
  { label: '📦 取快递', text: '取快递' },
  { label: '👥 开会', text: '下午2点到4点开会' },
]

// 示例句子，点一下填入输入框
const EXAMPLES = [
  '上午8点到10点马原课，下午2点到4点开会，晚上7点到9点家教，另外写文献综述、取快递',
  '明天8点30到9点50数据库原理，10点到12点操作系统，下午复习两小时',
  '早上7点半早餐，8点上数学课到9点40，晚上跑步半小时',
]

function AudioWave({ active }: { active: boolean }) {
  const bars = [4, 7, 3, 9, 5, 8, 4, 6, 7, 3, 9, 5, 8, 4, 6]
  return (
    <div className="flex items-center justify-center gap-1 h-8">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-1 bg-blue-500 rounded-full transition-all duration-150"
          style={{
            height: active ? `${h * 3 + Math.random() * 8}px` : '4px',
            opacity: active ? 0.9 : 0.3,
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
    </div>
  )
}

export default function VoiceInput({ onResult, title }: Props) {
  const [manualText, setManualText] = useState('')
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'done'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const recognitionRef = useRef<any>(null)

  // 检测语音是否可用（http 非 localhost 下不可用）
  const [voiceSupported] = useState(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const isSecure = window.isSecureContext || location.hostname === 'localhost'
    return !!SR && isSecure
  })

  useEffect(() => {
    return () => { if (recognitionRef.current) recognitionRef.current.abort() }
  }, [])

  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setErrorMsg('浏览器不支持语音，请用文字输入')
      setTimeout(() => setErrorMsg(''), 4000)
      return
    }
    try {
      const recognition = new SpeechRecognition()
      recognition.lang = 'zh-CN'
      recognition.interimResults = true
      recognition.continuous = false
      recognition.maxAlternatives = 1

      recognition.onstart = () => { setListening(true); setStatus('listening'); setErrorMsg('') }
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results).map((r: any) => r[0].transcript).join('')
        if (event.results[0].isFinal) {
          setStatus('processing')
          setTimeout(() => {
            onResult(transcript)
            setStatus('idle')
            setListening(false)
          }, 400)
        }
      }
      recognition.onerror = (e: any) => {
        setListening(false); setStatus('idle')
        if (e.error === 'not-allowed') setErrorMsg('请允许麦克风权限后重试')
        else if (e.error === 'no-speech') setErrorMsg('没听清，请再说一次')
        else if (e.error === 'network') setErrorMsg('语音识别需要联网，请检查网络')
        else setErrorMsg('语音识别失败，请用文字输入')
        setTimeout(() => setErrorMsg(''), 4000)
      }
      recognition.onend = () => { setListening(false); if (status === 'listening') setStatus('idle') }

      recognitionRef.current = recognition
      recognition.start()
    } catch {
      setErrorMsg('语音启动失败，请用文字输入')
      setTimeout(() => setErrorMsg(''), 4000)
    }
  }

  const handleManual = (text?: string) => {
    const t = (text ?? manualText).trim()
    if (t) {
      onResult(t)
      setManualText('')
    }
  }

  const fillExample = (text: string) => setManualText(text)

  return (
    <div className="space-y-3">
      {/* ── 主输入区：大字文字框 ── */}
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <p className="text-sm font-semibold text-gray-700 mb-2">
          {title ?? '🗣️ 说说你明天要做什么'}
        </p>
        <textarea
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[15px] leading-relaxed
                     focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400
                     placeholder:text-gray-300 transition resize-none min-h-[72px]"
          placeholder="例如：上午8点到10点马原课，下午2点到4点开会，晚上7点到9点家教，另外写文献综述、取快递"
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
        />
        <button
          onClick={() => handleManual()}
          disabled={!manualText.trim()}
          className="w-full mt-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-xl
                     font-medium shadow-md hover:shadow-lg active:scale-[0.98] transition
                     disabled:opacity-30 disabled:cursor-not-allowed"
        >
          🤖 智能识别并排程
        </button>

        {/* 语音按钮（辅助） */}
        <button
          onClick={startListening}
          disabled={listening}
          className={`w-full mt-2 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2
            ${listening ? 'bg-red-500 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
        >
          {listening ? (
            <>
              <AudioWave active />
              <span>正在聆听，请说话...</span>
            </>
          ) : (
            <>🎤 语音输入</>
          )}
        </button>
        {!voiceSupported && (
          <p className="text-[10px] text-gray-400 text-center mt-1.5">
            💡 手机浏览器需 HTTPS 才能用语音，请先用文字输入（一样智能）
          </p>
        )}
      </div>

      {/* 状态 / 错误提示 */}
      {status !== 'idle' && (
        <div className="text-center text-sm py-2">
          {status === 'listening' && <span className="text-blue-600 animate-pulse">🎤 正在聆听...</span>}
          {status === 'processing' && <span className="text-purple-600">🤔 正在理解你说的话...</span>}
        </div>
      )}
      {errorMsg && (
        <div className="text-center text-sm text-red-500 bg-red-50 rounded-lg py-2 animate-pulse">
          {errorMsg}
        </div>
      )}

      {/* ── 快捷模板 ── */}
      <div className="bg-white rounded-2xl shadow-sm p-3 border border-gray-100">
        <p className="text-xs font-medium text-gray-500 mb-2">⚡ 常用任务（点一下直接加入）</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => handleManual(t.text)}
              className="px-3 py-1.5 rounded-full text-xs border border-gray-200 bg-gray-50
                         text-gray-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50
                         active:scale-95 transition"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 示例句子 ── */}
      <div className="space-y-1.5">
        <p className="text-xs text-gray-400">试试这些例子（点一下填入）：</p>
        {EXAMPLES.map((ex, i) => (
          <button
            key={i}
            onClick={() => fillExample(ex)}
            className="w-full text-left p-2.5 bg-white rounded-lg text-xs text-gray-500 border border-gray-100
                       hover:border-blue-200 hover:text-gray-700 transition line-clamp-2"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  )
}
