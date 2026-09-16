import {
  Braces,
  ChevronRight,
  ClipboardCheck,
  FileSearch,
  FlaskConical,
  RefreshCw,
  Rocket
} from 'lucide-react'
import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import type { RequirementStageId } from '../../shared/workspace'
import { useWorkbench } from '../features/workbench/WorkbenchProvider'

export type WorkspaceSpace = {
  path: string
  label: string
  description: string
}

export type WorkspaceRequirement = {
  id: string
  title: string
  stage?: RequirementStageId
  status?: 'pending' | 'active' | 'completed'
  updatedAt?: number
}

type RequirementDetailPageProps = {
  spaces: WorkspaceSpace[]
  requirementsBySpace: Record<string, WorkspaceRequirement[]>
}

const lifecycleStages = [
  { id: 'analysis', label: '需求分析', status: '当前阶段', icon: FileSearch },
  { id: 'design', label: '技术方案', status: '待开始', icon: ClipboardCheck },
  { id: 'implementation', label: '开发实现', status: '待开始', icon: Braces },
  { id: 'testing', label: '测试验证', status: '待开始', icon: FlaskConical },
  { id: 'release', label: '发布上线', status: '待开始', icon: Rocket },
  {
    id: 'retrospective',
    label: '迭代复盘',
    status: '待开始',
    icon: RefreshCw
  }
] as const

export default function RequirementDetailPage({
  spaces,
  requirementsBySpace
}: RequirementDetailPageProps): JSX.Element {
  const { spaceId, requirementId } = useParams()
  const spacePath = `/spaces/${spaceId ?? ''}`
  const space = spaces.find((item) => item.path === spacePath)
  const requirement = requirementsBySpace[spacePath]?.find(
    (item) => item.id === requirementId
  )
  const [activeStage, setActiveStage] =
    useState<RequirementStageId>('analysis')
  const workbench = useWorkbench()

  if (!space || !requirement) {
    return <Navigate to="/chat/new" replace />
  }

  return (
    <main className="requirement-detail-page">
      <div className="requirement-detail-content">
        <header className="requirement-detail-header">
          <div className="requirement-breadcrumb" aria-label="需求路径">
            <span>{space.label}</span>
            <ChevronRight size={14} />
            <span>需求详情</span>
          </div>
          <div className="requirement-title-row">
            <div>
              <span className="requirement-status">进行中</span>
              <h1>{requirement.title}</h1>
            </div>
            <div className="requirement-title-actions">
              <span className="requirement-stage">需求分析</span>
            </div>
          </div>
        </header>

        <section className="requirement-overview" aria-labelledby="requirement-overview-title">
          <div>
            <span>所属空间</span>
            <strong>{space.label}</strong>
          </div>
          <div>
            <span>当前阶段</span>
            <strong>需求分析</strong>
          </div>
          <div>
            <span>交付状态</span>
            <strong>规划中</strong>
          </div>
        </section>

        <section className="requirement-brief" aria-labelledby="requirement-overview-title">
          <h2 id="requirement-overview-title">需求概述</h2>
          <p>待补充本需求的目标、范围与验收标准。</p>
        </section>

        <section className="development-flow" aria-labelledby="development-flow-title">
          <div className="development-flow-heading">
            <div>
              <span>DELIVERY PIPELINE</span>
              <h2 id="development-flow-title">软件全流程开发</h2>
            </div>
            <strong>1 / {lifecycleStages.length}</strong>
          </div>
          <ol className="development-flow-track">
            {lifecycleStages.map(({ id, label, status, icon: Icon }, index) => (
              <li
                className={[
                  index === 0 ? 'current' : '',
                  activeStage === id ? 'selected' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={id}
              >
                <button
                  type="button"
                  aria-label={`打开${label}阶段`}
                  aria-pressed={activeStage === id}
                  onClick={() => {
                    setActiveStage(id)
                    workbench.openRequirementArtifact(
                      requirement.id,
                      id,
                      requirement.title
                    )
                  }}
                >
                  <div className="development-flow-node">
                    <Icon size={18} strokeWidth={1.8} />
                  </div>
                  <div className="development-flow-copy">
                    <strong>{label}</strong>
                    <span>{status}</span>
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  )
}
