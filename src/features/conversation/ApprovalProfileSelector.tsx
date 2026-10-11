import {
  Check,
  ChevronDown,
  Shield,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { ApprovalProfileId } from '../../../domain/approval-profile'
import { useWorkspacePageActive } from '../navigation/WorkspaceRouteCache'

type ApprovalProfileSelectorProps = {
  ariaLabel: string
  value: ApprovalProfileId
  labels: Record<ApprovalProfileId, string>
  descriptions: Record<ApprovalProfileId, string>
  disabled?: boolean
  onChange: (value: ApprovalProfileId) => void
}

const OPTIONS: Array<{ value: ApprovalProfileId; icon: LucideIcon }> = [
  { value: 'cautious', icon: ShieldAlert },
  { value: 'protected', icon: ShieldCheck },
  { value: 'trusted', icon: Shield },
]

export function ApprovalProfileSelector({
  ariaLabel,
  value,
  labels,
  descriptions,
  disabled = false,
  onChange,
}: ApprovalProfileSelectorProps): JSX.Element {
  const pageActive = useWorkspacePageActive()
  const listboxId = useId()
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<'up' | 'down'>('up')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pageActive || !open) return
    const close = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, pageActive])

  useLayoutEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)')
      ?.focus()
  }, [open])

  const toggle = (): void => {
    if (disabled) return
    setOpen(current => {
      const next = !current
      if (next) {
        const bounds = rootRef.current?.getBoundingClientRect()
        if (bounds) {
          const spaceAbove = bounds.top - 8
          const spaceBelow = window.innerHeight - bounds.bottom - 8
          setPlacement(
            spaceAbove >= 320 || spaceAbove >= spaceBelow ? 'up' : 'down',
          )
        }
      }
      return next
    })
  }

  const choose = (nextValue: ApprovalProfileId): void => {
    onChange(nextValue)
    setOpen(false)
  }

  const moveOptionFocus = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="option"]:not(:disabled)',
      ),
    )
    if (options.length === 0) return
    const current = options.indexOf(document.activeElement as HTMLButtonElement)
    const target =
      event.key === 'Home'
        ? options[0]
        : event.key === 'End'
          ? options[options.length - 1]
          : event.key === 'ArrowDown'
            ? options[(Math.max(current, -1) + 1) % options.length]
            : options[(current <= 0 ? options.length : current) - 1]
    event.preventDefault()
    target?.focus()
  }

  return (
    <div
      className="model-selector approval-profile-selector"
      data-profile={value}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        className="model-selector-trigger approval-profile-selector-trigger"
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        title={ariaLabel}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-valuetext={labels[value]}
        disabled={disabled}
        onClick={toggle}
      >
        <ShieldCheck size={18} />
        <span>{labels[value]}</span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div
          className="model-selector-popover approval-profile-selector-popover ui-menu"
          data-placement={placement}
        >
          <div
            ref={listRef}
            className="model-selector-list"
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            onKeyDown={moveOptionFocus}
          >
            {OPTIONS.map(option => {
              const Icon = option.icon
              const selected = option.value === value
              const labelId = `${listboxId}-${option.value}-label`
              const descriptionId = `${listboxId}-${option.value}-description`
              return (
                <button
                  className={[
                    'ui-menu-item',
                    option.value === 'trusted'
                      ? 'approval-profile-option--trusted'
                      : '',
                  ].filter(Boolean).join(' ')}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-labelledby={labelId}
                  aria-describedby={descriptionId}
                  key={option.value}
                  onClick={() => choose(option.value)}
                >
                  <span className="model-selector-option-content">
                    <Icon
                      className="model-selector-provider-logo"
                      size={14}
                    />
                    <span className="approval-profile-option-text">
                      <span
                        className="model-selector-option-label"
                        id={labelId}
                      >
                        {labels[option.value]}
                      </span>
                      <span
                        className="approval-profile-option-description"
                        id={descriptionId}
                      >
                        {descriptions[option.value]}
                      </span>
                    </span>
                  </span>
                  {selected ? <Check size={13} /> : null}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
