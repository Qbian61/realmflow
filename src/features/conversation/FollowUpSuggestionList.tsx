import { ArrowRight, MessageCircle } from 'lucide-react'
import type {
  AssistantMessageFollowUp,
  FollowUpSuggestion
} from '../../../domain/follow-up-suggestion'
import { IconButton } from '../../components/ui'

type Labels = {
  region: string
  send: (label: string) => string
  insert: (label: string) => string
  sendTitle: string
  insertTitle: string
}

type Props = {
  followUp: AssistantMessageFollowUp
  labels: Labels
  sending?: boolean
  onSend?: (suggestion: Omit<FollowUpSuggestion, 'sortOrder'>) => void
  onInsert: (suggestion: Omit<FollowUpSuggestion, 'sortOrder'>) => void
}

export function FollowUpSuggestionList({
  followUp,
  labels,
  sending = false,
  onSend,
  onInsert
}: Props): JSX.Element | null {
  const suggestions = followUp.suggestions.slice(0, 3)
  if (suggestions.length === 0) return null
  return (
    <section
      className="follow-up-suggestions"
      aria-label={labels.region}
      aria-busy={sending || undefined}
    >
      <div className="follow-up-suggestions__list">
        {suggestions.map((suggestion) => (
          <div className="follow-up-suggestion" key={suggestion.id}>
            <span className="follow-up-suggestion__text">
              {suggestion.label}
            </span>
            <IconButton
              className="follow-up-suggestion__action"
              variant="ghost"
              size="default"
              aria-label={labels.send(suggestion.label)}
              title={labels.sendTitle}
              disabled={sending || !onSend}
              onClick={() => onSend?.(suggestion)}
            >
              <ArrowRight aria-hidden="true" size={16} />
            </IconButton>
            <IconButton
              className="follow-up-suggestion__action"
              variant="ghost"
              size="default"
              aria-label={labels.insert(suggestion.label)}
              title={labels.insertTitle}
              disabled={sending}
              onClick={() => onInsert(suggestion)}
            >
              <MessageCircle aria-hidden="true" size={16} />
            </IconButton>
          </div>
        ))}
      </div>
    </section>
  )
}
