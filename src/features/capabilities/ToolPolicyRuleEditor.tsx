import { useEffect, useState } from 'react'
import { TOOL_PROFILES, type ToolPolicyRules } from '../../../domain/tool-policy'
import { Field } from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'

export function ToolPolicyRuleEditor({ rules, onChange }: {
  rules: ToolPolicyRules
  onChange(rules: ToolPolicyRules): void
}): JSX.Element {
  const { t } = useLocalization()
  return <div className="tool-policy-rule-grid">
    <Field name="profile" label={t('toolPolicy.profile')}>
      <select value={rules.profile ?? ''} onChange={(event) => {
        const next = { ...rules }
        if (event.target.value) next.profile = event.target.value as ToolPolicyRules['profile']
        else delete next.profile
        onChange(next)
      }}>
        <option value="">{t('toolPolicy.profile.inherit')}</option>
        {TOOL_PROFILES.map((profile) => <option key={profile} value={profile}>{t(`toolPolicy.profile.${profile}`)}</option>)}
      </select>
    </Field>
    <Field name="allowEnabled" label={t('toolPolicy.allowEnabled')} description={t('toolPolicy.allowHelp')}>
      <input type="checkbox" checked={rules.allow !== undefined} onChange={(event) => {
        const next = { ...rules }
        if (event.target.checked) next.allow = []
        else delete next.allow
        onChange(next)
      }} />
    </Field>
    {rules.allow !== undefined ? <SelectorField name="allow" label={t('toolPolicy.allow')}
      value={rules.allow} onChange={(allow) => onChange({ ...rules, allow })} /> : null}
    <SelectorField name="deny" label={t('toolPolicy.deny')}
      value={rules.deny ?? []} onChange={(deny) => onChange({ ...rules, deny })} />
    <SelectorField name="alsoAllow" label={t('toolPolicy.alsoAllow')}
      value={rules.alsoAllow ?? []} onChange={(alsoAllow) => onChange({ ...rules, alsoAllow })} />
  </div>
}

function SelectorField({ name, label, value, onChange }: {
  name: string; label: string; value: string[]; onChange(value: string[]): void
}): JSX.Element {
  const [text, setText] = useState(value.join(', '))
  const canonical = JSON.stringify(value)
  useEffect(() => {
    if (JSON.stringify(split(text)) !== canonical) setText(JSON.parse(canonical).join(', '))
  }, [canonical, text])
  return <Field name={name} label={label} spellCheck={false}>
    <input value={text} onChange={(event) => {
      setText(event.target.value)
      onChange(split(event.target.value))
    }} />
  </Field>
}

function split(value: string): string[] {
  return [...new Set(value.split(/[\s,，]+/).filter(Boolean))]
}
