import { useState, useEffect } from 'react'
import { fetchSettings, updateSettings } from '../services/api'

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSettings()
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (!settings) return
    await updateSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) {
    return (
      <div className="max-w-md mx-auto p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-24" />
          <div className="h-24 bg-gray-200 rounded-2xl" />
          <div className="h-24 bg-gray-200 rounded-2xl" />
          <div className="h-40 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!settings) return <div className="p-4 text-gray-400">加载失败，请刷新重试</div>

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">⚙️ 设置</h1>
      <p className="text-gray-500 text-sm mb-4">定制你的专属日程助手</p>

      {/* Schedule Policy */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-3 border border-gray-100">
        <h2 className="font-semibold text-sm mb-3">📊 排程策略</h2>
        <div className="space-y-2">
          {[
            { key: 'efficiency_first', icon: '⚡', label: '效率优先', desc: '重要的事情先排进日程', color: 'border-blue-500 bg-blue-50 text-blue-700' },
            { key: 'hard_time_first', icon: '🔒', label: '固定时间优先', desc: '有时间要求的任务先锁定', color: 'border-red-500 bg-red-50 text-red-700' },
            { key: 'deadline_first', icon: '⏰', label: 'DDL 优先', desc: '快到截止日期的任务先排', color: 'border-orange-500 bg-orange-50 text-orange-700' },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSettings({ ...settings, schedule_policy: opt.key })}
              className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                settings.schedule_policy === opt.key ? opt.color : 'border-gray-100 hover:border-gray-200'
              }`}
            >
              <p className="text-sm font-medium">{opt.icon} {opt.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Interaction Mode */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-3 border border-gray-100">
        <h2 className="font-semibold text-sm mb-3">🎨 默认交互模式</h2>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: 'table', label: '📋 表格' },
            { key: 'swift', label: '⚡ 效率' },
            { key: 'warm', label: '🍃 暖心' },
            { key: 'game', label: '🎮 趣味' },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSettings({ ...settings, interaction_mode: opt.key })}
              className={`px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all ${
                settings.interaction_mode === opt.key
                  ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                  : 'border-gray-100 hover:border-gray-200 text-gray-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Protection Rules */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-3 border border-gray-100">
        <h2 className="font-semibold text-sm mb-3">🛡 保护时间</h2>
        <p className="text-xs text-gray-400 mb-3">这些时间段不会被排入灵活任务</p>
        {(settings.protection_rules && typeof settings.protection_rules === 'object')
          ? Object.entries(settings.protection_rules).map(([key, rule]: [string, any]) => {
            const labels: Record<string, string> = {
              breakfast: '🥐 早餐', lunch: '🍱 午餐', nap: '😴 午休',
              dinner: '🍲 晚餐', sleep: '🌙 睡眠',
            }
            return (
              <div key={key} className="flex items-center gap-2 mb-2 text-sm">
                <span className="w-20 text-gray-500 text-xs shrink-0">
                  {labels[key] || key}
                </span>
                <input
                  className="border border-gray-200 rounded-lg px-2 py-1.5 w-20 text-center text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-200 font-mono"
                  value={rule.start}
                  onChange={(e) => setSettings({
                    ...settings,
                    protection_rules: {
                      ...settings.protection_rules,
                      [key]: { ...rule, start: e.target.value },
                    },
                  })}
                  placeholder="07:00"
                />
                <span className="text-gray-300">—</span>
                <input
                  className="border border-gray-200 rounded-lg px-2 py-1.5 w-20 text-center text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-200 font-mono"
                  value={rule.end}
                  onChange={(e) => setSettings({
                    ...settings,
                    protection_rules: {
                      ...settings.protection_rules,
                      [key]: { ...rule, end: e.target.value },
                    },
                  })}
                  placeholder="08:00"
                />
              </div>
            )
          })
          : <p className="text-sm text-gray-400">加载保护规则中...</p>
        }
      </div>

      {/* Reminder */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 border border-gray-100">
        <h2 className="font-semibold text-sm mb-3">🔔 提醒设置</h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <div className={`relative w-11 h-6 rounded-full transition-colors ${
            settings.reminder_enabled ? 'bg-blue-500' : 'bg-gray-300'
          }`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              settings.reminder_enabled ? 'translate-x-5.5' : 'translate-x-0.5'
            }`} />
          </div>
          <input
            type="checkbox"
            checked={!!settings.reminder_enabled}
            onChange={(e) => setSettings({ ...settings, reminder_enabled: e.target.checked ? 1 : 0 })}
            className="sr-only"
          />
          <span className="text-sm text-gray-700">开启任务提醒</span>
        </label>
        {settings.reminder_enabled ? (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-xs text-gray-500">提前</span>
            <select
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={settings.reminder_minutes}
              onChange={(e) => setSettings({ ...settings, reminder_minutes: parseInt(e.target.value) })}
            >
              <option value="5">5 分钟</option>
              <option value="10">10 分钟</option>
              <option value="15">15 分钟</option>
              <option value="30">30 分钟</option>
            </select>
            <span className="text-xs text-gray-500">提醒</span>
          </div>
        ) : null}
      </div>

      <button
        onClick={handleSave}
        className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3.5
                   rounded-xl font-medium shadow-md hover:shadow-lg active:scale-[0.98]
                   transition-all flex items-center justify-center gap-2"
      >
        {saved ? '✅ 已保存' : '💾 保存设置'}
      </button>
    </div>
  )
}
