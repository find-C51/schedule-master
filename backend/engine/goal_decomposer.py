"""Goal decomposer — breaks big goals into layered sub-goals with smart templates."""

from typing import List, Optional
from dataclasses import dataclass, field


@dataclass
class GoalNode:
    title: str
    level: str  # big | long | mid | daily
    children: List["GoalNode"] = field(default_factory=list)
    estimated_days: int = 0


# ── Rich template library ──
TEMPLATES = {
    "考研": GoalNode("考研上岸", "big", children=[
        GoalNode("初试准备", "long", children=[
            GoalNode("基础巩固阶段", "mid", children=[
                GoalNode("背单词 150 个", "daily", estimated_days=90),
                GoalNode("数学基础教材一章+习题", "daily", estimated_days=60),
                GoalNode("英语长难句精读 5 句", "daily", estimated_days=30),
            ]),
            GoalNode("强化提升阶段", "mid", children=[
                GoalNode("专业课一章精读+笔记", "daily", estimated_days=60),
                GoalNode("数学真题分类训练", "daily", estimated_days=45),
                GoalNode("英语阅读真题 2 篇", "daily", estimated_days=45),
            ]),
            GoalNode("冲刺模拟阶段", "mid", children=[
                GoalNode("政治背诵一章", "daily", estimated_days=30),
                GoalNode("全科模拟考试一套", "daily", estimated_days=21),
                GoalNode("错题复习 30 道", "daily", estimated_days=14),
            ]),
        ]),
        GoalNode("复试准备", "long", children=[
            GoalNode("专业面试准备", "mid", children=[
                GoalNode("专业课核心概念复习", "daily"),
                GoalNode("英语口语练习 15 分钟", "daily"),
            ]),
        ]),
    ]),
    "考公": GoalNode("考上公务员", "big", children=[
        GoalNode("笔试阶段", "long", children=[
            GoalNode("行测专项突破", "mid", children=[
                GoalNode("言语理解 40 题", "daily"),
                GoalNode("数量关系 20 题", "daily"),
                GoalNode("判断推理 30 题", "daily"),
                GoalNode("资料分析 20 题", "daily"),
            ]),
            GoalNode("申论提升", "mid", children=[
                GoalNode("申论范文精读 1 篇", "daily"),
                GoalNode("申论小题练习 2 道", "daily"),
                GoalNode("大作文写作 1 篇", "daily"),
            ]),
            GoalNode("考前冲刺", "mid", children=[
                GoalNode("行测模考一套", "daily"),
                GoalNode("时事政治背诵", "daily"),
            ]),
        ]),
    ]),
    "论文": GoalNode("完成毕业论文", "big", children=[
        GoalNode("选题开题", "long", children=[
            GoalNode("文献调研与综述", "mid", children=[
                GoalNode("精读文献 2 篇+笔记", "daily"),
                GoalNode("研究方向梳理", "daily"),
            ]),
            GoalNode("开题报告撰写", "mid", children=[
                GoalNode("开题报告一章节", "daily"),
            ]),
        ]),
        GoalNode("正文写作", "long", children=[
            GoalNode("实验/调研阶段", "mid", children=[
                GoalNode("实验数据采集", "daily"),
                GoalNode("数据分析整理", "daily"),
            ]),
            GoalNode("论文撰写阶段", "mid", children=[
                GoalNode("论文写作 1000 字", "daily"),
                GoalNode("图表制作与优化", "daily"),
            ]),
        ]),
        GoalNode("修改答辩", "long", children=[
            GoalNode("论文修改完善", "mid", children=[
                GoalNode("论文修改一章节", "daily"),
                GoalNode("格式调整检查", "daily"),
            ]),
            GoalNode("答辩准备", "mid", children=[
                GoalNode("PPT 制作 5 页", "daily"),
                GoalNode("答辩演练 1 次", "daily"),
            ]),
        ]),
    ]),
    "考证": GoalNode("通过证书考试", "big", children=[
        GoalNode("教材学习", "long", children=[
            GoalNode("教材一轮通读", "mid", children=[
                GoalNode("教材一章+课后题", "daily"),
            ]),
        ]),
        GoalNode("刷题强化", "long", children=[
            GoalNode("分章节刷题", "mid", children=[
                GoalNode("章节练习题 50 道", "daily"),
            ]),
            GoalNode("真题模拟", "mid", children=[
                GoalNode("真题一套+纠错", "daily"),
                GoalNode("错题本复习 30 道", "daily"),
            ]),
        ]),
    ]),
    "奖学金": GoalNode("拿到奖学金", "big", children=[
        GoalNode("学业成绩提升", "long", children=[
            GoalNode("每门课 90+", "mid", children=[
                GoalNode("课后复习笔记整理", "daily"),
                GoalNode("本周课程预习", "daily"),
            ]),
        ]),
        GoalNode("综测加分", "long", children=[
            GoalNode("学科竞赛", "mid", children=[
                GoalNode("竞赛知识学习 1 小时", "daily"),
            ]),
            GoalNode("社工志愿", "mid", children=[
                GoalNode("参与志愿活动策划", "daily"),
            ]),
        ]),
    ]),
    "教资": GoalNode("通过教师资格证", "big", children=[
        GoalNode("笔试准备", "long", children=[
            GoalNode("综合素质", "mid", children=[
                GoalNode("综合素质教材一章", "daily"),
            ]),
            GoalNode("教育知识与能力", "mid", children=[
                GoalNode("教育心理学一章", "daily"),
                GoalNode("教育法规整理", "daily"),
            ]),
            GoalNode("学科知识", "mid", children=[
                GoalNode("学科专业知识复习", "daily"),
            ]),
        ]),
        GoalNode("面试准备", "long", children=[
            GoalNode("试讲练习", "mid", children=[
                GoalNode("试讲演练 1 次 10 分钟", "daily"),
                GoalNode("结构化面试题 5 道", "daily"),
            ]),
        ]),
    ]),
    "四六级": GoalNode("通过四六级考试", "big", children=[
        GoalNode("词汇积累", "long", children=[
            GoalNode("核心词汇", "mid", children=[
                GoalNode("背单词 80 个", "daily"),
                GoalNode("词汇复习 200 个", "daily"),
            ]),
        ]),
        GoalNode("题型训练", "long", children=[
            GoalNode("听力阅读", "mid", children=[
                GoalNode("听力真题 1 套", "daily"),
                GoalNode("阅读真题 2 篇", "daily"),
            ]),
            GoalNode("写作翻译", "mid", children=[
                GoalNode("翻译练习 1 篇", "daily"),
                GoalNode("作文模板背诵", "daily"),
            ]),
        ]),
    ]),
    "减肥": GoalNode("健康减肥，体型管理", "big", children=[
        GoalNode("饮食管理", "long", children=[
            GoalNode("饮食计划执行", "mid", children=[
                GoalNode("记录饮食日记", "daily"),
                GoalNode("控制碳水摄入", "daily"),
            ]),
        ]),
        GoalNode("运动计划", "long", children=[
            GoalNode("有氧运动", "mid", children=[
                GoalNode("跑步/跳绳 30 分钟", "daily"),
            ]),
            GoalNode("力量训练", "mid", children=[
                GoalNode("核心力量训练 20 分钟", "daily"),
            ]),
        ]),
    ]),
    "健身": GoalNode("健身增肌塑形", "big", children=[
        GoalNode("训练计划", "long", children=[
            GoalNode("力量训练", "mid", children=[
                GoalNode("上肢训练日", "daily"),
                GoalNode("下肢训练日", "daily"),
                GoalNode("核心训练日", "daily"),
            ]),
        ]),
        GoalNode("营养补充", "long", children=[
            GoalNode("饮食管理", "mid", children=[
                GoalNode("高蛋白餐准备", "daily"),
                GoalNode("营养补充记录", "daily"),
            ]),
        ]),
    ]),
    "编程": GoalNode("系统学习编程", "big", children=[
        GoalNode("基础入门", "long", children=[
            GoalNode("语言基础", "mid", children=[
                GoalNode("编程基础教程 1 章", "daily"),
                GoalNode("课后练习 5 题", "daily"),
            ]),
        ]),
        GoalNode("项目实战", "long", children=[
            GoalNode("个人项目", "mid", children=[
                GoalNode("项目编码 1 小时", "daily"),
                GoalNode("GitHub 提交代码", "daily"),
            ]),
            GoalNode("算法练习", "mid", children=[
                GoalNode("LeetCode 2 题", "daily"),
            ]),
        ]),
    ]),
    "找工作": GoalNode("拿下心仪offer", "big", children=[
        GoalNode("简历与投递", "long", children=[
            GoalNode("简历打磨", "mid", children=[
                GoalNode("简历修改一版", "daily"),
            ]),
            GoalNode("信息搜集", "mid", children=[
                GoalNode("浏览招聘信息 30 分钟", "daily"),
                GoalNode("投递简历 3 份", "daily"),
            ]),
        ]),
        GoalNode("面试准备", "long", children=[
            GoalNode("技术面试", "mid", children=[
                GoalNode("刷面试题 10 道", "daily"),
                GoalNode("系统设计学习", "daily"),
            ]),
            GoalNode("行为面试", "mid", children=[
                GoalNode("自我介绍演练", "daily"),
                GoalNode("STAR 故事准备", "daily"),
            ]),
        ]),
    ]),
    "竞赛": GoalNode("斩获竞赛奖项", "big", children=[
        GoalNode("竞赛知识储备", "long", children=[
            GoalNode("理论知识学习", "mid", children=[
                GoalNode("竞赛专题学习 1 章", "daily"),
            ]),
        ]),
        GoalNode("实战训练", "long", children=[
            GoalNode("刷题训练", "mid", children=[
                GoalNode("竞赛真题 1 套", "daily"),
                GoalNode("错题复盘分析", "daily"),
            ]),
        ]),
        GoalNode("团队协作", "long", children=[
            GoalNode("团队项目", "mid", children=[
                GoalNode("项目进度推进", "daily"),
            ]),
        ]),
    ]),
    "保研": GoalNode("成功保研", "big", children=[
        GoalNode("学业成绩", "long", children=[
            GoalNode("保持高绩点", "mid", children=[
                GoalNode("课后及时复习", "daily"),
                GoalNode("提前预习新课", "daily"),
            ]),
        ]),
        GoalNode("科研经历", "long", children=[
            GoalNode("科研项目", "mid", children=[
                GoalNode("读论文 1 篇", "daily"),
                GoalNode("科研实验/分析", "daily"),
            ]),
        ]),
        GoalNode("材料准备", "long", children=[
            GoalNode("申请材料", "mid", children=[
                GoalNode("个人陈述修改", "daily"),
                GoalNode("推荐信联系跟进", "daily"),
            ]),
        ]),
    ]),
    "出国": GoalNode("留学申请成功", "big", children=[
        GoalNode("语言考试", "long", children=[
            GoalNode("托福/雅思备考", "mid", children=[
                GoalNode("单词背诵 100 个", "daily"),
                GoalNode("听力+阅读各一套", "daily"),
                GoalNode("口语练习 20 分钟", "daily"),
            ]),
        ]),
        GoalNode("背景提升", "long", children=[
            GoalNode("科研实习", "mid", children=[
                GoalNode("科研任务推进", "daily"),
            ]),
        ]),
        GoalNode("申请文书", "long", children=[
            GoalNode("文书写作", "mid", children=[
                GoalNode("PS/SoP 修改", "daily"),
                GoalNode("选校调研", "daily"),
            ]),
        ]),
    ]),
}


def decompose_goal(goal_title: str, llm_provider=None) -> Optional[GoalNode]:
    """Decompose a big goal into a four-level goal tree."""
    # Try LLM first for richer decomposition
    if llm_provider:
        try:
            result = llm_provider.decompose_goal(goal_title)
            if result:
                return result
        except Exception:
            pass

    # Template matching — fuzzy match by keyword
    for keyword, template in TEMPLATES.items():
        if keyword in goal_title:
            return template

    # ── Smart generic fallback ──
    # Try to guess the category from the title and suggest a reasonable structure
    if any(w in goal_title for w in ["学", "习", "课", "题", "书", "读", "背", "记", "考"]):
        return GoalNode(goal_title, "big", children=[
            GoalNode(f"{goal_title} - 学习规划", "long", children=[
                GoalNode("知识学习阶段", "mid", children=[
                    GoalNode(f"{goal_title} 相关内容学习 1 小时", "daily"),
                    GoalNode("学习笔记整理", "daily"),
                ]),
                GoalNode("巩固练习阶段", "mid", children=[
                    GoalNode("相关练习/题目", "daily"),
                    GoalNode("复习回顾当天内容", "daily"),
                ]),
            ]),
        ])

    if any(w in goal_title for w in ["项", "工", "做", "写", "码", "开", "设计"]):
        return GoalNode(goal_title, "big", children=[
            GoalNode(f"{goal_title} - 执行计划", "long", children=[
                GoalNode("准备阶段", "mid", children=[
                    GoalNode("需求分析/资料整理", "daily"),
                    GoalNode("制定今日执行清单", "daily"),
                ]),
                GoalNode("执行阶段", "mid", children=[
                    GoalNode("核心任务推进 1 小时", "daily"),
                    GoalNode("进度回顾与调整", "daily"),
                ]),
            ]),
        ])

    if any(w in goal_title for w in ["练", "训练", "运动", "健身", "跑", "球"]):
        return GoalNode(goal_title, "big", children=[
            GoalNode(f"{goal_title} - 训练计划", "long", children=[
                GoalNode("基础训练阶段", "mid", children=[
                    GoalNode("每日训练 30 分钟", "daily"),
                    GoalNode("训练记录与复盘", "daily"),
                ]),
            ]),
        ])

    # Truly unknown — still give a structured plan
    return GoalNode(goal_title, "big", children=[
        GoalNode(f"{goal_title} - 准备与规划", "long", children=[
            GoalNode("信息收集阶段", "mid", children=[
                GoalNode(f"了解{goal_title}相关信息 30 分钟", "daily"),
                GoalNode("制定个人计划", "daily"),
            ]),
        ]),
        GoalNode(f"{goal_title} - 行动执行", "long", children=[
            GoalNode("每日推进阶段", "mid", children=[
                GoalNode(f"{goal_title} 核心任务推进", "daily"),
                GoalNode("每日小结与调整", "daily"),
            ]),
        ]),
    ])


def get_daily_tasks(node: GoalNode) -> list[str]:
    """Extract all daily-level task titles from a goal tree."""
    tasks = []
    if node.level == "daily":
        tasks.append(node.title)
    for child in node.children:
        tasks.extend(get_daily_tasks(child))
    return tasks
