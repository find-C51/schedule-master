import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import HomePage from './pages/HomePage'
import GoalPage from './pages/GoalPage'
import SchedulePage from './pages/SchedulePage'
import SettingsPage from './pages/SettingsPage'
import StatsPage from './pages/StatsPage'
import AssistantPage from './pages/AssistantPage'
import InstallPrompt from './components/InstallPrompt'

function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 1800)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex flex-col items-center justify-center z-50 animate-fade-in">
      <div className="text-7xl mb-4 animate-bounce">📅</div>
      <h1 className="text-3xl font-bold text-white mb-2">日程智排</h1>
      <p className="text-white/70 text-sm">AI 每日时间规划智能体</p>
      <div className="mt-6 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 bg-white/80 rounded-full animate-pulse"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

function NavBar() {
  const location = useLocation()
  const links = [
    { path: '/assistant', label: '小暖', icon: '🧡' },
    { path: '/', label: '今日', icon: '📅' },
    { path: '/schedule', label: '排程', icon: '📋' },
    { path: '/goals', label: '目标', icon: '🎯' },
    { path: '/stats', label: '进度', icon: '📊' },
    { path: '/settings', label: '设置', icon: '⚙️' },
  ]
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 z-50 safe-bottom">
      <div className="flex justify-around py-2 max-w-md mx-auto px-1">
        {links.map((l) => {
          const active = location.pathname === l.path
          return (
            <Link
              key={l.path}
              to={l.path}
              className={`flex flex-col items-center text-xs px-3 py-1.5 rounded-xl transition-all duration-200 ${
                active
                  ? 'text-blue-600 font-semibold scale-105'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <span className={`text-lg transition-transform ${active ? 'scale-110' : ''}`}>
                {l.icon}
              </span>
              <span className="text-[10px] mt-0.5">{l.label}</span>
              {active && (
                <div className="w-1 h-1 bg-blue-500 rounded-full mt-0.5" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export default function App() {
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem('splash-shown')
  })

  const dismissSplash = () => {
    setShowSplash(false)
    sessionStorage.setItem('splash-shown', '1')
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      {showSplash && <SplashScreen onDone={dismissSplash} />}
      <InstallPrompt />
      <div className="min-h-screen pb-20 animate-fade-in">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/goals" element={<GoalPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/stats" element={<StatsPage />} />
        </Routes>
        <NavBar />
      </div>
    </BrowserRouter>
  )
}
