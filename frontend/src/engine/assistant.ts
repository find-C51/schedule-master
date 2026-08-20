// Assistant ("小暖") chat brain — rule-based, caring, fully offline.
// Routes user intent → warm reply + optional parsed tasks / suggestions.

import { parseIntent, ParsedTask } from './intentParser'
import { decomposeGoal } from './goalDecomposer'
import { getDb, mutateDb, saveGoalTree } from '../store/db'

export interface ChatTask {
  title?: string
  task_type?: string
  priority?: string
  estimated_minutes?: number
  time_hint?: string
}

export interface ChatResponse {
  reply: string
  tasks: ChatTask[]
  suggestions: string[]
  action: string
}

export interface BriefResponse {
  headline: string
  body: string
  tips: string[]
  mood: string
}

function dateStr(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function timeGreeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  if (h < 21) return '傍晚好'
  return '晚上好'
}

// ── Intent detection ──
const VIEW_PATTERNS = [/有什么安排/, /什么.*安排/, /安排.*什么/, /日程/, /排了什么/, /今天.*忙/, /明天.*忙/, /计划/, /要做什么/, /有啥事/]
const GREET_PATTERNS = [/^你?好/, /哈喽/, /^嗨/, /^hi\b/i, /hello/i, /在吗/, /早上好/, /下午好/, /晚上好/, /^早$/]
const THANKS_PATTERNS = [/谢谢/, /感谢/, /辛苦/]
const NEG_EMOTIONS: Array<{ re: RegExp; reply: (g: string) => string }> = [
  {
    re: /累|疲惫|困|没力气|筋疲力尽/,
    reply: () => '辛苦啦，先抱抱你 🫂 你已经做得很好了，不用事事都扛着。\n\n要不要我帮你把明天的任务排得轻松一点？该休息的时候就好好休息。',
  },
  {
    re: /焦虑|紧张|慌|担心|害怕|压力|心里没底/,
    reply: () => '别着急，慢慢来。焦虑其实说明你在乎这件事 💛\n\n深呼吸一下，我们把大目标拆成一件件小事，一步一步来，就会踏实很多。',
  },
  {
    re: /难过|伤心|不开心|哭|委屈|低落/,
    reply: () => '我在这里陪着你 🫂 有什么不开心都可以跟我说说。\n\n先照顾好自己，喝点热水，做点喜欢的小事，会慢慢好起来的。',
  },
  {
    re: /烦|崩溃|emo|丧|不想动|躺平|摆烂/,
    reply: () => '偶尔摆烂一下完全没关系，人又不是机器～\n\n要不今天我们就只做一件最小的事？比如出门走两步、喝杯水，就算赢 ✨',
  },
  {
    re: /迷茫|不知道|没方向|不知道怎么办|未来/,
    reply: () => '迷茫的时候，把「想不清楚的大问题」换成「今天能做的小事」会轻松很多。\n\n你可以告诉我一个想达成的目标，我帮你拆成每天能落地的小步骤 🎯',
  },
]
const POS_EMOTIONS: Array<{ re: RegExp; reply: (g: string) => string }> = [
  {
    re: /开心|高兴|太棒|太好了|完成|做到了|搞定|耶/,
    reply: () => '太棒啦！为你开心 🎉 这份成就感值得好好记住。\n\n要不要我帮你把这份好状态延续下去，安排一下接下来要做的事？',
  },
]
const GOAL_PATTERNS = [/目标/, /想考研/, /考公/, /想学/, /减肥/, /健身/, /考证/, /教资/, /四六级/, /保研/, /出国/, /奖学金/, /竞赛/, /找工作/, /论文/, /帮我定/]
const ARRANGE_PATTERNS = [/帮我安排/, /帮我排/, /安排一下/, /排一下/, /排程/, /排个/, /规划/]

// ── Build a schedule summary string for a given date ──
function scheduleSummary(dateStrVal: string): string {
  const db = getDb()
  const sched = db.schedules[dateStrVal]
  if (!sched || !sched.slots.length) return ''
  const lines = sched.slots.slice(0, 6).map((s) => `• ${s.start_time} ${s.label}`)
  if (sched.slots.length > 6) lines.push(`  …还有 ${sched.slots.length - 6} 项`)
  return lines.join('\n')
}

export async function fetchBrief(): Promise<BriefResponse> {
  const db = getDb()
  const today = dateStr(0)
  const sched = db.schedules[today]
  const done = db.tasks.filter((t) => t.status === 'done').length
  const total = db.tasks.length

  const greet = timeGreeting()
  const headline = `${greet}呀，我是小暖 💛`
  const mood = greet

  let body = ''
  const tips: string[] = []

  if (sched && sched.slots.length > 0) {
    body = `今天有 ${sched.slots.length} 件事，我已经帮你排好啦：\n${scheduleSummary(today)}`
    if (sched.tips && sched.tips.length) tips.push(...sched.tips)
  } else if (total > 0) {
    body = `今天还没有排日程，不过你手头有 ${total} 件事在跟进。\n跟我说说今天想做什么，我帮你安排～`
  } else {
    body = '今天还没安排事情，是放松的一天，还是想充实一点？\n告诉我你想做什么，我帮你安排得明明白白～'
  }

  if (done > 0) tips.push(`你已经完成了 ${done} 件事，坚持得很棒 👍`)

  return { headline, body, tips, mood }
}

export async function assistantChat(text: string): Promise<ChatResponse> {
  const t = text.trim()

  // 1. Greeting
  if (GREET_PATTERNS.some((re) => re.test(t))) {
    const g = timeGreeting()
    return {
      reply: `${g}～ 我是小暖，你的日程搭子 💛\n\n今天过得怎么样？想安排事情、定目标，还是随便聊聊，我都在这儿。`,
      tasks: [],
      suggestions: ['今天有什么安排？', '帮我安排明天', '我想定个目标'],
      action: 'greet',
    }
  }

  // 2. Thanks
  if (THANKS_PATTERNS.some((re) => re.test(t))) {
    return {
      reply: '不客气呀，能帮到你就好 🥰 有需要随时喊我～',
      tasks: [],
      suggestions: ['今天有什么安排？', '帮我安排明天'],
      action: 'thanks',
    }
  }

  // 3. Negative emotion
  for (const { re, reply } of NEG_EMOTIONS) {
    if (re.test(t)) {
      return {
        reply: reply(timeGreeting()),
        tasks: [],
        suggestions: ['帮我安排明天轻松一点', '陪我说说话', '我想定个目标'],
        action: 'emotion',
      }
    }
  }

  // 4. Positive emotion
  for (const { re, reply } of POS_EMOTIONS) {
    if (re.test(t)) {
      return {
        reply: reply(timeGreeting()),
        tasks: [],
        suggestions: ['帮我安排明天', '记录今天的收获'],
        action: 'emotion',
      }
    }
  }

  // 5. View schedule
  if (VIEW_PATTERNS.some((re) => re.test(t))) {
    const today = dateStr(0)
    const tomorrow = dateStr(1)
    const todayS = scheduleSummary(today)
    const tomorrowS = scheduleSummary(tomorrow)
    const hasToday = todayS.length > 0
    const hasTomorrow = tomorrowS.length > 0

    if (hasToday) {
      return {
        reply: `今天（${today}）的日程是这样的：\n${todayS}\n\n到点我会提醒你，放心去执行就好～`,
        tasks: [],
        suggestions: ['查看日程', '明天有什么安排？'],
        action: 'view',
      }
    }
    if (hasTomorrow) {
      return {
        reply: `今天还没排，不过明天（${tomorrow}）已经有安排啦：\n${tomorrowS}`,
        tasks: [],
        suggestions: ['查看日程', '帮我安排今天'],
        action: 'view',
      }
    }
    return {
      reply: '今天和明天都还没有排日程呢。\n\n想安排点什么？跟我说就行，比如「上午8点到10点上课，下午去图书馆自习两小时」～',
      tasks: [],
      suggestions: ['帮我安排明天', '我想定个目标'],
      action: 'view',
    }
  }

  // 6. Goal decomposition
  if (GOAL_PATTERNS.some((re) => re.test(t))) {
    const tree = decomposeGoal(t)
    mutateDb((db) => saveGoalTree(db, tree))
    const dailyCount = countDaily(tree)
    return {
      reply: `好的！我帮你把「${tree.title}」拆成了一个完整的目标体系 🌱\n\n🎯 ${tree.title}\n├─ ${tree.children.map((c) => c.title).join('\n├─ ')}\n\n一共拆出 ${dailyCount} 个每天能落地的小任务，已经存到「目标」页啦。\n接下来要不要我挑几个今天的任务，帮你排进日程？`,
      tasks: [],
      suggestions: ['查看目标', '帮我安排今天的任务'],
      action: 'goal',
    }
  }

  // 7. Schedule tasks (parse intent)
  const parsed = parseIntent(t)
  if (parsed.length > 0) {
    const tasks: ChatTask[] = parsed.map((p: ParsedTask) => ({
      title: p.title,
      task_type: p.task_type,
      priority: p.priority,
      estimated_minutes: p.estimated_minutes,
      time_hint: p.time_hint ?? undefined,
    }))
    const fixedCount = tasks.filter((x) => x.task_type === 'fixed').length
    const reply = `收到！我听懂了 ${tasks.length} 件事${fixedCount > 0 ? `，其中 ${fixedCount} 件是有固定时间的` : ''}，已经帮你识别好了 ✅\n\n你看一眼对不对，没问题就点下面「一键生成日程」，我来安排具体时间～`
    return {
      reply,
      tasks,
      suggestions: ['再补充几件事', '帮我安排明天'],
      action: 'schedule',
    }
  }

  // 8. "帮我安排" but nothing concrete → ask for details
  if (ARRANGE_PATTERNS.some((re) => re.test(t))) {
    return {
      reply: '没问题！你只需要告诉我具体要做什么，我来算时间～\n\n比如：「明天8点到10点上课，下午去图书馆自习两小时，晚上跑步半小时」\n\n说得越具体，我排得越贴心 ✨',
      tasks: [],
      suggestions: ['上午8点到10点上课，下午自习两小时', '明天晚上跑步半小时'],
      action: 'fallback',
    }
  }

  // 9. Fallback
  return {
    reply: '我懂你的意思啦～不过我主要擅长帮你安排时间和拆解目标 💛\n\n你可以试试：\n• 「上午8点到10点上课，下午去图书馆」\n• 「帮我安排明天」\n• 「我想考研，帮我定个计划」\n\n或者直接跟我说说你现在的心情，我也很愿意听 🫂',
    tasks: [],
    suggestions: ['帮我安排明天', '我想定个目标', '今天有什么安排？'],
    action: 'fallback',
  }
}

function countDaily(node: { children: any[]; level: string }): number {
  let count = 0
  if (node.level === 'daily') count = 1
  for (const child of node.children) count += countDaily(child)
  return count
}
