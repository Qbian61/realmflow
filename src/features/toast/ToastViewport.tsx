import {
  Bell,
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  X,
  type LucideIcon
} from 'lucide-react'
import { useLocalization } from '../../localization/LocalizationProvider'
import type {
  ToastLevel,
  ToastMessage
} from './toast-types'

const icons: Record<ToastLevel, LucideIcon> = {
  success: CircleCheck,
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
  system: Bell
}

export function ToastViewport({
  messages,
  headId,
  onDismiss,
  onPauseHead,
  onResumeHead
}: {
  messages: ToastMessage[]
  headId?: string
  onDismiss: (id: string) => void
  onPauseHead: (id: string) => void
  onResumeHead: () => void
}): JSX.Element | null {
  const { t } = useLocalization()

  if (messages.length === 0) return null

  return (
    <div className="toast-viewport" aria-live="polite">
      {messages.map((message) => {
        const Icon = icons[message.level]
        const isHead = message.id === headId
        return (
          <div
            key={message.id}
            className="toast-message"
            data-toast-level={message.level}
            role={message.level === 'error' ? 'alert' : 'status'}
            aria-atomic="true"
            onMouseEnter={
              isHead ? () => onPauseHead(message.id) : undefined
            }
            onMouseLeave={isHead ? onResumeHead : undefined}
          >
            <Icon
              className="toast-message__level-icon"
              data-toast-icon={message.level}
              size={18}
              aria-hidden="true"
            />
            <span className="toast-message__content">
              <span className="toast-message__text">
                {t(message.messageKey, message.values)}
              </span>
              {message.level === 'error' ? (
                <small className="toast-message__guidance">
                  {t('toast.error.defaultGuidance')}
                </small>
              ) : null}
            </span>
            <button
              className="toast-message__close"
              type="button"
              aria-label={t('common.close')}
              title={t('common.close')}
              onClick={() => onDismiss(message.id)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
