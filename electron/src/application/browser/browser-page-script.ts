// Self-contained: serialized into a CDP isolated world, never the page world.
export function installBrowserPage() {
  const refs = new Map<string, HTMLElement>()
  const masks = new Map<HTMLElement, string>()
  const sensitive = /password|passwd|secret|token|api.?key|authorization|credit.?card|cc-number|one-time-code/i
  const controls = 'input,textarea,select,button,a[href],[role],[contenteditable="true"]'
  const isSensitive = (el: Element) =>
    el instanceof HTMLInputElement && (el.type === 'password' || el.type === 'hidden') ||
    sensitive.test(['name', 'id', 'autocomplete', 'aria-label'].map((key) => el.getAttribute(key) ?? '').join(' '))
  const visible = (el: Element): boolean => {
    for (let parent: Element | null = el; parent; parent = parent.parentElement) {
      if (parent.matches('[hidden],[aria-hidden="true"],script,style,noscript,template')) return false
      const style = getComputedStyle(parent)
      if (style.display === 'none' || style.visibility === 'hidden') return false
    }
    return true
  }
  const secrets = () => Array.from(document.querySelectorAll<HTMLInputElement>('input,textarea'))
    .filter(isSensitive).map((el) => el.value).filter(Boolean)
  let secretValues: string[] = []
  const clean = (text: string, limit: number) => {
    let result = text
    for (const secret of secretValues) result = result.split(secret).join('[redacted]')
    return result.replace(/https?:\/\/[^\s<>"']+/g, (value) => {
      try {
        const url = new URL(value)
        url.username = ''; url.password = ''; url.hash = ''
        for (const key of [...url.searchParams.keys()]) {
          if (sensitive.test(key)) url.searchParams.set(key, '[redacted]')
        }
        return url.toString()
      } catch { return '[invalid URL]' }
    }).replace(/\s+/g, ' ').trim().slice(0, limit)
  }
  const textOf = (root: Node, limit: number, label = false): string => {
    let text = ''
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    while (walker.nextNode() && text.length < limit) {
      const parent = walker.currentNode.parentElement
      if (label && parent?.closest('select,input,textarea,button')) continue
      if (parent && visible(parent) && !isSensitive(parent)) text += ` ${walker.currentNode.textContent ?? ''}`
    }
    return clean(text, limit)
  }
  const target = (ref: string): HTMLElement => {
    const el = refs.get(ref)
    if (!el?.isConnected || !visible(el)) throw new Error('Stale or hidden browser reference; take a new snapshot')
    return el
  }
  const editable = (ref: string): HTMLInputElement | HTMLTextAreaElement => {
    const el = target(ref)
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ||
        el.disabled || el.readOnly ||
        el instanceof HTMLInputElement && ['hidden', 'file', 'checkbox', 'radio', 'submit', 'button'].includes(el.type)) {
      throw new Error('Target is not editable')
    }
    return el
  }
  const changed = (el: HTMLElement) => {
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  return {
    snapshot(id: string) {
      refs.clear()
      secretValues = secrets()
      const elements: { ref: string; role: string; name: string; value?: string; disabled: boolean }[] = []
      let truncated = false
      for (const el of document.querySelectorAll<HTMLElement>(controls)) {
        if (!visible(el) || el instanceof HTMLInputElement && el.type === 'hidden') continue
        if (elements.length === 200) { truncated = true; break }
        const ref = `${id}:${elements.length + 1}`
        refs.set(ref, el)
        const labelled = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/)
          .map((key) => document.getElementById(key)).filter((node) => node !== null)
          .map((node) => textOf(node, 200)).join(' ').trim()
        const labels = 'labels' in el
          ? Array.from((el as HTMLInputElement).labels ?? []).map((label) => textOf(label, 200, true)).join(' ')
          : ''
        const name = clean(el.getAttribute('aria-label') || labelled || labels || textOf(el, 200), 200)
        const role = el.getAttribute('role') ||
          ({ INPUT: 'textbox', TEXTAREA: 'textbox', SELECT: 'combobox', BUTTON: 'button', A: 'link' }[el.tagName] ?? 'generic')
        const value = 'value' in el && !isSensitive(el) ? clean(String(el.value), 300) : undefined
        elements.push({ ref, role, name, ...(value !== undefined ? { value } : {}), disabled: el.matches(':disabled') })
      }
      const text = textOf(document.body ?? document.documentElement, 16_001)
      return {
        text: text.slice(0, 16_000), elements, trust: 'untrusted_page',
        truncated: truncated || text.length > 16_000
      }
    },
    fill(ref: string, value: string) {
      const el = editable(ref)
      el.focus()
      const prototype = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(el, value)
      changed(el)
    },
    select(ref: string, value: string) {
      const el = target(ref)
      if (!(el instanceof HTMLSelectElement) || el.disabled) throw new Error('Target is not an enabled select')
      if (!Array.from(el.options).some((option) => option.value === value && !option.disabled)) {
        throw new Error('Requested option is unavailable')
      }
      el.value = value
      changed(el)
    },
    target,
    mask() {
      for (const el of document.querySelectorAll<HTMLElement>('input,textarea,iframe')) {
        if (!isSensitive(el) && el.tagName !== 'IFRAME') continue
        if (!masks.has(el)) masks.set(el, el.style.cssText)
        el.style.setProperty('visibility', 'hidden', 'important')
      }
    },
    unmask() {
      for (const [el, style] of masks) el.style.cssText = style
      masks.clear()
    }
  }
}
