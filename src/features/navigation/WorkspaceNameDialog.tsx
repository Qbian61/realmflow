import type { FormEvent } from 'react'
import { TriangleAlert } from 'lucide-react'

export type WorkspaceNameDialogState =
  | { kind: 'space' }
  | { kind: 'requirement'; spacePath: string; spaceLabel: string }
  | { kind: 'rename-space'; spacePath: string; spaceLabel: string }
  | { kind: 'delete-space'; spacePath: string; spaceLabel: string }
  | {
      kind: 'delete-requirement'
      spacePath: string
      requirementId: string
      requirementTitle: string
    }

type WorkspaceNameDialogProps = {
  dialog: WorkspaceNameDialogState
  draft: string
  onDraftChange: (value: string) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function WorkspaceNameDialog({
  dialog,
  draft,
  onDraftChange,
  onClose,
  onSubmit
}: WorkspaceNameDialogProps): JSX.Element {
  const isDelete =
    dialog.kind === 'delete-space' || dialog.kind === 'delete-requirement'
  const inputLabel =
    dialog.kind === 'space'
      ? '空间名称'
      : dialog.kind === 'requirement'
        ? '需求名称'
        : dialog.kind === 'rename-space'
          ? '更新后'
          : dialog.kind === 'delete-space'
            ? '输入空间名称以确认'
            : '输入需求名称以确认'

  return (
    <div
      className="name-dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        className="name-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-dialog-title"
        onSubmit={onSubmit}
      >
        <h2 id="name-dialog-title">
          {dialog.kind === 'space'
            ? '新建空间'
            : dialog.kind === 'requirement'
              ? '新建需求'
              : dialog.kind === 'rename-space'
                ? '更新空间名称'
                : dialog.kind === 'delete-space'
                  ? '删除空间'
                  : '删除需求'}
        </h2>
        {dialog.kind === 'rename-space' && (
          <p className="name-dialog-current">
            {`当前名称：${dialog.spaceLabel}`}
          </p>
        )}
        {dialog.kind === 'delete-space' && (
          <div className="name-dialog-warning">
            <TriangleAlert size={18} />
            <p>{`删除后，空间“${dialog.spaceLabel}”及空间下的所有需求都会被永久删除，且无法恢复。`}</p>
          </div>
        )}
        {dialog.kind === 'delete-requirement' && (
          <div className="name-dialog-warning">
            <TriangleAlert size={18} />
            <p>{`删除后，需求“${dialog.requirementTitle}”将被永久删除，且无法恢复。`}</p>
          </div>
        )}
        <label>
          <span>{inputLabel}</span>
          <input
            autoFocus
            value={draft}
            aria-label={inputLabel}
            maxLength={64}
            placeholder={
              dialog.kind === 'space'
                ? '输入空间名称'
                : dialog.kind === 'requirement'
                  ? `输入${dialog.spaceLabel}下的需求名称`
                  : dialog.kind === 'rename-space'
                    ? '输入新的空间名称'
                    : dialog.kind === 'delete-space'
                      ? `请输入“${dialog.spaceLabel}”`
                      : `请输入“${dialog.requirementTitle}”`
            }
            onChange={(event) => onDraftChange(event.target.value)}
          />
        </label>
        <div className="name-dialog-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button
            className={isDelete ? 'primary danger' : 'primary'}
            type="submit"
            aria-label={
              dialog.kind === 'space'
                ? '确认新建空间'
                : dialog.kind === 'requirement'
                  ? '确认新建需求'
                  : dialog.kind === 'rename-space'
                    ? '确认更新空间名称'
                    : dialog.kind === 'delete-space'
                      ? '确认删除空间'
                      : '确认删除需求'
            }
            disabled={
              dialog.kind === 'delete-space'
                ? draft !== dialog.spaceLabel
                : dialog.kind === 'delete-requirement'
                  ? draft !== dialog.requirementTitle
                  : dialog.kind === 'rename-space'
                    ? !draft.trim() || draft.trim() === dialog.spaceLabel
                    : !draft.trim()
            }
          >
            {isDelete ? '删除' : dialog.kind === 'rename-space' ? '更新' : '创建'}
          </button>
        </div>
      </form>
    </div>
  )
}
