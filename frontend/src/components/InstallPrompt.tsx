import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if ((navigator as any).standalone === true) return true // iOS
  return false
}

function isIOSDevice(): boolean {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone())
  const [showIOSHint, setShowIOSHint] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const ios = isIOSDevice()

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!deferred) return
    deferred.prompt()
    const choice = await deferred.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    setDeferred(null)
  }

  // Nothing to show if already installed, dismissed, or not installable yet.
  if (installed || dismissed) return null
  if (!ios && !deferred) return null

  if (ios) {
    return (
      <>
        <div className="fixed top-0 left-0 right-0 z-[60] bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-2.5 animate-slide-down">
          {showIOSHint ? (
            <div className="max-w-md mx-auto text-sm text-gray-700">
              <div className="font-semibold mb-1">📲 添加到主屏幕（iPhone）</div>
              <ol className="list-decimal list-inside space-y-0.5 text-gray-600">
                <li>点浏览器底部的 <b>分享</b> 按钮（⬆️ 方框箭头）</li>
                <li>往下滑，点 <b>「添加到主屏幕」</b></li>
                <li>点右上角 <b>「添加」</b> 完成</li>
              </ol>
              <button
                onClick={() => setShowIOSHint(false)}
                className="mt-1.5 text-blue-600 font-medium"
              >
                知道了
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowIOSHint(true)}
              className="w-full max-w-md mx-auto flex items-center justify-center gap-2 bg-blue-600 text-white text-sm font-semibold py-2 rounded-xl"
            >
              📲 安装到主屏幕（独立 App 图标）
            </button>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-2.5 animate-slide-down">
      <div className="max-w-md mx-auto flex items-center gap-3">
        <span className="text-sm text-gray-700 flex-1">📲 安装成独立 App，随时离线打开</span>
        <button
          onClick={() => setDismissed(true)}
          className="text-gray-400 text-xs px-1"
        >
          稍后
        </button>
        <button
          onClick={install}
          className="bg-blue-600 text-white text-sm font-semibold px-4 py-1.5 rounded-xl"
        >
          安装
        </button>
      </div>
    </div>
  )
}
