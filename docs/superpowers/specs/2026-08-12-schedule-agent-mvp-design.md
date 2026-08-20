# 日程智排 — MVP 产品设计规格

> 日期：2026-08-12 | 版本：v1.0
> 基于《日程智排-产品设计框架.docx》

## 一、产品定位

把大目标拆成每天小任务，自动排进课表里。**前晚花 1 分钟，第二天不慌乱。**

目标用户：全国在校大学生及延伸用户群（考研/考公/考证人群、研究生）。

## 二、技术栈

| 层 | 选型 | 说明 |
|----|------|------|
| 前端 | React 18 + TypeScript + Vite | PWA 可安装到手机 |
| 样式 | Tailwind CSS | 五种交互模式统一主题 |
| 语音 | 浏览器 Web Speech API | 语音转文字，无需后端 |
| 后端 | Python FastAPI | REST API + SSE 流式推送 |
| 数据库 | SQLite（MVP） | 单文件零配置，后续换 PostgreSQL |
| LLM | 可插拔 Provider | 规则引擎兜底 + Claude/OpenAI 增强 |
| 离线 | Service Worker | PWA 离线缓存 + 推送通知 |

## 三、MVP 功能范围

### 3.1 第一层：目标拆解引擎

- 大目标 → 长期目标 → 中期目标 → 每日小目标的四级链
- 手动创建 + LLM 辅助拆解（有 Key 时可用）
- 进度追踪：每完成一个每日任务 → 向上层累计进度百分比

### 3.2 第二层：语音输入 + 智能排程

- 浏览器麦克风 → Web Speech API 转文字
- 后端 NLU 解析：识别 🔒固定事项 / 📝灵活任务 / 紧急度
- 排程引擎：锁定固定时间 → 保护规则检查 → 优先级排序 → 填入空档

### 3.3 第三层：突发情况实时调整

- 三种模式：自动重排 / 给出选项让用户选 / 手动拖拽调整
- 溢出任务自动顺延到次日

### 3.4 四种交互模式（MVP 先做四种）

- **表格模式**：经典时间轴日程表，MVP 默认
- **效率模式**：简洁文本对话式
- **暖心模式**："小暖学姐"人格化陪伴
- **趣味模式**：游戏化闯关视图

极简模式暂缓（依赖系统级通知深度集成）。

### 3.5 用户自定义配置

- 🛡 保护规则：三餐/午休/睡眠的时段设置
- 排程优先级策略：硬时间优先 / DDL 优先 / 效率优先
- 交互模式切换

## 四、架构设计

```
React PWA 前端
    │ HTTP + SSE
FastAPI 后端
    ├── /voice       语音解析路由
    ├── /schedule    排程引擎路由
    ├── /goals       目标体系路由
    └── /settings    用户配置路由
    ├── engine/      核心引擎（纯 Python，不依赖 LLM）
    ├── llm/         可插拔 LLM Provider
    ├── models/      SQLAlchemy ORM
    └── services/    业务服务层
SQLite (data/schedule.db)
```

## 五、数据模型

### Goal（目标）
- id, user_id, title, level (big/long/mid/daily)
- parent_id → 自引用，形成四级树
- progress: 0-100，由子目标/子任务完成率自动计算
- deadline, status (active/completed/archived), created_at

### Task（任务）
- id, goal_id (可选，关联每日目标), title, description
- type: fixed（固定课程）| flexible（灵活待排）| protected（保护时间）| emergent（突发）
- priority: urgent（紧急）| normal（一般）| low（低）
- estimated_minutes, deadline, status (pending/in_progress/done/deferred)

### TimeSlot（时间槽，排程输出）
- id, schedule_date, task_id, start_time, end_time
- label, color, is_locked

### UserConfig（用户配置）
- user_id, protection_rules (JSON: 三餐/午休/睡眠时段)
- schedule_policy: hard_time_first | deadline_first | efficiency_first
- interaction_mode: table | swift | warm | game

## 六、核心引擎设计

### 排程算法 (engine/scheduler.py)

```
输入：日期 + 固定任务列表 + 灵活任务列表 + 保护规则
输出：TimeSlot[] 完整时间表

步骤：
1. 加载固定任务 → 锁定时间槽
2. 加载保护规则 → 标记不可用区间
3. 计算剩余空档（可用时间段列表）
4. 灵活任务按优先级排序
5. 贪心装箱：每个任务放入最合适的空档
6. 溢出任务标记为 deferred → 建议顺延次日
7. 返回完整时间表
```

### 目标拆解器 (engine/goal_decomposer.py)

```
输入：大目标描述 + (可选) LLM provider
输出：四级目标树

步骤：
1. 如果 LLM 可用 → 调用 LLM 生成拆解方案
2. 如果 LLM 不可用 → 使用模板匹配
   - 考研模板：基础期/强化期/冲刺期
   - 考公模板：行测期/申论期/面试期
   - 论文模板：选题/开题/写作/答辩
3. 用户确认/调整后保存
```

### 意图解析器 (engine/intent_parser.py)

```
输入：自然语言文本
输出：[{title, type, priority, estimated_minutes, time_hint}]

步骤：
1. 正则规则提取时间关键词（"下午三点"→15:00）
2. 关键词分类：上课/开会 → fixed，吃饭/睡觉 → protected
3. 紧急度判断：今天截止/明天截止 → urgent
4. LLM 增强（可选）：复杂句 → 结构化
```

### 冲突解决器 (engine/conflict_resolver.py)

```
输入：原时间表 + 突发任务
输出：调整后的时间表 + 调整说明

三种策略：
- auto：自动判断优先级，重排
- suggest：生成2个方案，返回给用户选择
- manual：用户指定调整方式，验证可行性
```

## 七、LLM 可插拔接口

```python
class LLMProvider(ABC):
    def decompose_goal(goal: str) -> list[GoalNode]
    def parse_intent(text: str) -> list[TaskIntent]
    def suggest_adjustment(schedule, emergent) -> list[ScheduleOption]
    def chat(messages: list, mode: str) -> str  # 五种模式对话
```

- `RuleBasedProvider`：纯规则实现，所有方法离线可用
- `ClaudeProvider`：调用 Anthropic API
- `OpenAIProvider`：预留

配置优先级：环境变量 `SCHEDULE_LLM=claude|openai|none`

## 八、PWA 能力

- manifest.json：图标、全屏、横竖屏
- Service Worker：离线缓存静态资源 + API 响应
- 推送通知：定时任务提醒（需 HTTPS，本地开发用 localhost 豁免）

## 九、不在一期的内容

- GitHub 开源共创（模板库同步）
- 多人协作/班级日程共享
- 教务系统课表对接
- 社交激励/好友排行榜
- 极简模式
- 移动运营商渠道集成
