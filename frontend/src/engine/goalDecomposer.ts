// Goal decomposer — breaks big goals into layered sub-goals with smart templates.
// Ported from backend/engine/goal_decomposer.py (runs fully offline).

export type GoalLevel = 'big' | 'long' | 'mid' | 'daily'

export interface GoalNode {
  title: string
  level: GoalLevel
  children: GoalNode[]
  estimated_days?: number
}

function n(title: string, level: GoalLevel, children: GoalNode[] = [], estimated_days = 0): GoalNode {
  return { title, level, children, estimated_days }
}

// ── Rich template library ──
const TEMPLATES: Record<string, GoalNode> = {
  考研: n('考研上岸', 'big', [
    n('初试准备', 'long', [
      n('基础巩固阶段', 'mid', [
        n('背单词 150 个', 'daily', [], 90),
        n('数学基础教材一章+习题', 'daily', [], 60),
        n('英语长难句精读 5 句', 'daily', [], 30),
      ]),
      n('强化提升阶段', 'mid', [
        n('专业课一章精读+笔记', 'daily', [], 60),
        n('数学真题分类训练', 'daily', [], 45),
        n('英语阅读真题 2 篇', 'daily', [], 45),
      ]),
      n('冲刺模拟阶段', 'mid', [
        n('政治背诵一章', 'daily', [], 30),
        n('全科模拟考试一套', 'daily', [], 21),
        n('错题复习 30 道', 'daily', [], 14),
      ]),
    ]),
    n('复试准备', 'long', [
      n('专业面试准备', 'mid', [
        n('专业课核心概念复习', 'daily'),
        n('英语口语练习 15 分钟', 'daily'),
      ]),
    ]),
  ]),
  考公: n('考上公务员', 'big', [
    n('笔试阶段', 'long', [
      n('行测专项突破', 'mid', [
        n('言语理解 40 题', 'daily'),
        n('数量关系 20 题', 'daily'),
        n('判断推理 30 题', 'daily'),
        n('资料分析 20 题', 'daily'),
      ]),
      n('申论提升', 'mid', [
        n('申论范文精读 1 篇', 'daily'),
        n('申论小题练习 2 道', 'daily'),
        n('大作文写作 1 篇', 'daily'),
      ]),
      n('考前冲刺', 'mid', [
        n('行测模考一套', 'daily'),
        n('时事政治背诵', 'daily'),
      ]),
    ]),
  ]),
  论文: n('完成毕业论文', 'big', [
    n('选题开题', 'long', [
      n('文献调研与综述', 'mid', [
        n('精读文献 2 篇+笔记', 'daily'),
        n('研究方向梳理', 'daily'),
      ]),
      n('开题报告撰写', 'mid', [
        n('开题报告一章节', 'daily'),
      ]),
    ]),
    n('正文写作', 'long', [
      n('实验/调研阶段', 'mid', [
        n('实验数据采集', 'daily'),
        n('数据分析整理', 'daily'),
      ]),
      n('论文撰写阶段', 'mid', [
        n('论文写作 1000 字', 'daily'),
        n('图表制作与优化', 'daily'),
      ]),
    ]),
    n('修改答辩', 'long', [
      n('论文修改完善', 'mid', [
        n('论文修改一章节', 'daily'),
        n('格式调整检查', 'daily'),
      ]),
      n('答辩准备', 'mid', [
        n('PPT 制作 5 页', 'daily'),
        n('答辩演练 1 次', 'daily'),
      ]),
    ]),
  ]),
  考证: n('通过证书考试', 'big', [
    n('教材学习', 'long', [
      n('教材一轮通读', 'mid', [
        n('教材一章+课后题', 'daily'),
      ]),
    ]),
    n('刷题强化', 'long', [
      n('分章节刷题', 'mid', [
        n('章节练习题 50 道', 'daily'),
      ]),
      n('真题模拟', 'mid', [
        n('真题一套+纠错', 'daily'),
        n('错题本复习 30 道', 'daily'),
      ]),
    ]),
  ]),
  奖学金: n('拿到奖学金', 'big', [
    n('学业成绩提升', 'long', [
      n('每门课 90+', 'mid', [
        n('课后复习笔记整理', 'daily'),
        n('本周课程预习', 'daily'),
      ]),
    ]),
    n('综测加分', 'long', [
      n('学科竞赛', 'mid', [
        n('竞赛知识学习 1 小时', 'daily'),
      ]),
      n('社工志愿', 'mid', [
        n('参与志愿活动策划', 'daily'),
      ]),
    ]),
  ]),
  教资: n('通过教师资格证', 'big', [
    n('笔试准备', 'long', [
      n('综合素质', 'mid', [
        n('综合素质教材一章', 'daily'),
      ]),
      n('教育知识与能力', 'mid', [
        n('教育心理学一章', 'daily'),
        n('教育法规整理', 'daily'),
      ]),
      n('学科知识', 'mid', [
        n('学科专业知识复习', 'daily'),
      ]),
    ]),
    n('面试准备', 'long', [
      n('试讲练习', 'mid', [
        n('试讲演练 1 次 10 分钟', 'daily'),
        n('结构化面试题 5 道', 'daily'),
      ]),
    ]),
  ]),
  四六级: n('通过四六级考试', 'big', [
    n('词汇积累', 'long', [
      n('核心词汇', 'mid', [
        n('背单词 80 个', 'daily'),
        n('词汇复习 200 个', 'daily'),
      ]),
    ]),
    n('题型训练', 'long', [
      n('听力阅读', 'mid', [
        n('听力真题 1 套', 'daily'),
        n('阅读真题 2 篇', 'daily'),
      ]),
      n('写作翻译', 'mid', [
        n('翻译练习 1 篇', 'daily'),
        n('作文模板背诵', 'daily'),
      ]),
    ]),
  ]),
  减肥: n('健康减肥，体型管理', 'big', [
    n('饮食管理', 'long', [
      n('饮食计划执行', 'mid', [
        n('记录饮食日记', 'daily'),
        n('控制碳水摄入', 'daily'),
      ]),
    ]),
    n('运动计划', 'long', [
      n('有氧运动', 'mid', [
        n('跑步/跳绳 30 分钟', 'daily'),
      ]),
      n('力量训练', 'mid', [
        n('核心力量训练 20 分钟', 'daily'),
      ]),
    ]),
  ]),
  健身: n('健身增肌塑形', 'big', [
    n('训练计划', 'long', [
      n('力量训练', 'mid', [
        n('上肢训练日', 'daily'),
        n('下肢训练日', 'daily'),
        n('核心训练日', 'daily'),
      ]),
    ]),
    n('营养补充', 'long', [
      n('饮食管理', 'mid', [
        n('高蛋白餐准备', 'daily'),
        n('营养补充记录', 'daily'),
      ]),
    ]),
  ]),
  编程: n('系统学习编程', 'big', [
    n('基础入门', 'long', [
      n('语言基础', 'mid', [
        n('编程基础教程 1 章', 'daily'),
        n('课后练习 5 题', 'daily'),
      ]),
    ]),
    n('项目实战', 'long', [
      n('个人项目', 'mid', [
        n('项目编码 1 小时', 'daily'),
        n('GitHub 提交代码', 'daily'),
      ]),
      n('算法练习', 'mid', [
        n('LeetCode 2 题', 'daily'),
      ]),
    ]),
  ]),
  找工作: n('拿下心仪offer', 'big', [
    n('简历与投递', 'long', [
      n('简历打磨', 'mid', [
        n('简历修改一版', 'daily'),
      ]),
      n('信息搜集', 'mid', [
        n('浏览招聘信息 30 分钟', 'daily'),
        n('投递简历 3 份', 'daily'),
      ]),
    ]),
    n('面试准备', 'long', [
      n('技术面试', 'mid', [
        n('刷面试题 10 道', 'daily'),
        n('系统设计学习', 'daily'),
      ]),
      n('行为面试', 'mid', [
        n('自我介绍演练', 'daily'),
        n('STAR 故事准备', 'daily'),
      ]),
    ]),
  ]),
  竞赛: n('斩获竞赛奖项', 'big', [
    n('竞赛知识储备', 'long', [
      n('理论知识学习', 'mid', [
        n('竞赛专题学习 1 章', 'daily'),
      ]),
    ]),
    n('实战训练', 'long', [
      n('刷题训练', 'mid', [
        n('竞赛真题 1 套', 'daily'),
        n('错题复盘分析', 'daily'),
      ]),
    ]),
    n('团队协作', 'long', [
      n('团队项目', 'mid', [
        n('项目进度推进', 'daily'),
      ]),
    ]),
  ]),
  保研: n('成功保研', 'big', [
    n('学业成绩', 'long', [
      n('保持高绩点', 'mid', [
        n('课后及时复习', 'daily'),
        n('提前预习新课', 'daily'),
      ]),
    ]),
    n('科研经历', 'long', [
      n('科研项目', 'mid', [
        n('读论文 1 篇', 'daily'),
        n('科研实验/分析', 'daily'),
      ]),
    ]),
    n('材料准备', 'long', [
      n('申请材料', 'mid', [
        n('个人陈述修改', 'daily'),
        n('推荐信联系跟进', 'daily'),
      ]),
    ]),
  ]),
  出国: n('留学申请成功', 'big', [
    n('语言考试', 'long', [
      n('托福/雅思备考', 'mid', [
        n('单词背诵 100 个', 'daily'),
        n('听力+阅读各一套', 'daily'),
        n('口语练习 20 分钟', 'daily'),
      ]),
    ]),
    n('背景提升', 'long', [
      n('科研实习', 'mid', [
        n('科研任务推进', 'daily'),
      ]),
    ]),
    n('申请文书', 'long', [
      n('文书写作', 'mid', [
        n('PS/SoP 修改', 'daily'),
        n('选校调研', 'daily'),
      ]),
    ]),
  ]),
}

export function decomposeGoal(goalTitle: string): GoalNode {
  // Template matching — fuzzy match by keyword
  for (const keyword of Object.keys(TEMPLATES)) {
    if (goalTitle.includes(keyword)) return TEMPLATES[keyword]
  }

  // ── Smart generic fallback ──
  if (['学', '习', '课', '题', '书', '读', '背', '记', '考'].some((w) => goalTitle.includes(w))) {
    return n(goalTitle, 'big', [
      n(`${goalTitle} - 学习规划`, 'long', [
        n('知识学习阶段', 'mid', [
          n(`${goalTitle} 相关内容学习 1 小时`, 'daily'),
          n('学习笔记整理', 'daily'),
        ]),
        n('巩固练习阶段', 'mid', [
          n('相关练习/题目', 'daily'),
          n('复习回顾当天内容', 'daily'),
        ]),
      ]),
    ])
  }

  if (['项', '工', '做', '写', '码', '开', '设计'].some((w) => goalTitle.includes(w))) {
    return n(goalTitle, 'big', [
      n(`${goalTitle} - 执行计划`, 'long', [
        n('准备阶段', 'mid', [
          n('需求分析/资料整理', 'daily'),
          n('制定今日执行清单', 'daily'),
        ]),
        n('执行阶段', 'mid', [
          n('核心任务推进 1 小时', 'daily'),
          n('进度回顾与调整', 'daily'),
        ]),
      ]),
    ])
  }

  if (['练', '训练', '运动', '健身', '跑', '球'].some((w) => goalTitle.includes(w))) {
    return n(goalTitle, 'big', [
      n(`${goalTitle} - 训练计划`, 'long', [
        n('基础训练阶段', 'mid', [
          n('每日训练 30 分钟', 'daily'),
          n('训练记录与复盘', 'daily'),
        ]),
      ]),
    ])
  }

  return n(goalTitle, 'big', [
    n(`${goalTitle} - 准备与规划`, 'long', [
      n('信息收集阶段', 'mid', [
        n(`了解${goalTitle}相关信息 30 分钟`, 'daily'),
        n('制定个人计划', 'daily'),
      ]),
    ]),
    n(`${goalTitle} - 行动执行`, 'long', [
      n('每日推进阶段', 'mid', [
        n(`${goalTitle} 核心任务推进`, 'daily'),
        n('每日小结与调整', 'daily'),
      ]),
    ]),
  ])
}

export function getDailyTasks(node: GoalNode): string[] {
  const tasks: string[] = []
  if (node.level === 'daily') tasks.push(node.title)
  for (const child of node.children) tasks.push(...getDailyTasks(child))
  return tasks
}
