import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Composer } from '../components/Composer'

const initialSchedules = [
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

const recommendedSchedules = [
  {
    title: '工作周报',
    description: '自动汇总本周工作进展，一键生成周报'
  },
  {
    title: '每日安排简报',
    description: '推送今日日程和待办，开启高效一天'
  },
  {
    title: '每日新闻推送',
    description: '汇总行业重要动态，按优先级排序推送'
  },
  {
    title: '竞品动态调研',
    description: '实时跟进竞品动态，清晰整理变动'
  },
  {
    title: '项目风险巡检',
    description: '定期检查项目风险项并生成处理建议'
  },
  {
    title: '每日英语单词',
    description: '每日推送实用单词，带例句和记忆技巧'
  },
  {
    title: '商品价格监控',
    description: '持续追踪商品到手价，到达目标价格时提醒'
  }
]

export default function SchedulePage(): JSX.Element {
  const [activeSchedules, setActiveSchedules] = useState(initialSchedules)
  const [prompt, setPrompt] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setCreateDialogOpen(false)
        setPrompt('')
      }
    }

    if (!createDialogOpen) return

    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [createDialogOpen])

  const closeCreateDialog = (): void => {
    setCreateDialogOpen(false)
    setPrompt('')
  }

  const createSchedule = (): void => {
    const description = prompt.trim()
    if (!description) return
    const title = description.length > 20 ? `${description.slice(0, 20)}…` : description
    setActiveSchedules((current) => [
      {
        title,
        description,
        schedule: '等待确认执行计划'
      },
      ...current
    ])
    closeCreateDialog()
  }

  return (
    <main className="schedule-page">
      <div className="schedule-content">
        <section className="schedule-section" aria-labelledby="active-schedules-title">
          <h2 id="active-schedules-title">进行中</h2>
          <div className="active-schedule-grid">
            {activeSchedules.map((task) => (
              <article className="active-schedule-card" key={task.title}>
                <div>
                  <h3>{task.title}</h3>
                  <p>{task.description}</p>
                </div>
                <footer>{task.schedule}</footer>
              </article>
            ))}
          </div>
        </section>

        <section
          className="schedule-section recommended-schedules"
          aria-labelledby="recommended-schedules-title"
        >
          <h2 id="recommended-schedules-title">为你推荐</h2>
          <div className="schedule-recommendation-grid">
            {recommendedSchedules.map((task) => (
              <article className="schedule-recommendation" key={task.title}>
                <div>
                  <h3>{task.title}</h3>
                  <p>{task.description}</p>
                </div>
                <button
                  type="button"
                  aria-label={`使用推荐任务 ${task.title}`}
                  title={`使用${task.title}`}
                >
                  <Plus size={21} strokeWidth={1.7} />
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>

      <button
        className="schedule-create-fab"
        type="button"
        aria-label="新建定时任务"
        title="新建定时任务"
        onClick={() => setCreateDialogOpen(true)}
      >
        <Plus size={23} strokeWidth={1.9} />
      </button>

      {createDialogOpen && (
        <div
          className="schedule-dialog-backdrop"
          data-testid="schedule-dialog-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeCreateDialog()
          }}
        >
          <section
            className="schedule-create-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-create-title"
          >
            <header>
              <h2 id="schedule-create-title">新建定时任务</h2>
              <button
                type="button"
                aria-label="关闭新建定时任务"
                title="关闭"
                onClick={closeCreateDialog}
              >
                <X size={20} />
              </button>
            </header>
            <Composer
              value={prompt}
              placeholder="描述你希望 RealmFlow 定时完成的任务"
              labels={{
                textarea: '定时任务描述',
                model: '任务模型',
                workspace: '任务工作空间',
                permission: '任务权限模式',
                submit: '创建定时任务',
                menu: '添加任务内容',
                openMenu: '打开任务添加菜单',
                closeMenu: '关闭任务添加菜单'
              }}
              insertions={{
                mode: '按以下执行模式创建定时任务：',
                skill: '调用以下技能创建定时任务：',
                connector: '使用以下连接器创建定时任务：'
              }}
              fileInputId="schedule-attachment"
              autoFocus
              onChange={setPrompt}
              onSubmit={createSchedule}
            />
          </section>
        </div>
      )}
    </main>
  )
}
