# Schedule List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/schedules` placeholder with a responsive, static schedule list matching the approved reference layout.

**Architecture:** Add a focused `SchedulePage` React component containing local display data for active schedules and recommended templates. Register it as an explicit route before the generic placeholder routes, and keep all page-specific presentation in scoped CSS classes.

**Tech Stack:** React 18, TypeScript, React Router, Lucide React, Vitest, Testing Library, CSS

---

### Task 1: Define the Schedule Page Contract

**Files:**
- Modify: `src/App.test.tsx`

- [x] **Step 1: Write the failing route test**

```tsx
it('renders the schedule list sections', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('link', { name: '定时任务' }))

  expect(screen.getByRole('heading', { name: '定时任务' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '进行中' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '为你推荐' })).toBeInTheDocument()
  expect(screen.getByText('每日项目摘要')).toBeInTheDocument()
  expect(screen.getByText('工作周报')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '新建定时任务' })).toBeInTheDocument()
})
```

- [x] **Step 2: Run the test and verify the placeholder page fails**

Run: `npm test -- --reporter=verbose`

Expected: the new test fails because `/schedules` does not render “进行中” and “为你推荐”.

### Task 2: Implement and Route the Schedule Page

**Files:**
- Create: `src/pages/SchedulePage.tsx`
- Modify: `src/App.tsx`

- [x] **Step 1: Create the focused page component**

```tsx
import { Plus } from 'lucide-react'

const activeSchedules = [
  {
    title: '每日项目摘要',
    description: '自动汇总项目进展、待处理事项与风险，形成当天工作摘要。',
    schedule: '每周一至周五 09:00'
  },
  {
    title: '依赖更新检查',
    description: '扫描项目依赖的新版本和兼容风险，输出可执行的升级建议。',
    schedule: '每周一 10:00'
  }
]

const recommendations = [
  ['工作周报', '自动汇总本周工作进展，一键生成周报'],
  ['每日安排简报', '推送今日日程和待办，开启高效一天'],
  ['每日新闻推送', '汇总行业重要动态，按优先级排序推送'],
  ['竞品动态调研', '实时跟进竞品动态，清晰整理变动'],
  ['项目风险巡检', '定期检查项目风险项并生成处理建议'],
  ['每日英语单词', '每日推送实用单词，带例句和记忆技巧'],
  ['商品价格监控', '持续追踪商品到手价，到达目标价格时提醒']
]

export default function SchedulePage(): JSX.Element {
  return (
    <main className="schedule-page">
      <header className="schedule-header">
        <h1>定时任务</h1>
        <button type="button" aria-label="新建定时任务">
          <Plus size={17} />
          <span>新建</span>
        </button>
      </header>
      <div className="schedule-content">
        <section aria-labelledby="active-schedules-title">
          <h2 id="active-schedules-title">进行中</h2>
          <div className="active-schedule-grid">
            {activeSchedules.map((task) => (
              <article className="active-schedule-card" key={task.title}>
                <h3>{task.title}</h3>
                <p>{task.description}</p>
                <footer>{task.schedule}</footer>
              </article>
            ))}
          </div>
        </section>
        <section aria-labelledby="recommended-schedules-title">
          <h2 id="recommended-schedules-title">为你推荐</h2>
          <div className="schedule-recommendation-grid">
            {recommendations.map(([title, description]) => (
              <article className="schedule-recommendation" key={title}>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
                <button type="button" aria-label={`使用推荐任务 ${title}`}>
                  <Plus size={20} />
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
```

The active list uses `<article className="active-schedule-card">`; the recommendation list uses `<article className="schedule-recommendation">`. Each recommendation includes an icon-only plus button with an accessible label containing its template name.

- [x] **Step 2: Register the explicit route**

```tsx
import SchedulePage from './pages/SchedulePage'

<Route path="/chat/new" element={<NewChatPage />} />
<Route path="/schedules" element={<SchedulePage />} />
```

Exclude `/schedules` from the generic `EmptyPage` route generation together with `/chat/new`.

- [x] **Step 3: Run tests**

Run: `npm test`

Expected: all tests pass.

### Task 3: Match the Approved Layout and Verify

**Files:**
- Modify: `src/styles.css`

- [x] **Step 1: Add scoped schedule styles**

```css
.schedule-page {
  min-width: 0;
  height: 100vh;
  overflow-y: auto;
  color: #202124;
  background: #fff;
}

.schedule-content {
  width: min(1180px, calc(100% - 64px));
  margin: 0 auto;
  padding: 38px 0 80px;
}

.active-schedule-grid,
.schedule-recommendation-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.active-schedule-card {
  min-height: 172px;
  padding: 24px;
  border: 1px solid #dedede;
  border-radius: 8px;
}

.active-schedule-card footer {
  margin-top: 20px;
  padding-top: 14px;
  color: #8a8a8a;
  border-top: 1px solid #ececec;
}

.schedule-recommendation {
  display: flex;
  min-height: 104px;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border: 1px dashed #d7d7d7;
  border-radius: 8px;
}

.active-schedule-card:hover,
.schedule-recommendation:hover {
  border-color: #bfc1c4;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.07);
}

@media (max-width: 900px) {
  .active-schedule-grid,
  .schedule-recommendation-grid {
    grid-template-columns: 1fr;
  }
}
```

- [x] **Step 2: Run the complete verification suite**

Run: `npm test && npm run build && git diff --check`

Expected: all tests pass, TypeScript and production builds succeed, and the diff check has no output.

- [x] **Step 3: Verify the desktop viewport**

Open `http://127.0.0.1:5173/#/schedules` at 1280×800 and confirm:

- Both active cards fit in one row.
- Recommendations render as a balanced two-column grid.
- No text overlaps or horizontal scrolling occur.
- The existing resizable and collapsible sidebar remains functional.

No installer package or Git commit is created.
