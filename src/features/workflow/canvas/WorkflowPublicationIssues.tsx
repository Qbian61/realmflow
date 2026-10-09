import type { WorkflowTemplatePublicationIssueDto } from '../../../../shared/business'
import { InlineAlert } from '../../../components/ui'
import { useLocalization } from '../../../localization/LocalizationProvider'

export function WorkflowPublicationIssues({
  issues,
  onSelect
}: {
  issues: WorkflowTemplatePublicationIssueDto[]
  onSelect: (issue: WorkflowTemplatePublicationIssueDto) => void
}): JSX.Element | null {
  const { t } = useLocalization()
  if (issues.length === 0) return null

  return (
    <InlineAlert
      className="workflow-publication-issues"
      tone="warning"
      title={t('workflowCanvas.publicationIssues')}
    >
      <ul>
        {issues.map((issue, index) => (
          <li key={`${issue.code}:${issue.nodeId ?? issue.edgeId ?? index}`}>
            <button type="button" onClick={() => onSelect(issue)}>
              {issue.message}
            </button>
          </li>
        ))}
      </ul>
    </InlineAlert>
  )
}
