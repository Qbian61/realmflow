import { beforeEach, describe, expect, it } from 'vitest'
import { installBrowserPage } from './browser-page-script'

describe('browser page DOM runtime', () => {
  beforeEach(() => {
    document.body.innerHTML = `<main><h1>Account</h1>
      <label>Name <input id="name" value="Ada"></label>
      <label>Password <input id="password" type="password" value="secret-pass"></label>
      <input type="hidden" value="hidden-secret">
      <script>window.token = "script-secret"</script>
      <p hidden>hidden text</p>
      <button id="save">Save</button>
      <select aria-label="Color"><option value="red">Red</option><option value="blue">Blue</option></select>
      <a href="https://example.test/?token=url-secret">Details</a></main>`
  })

  it('returns readable text and referenceable controls, excluding hidden and secret data', () => {
    const page = installBrowserPage()
    const snapshot = page.snapshot('s1')
    expect(snapshot.text).toContain('Account')
    expect(snapshot.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'textbox', name: 'Name', value: 'Ada' }),
      expect.objectContaining({ role: 'button', name: 'Save' })
    ]))
    expect(JSON.stringify(snapshot)).not.toMatch(/secret-pass|hidden-secret|script-secret|hidden text|url-secret/)
    expect(snapshot.trust).toBe('untrusted_page')
  })

  it('fills a native input and delivers input/change events', () => {
    const page = installBrowserPage()
    const { ref } = page.snapshot('s1').elements.find((e) => e.name === 'Name')!
    const events: string[] = []
    const input = document.querySelector<HTMLInputElement>('#name')!
    input.addEventListener('input', () => events.push('input'))
    input.addEventListener('change', () => events.push('change'))
    page.fill(ref, 'Grace')
    expect(input.value).toBe('Grace')
    expect(events).toEqual(['input', 'change'])
  })

  it('selects a valid option and rejects missing option values', () => {
    const page = installBrowserPage()
    const { ref } = page.snapshot('s1').elements.find((e) => e.name === 'Color')!
    page.select(ref, 'blue')
    expect(document.querySelector('select')!.value).toBe('blue')
    expect(() => page.select(ref, 'missing')).toThrow('option')
  })

  it('invalidates references on a new snapshot and rejects detached elements', () => {
    const page = installBrowserPage()
    const first = page.snapshot('s1').elements.find((e) => e.name === 'Name')!
    page.snapshot('s2')
    expect(() => page.fill(first.ref, 'wrong')).toThrow('reference')
    const second = page.snapshot('s3').elements.find((e) => e.name === 'Name')!
    document.querySelector('#name')!.remove()
    expect(() => page.fill(second.ref, 'wrong')).toThrow('reference')
  })

  it('does not mutate disabled or non-editable targets', () => {
    document.querySelector<HTMLInputElement>('#name')!.disabled = true
    const page = installBrowserPage()
    const snapshot = page.snapshot('s1')
    expect(() => page.fill(snapshot.elements.find((e) => e.name === 'Name')!.ref, 'wrong'))
      .toThrow('editable')
    expect(() => page.fill(snapshot.elements.find((e) => e.name === 'Save')!.ref, 'wrong'))
      .toThrow('editable')
  })

  it('bounds text and control count on large pages', () => {
    document.body.innerHTML = `<p>${'x'.repeat(40_000)}</p>${'<button>Go</button>'.repeat(350)}`
    const snapshot = installBrowserPage().snapshot('large')
    expect(snapshot.text.length).toBeLessThanOrEqual(16_000)
    expect(snapshot.elements.length).toBeLessThanOrEqual(200)
    expect(snapshot.truncated).toBe(true)
  })

  it('masks sensitive fields for screenshots and restores original rendering', () => {
    const page = installBrowserPage()
    const password = document.querySelector<HTMLInputElement>('#password')!
    password.style.visibility = 'visible'
    page.mask()
    expect(password.style.visibility).toBe('hidden')
    page.unmask()
    expect(password.style.visibility).toBe('visible')
    expect(password.value).toBe('secret-pass')
  })

  it('uses the label text without appending selectable option values', () => {
    document.body.innerHTML = '<label>Color <select><option>Red</option><option>Blue</option></select></label>'
    expect(installBrowserPage().snapshot('s').elements[0].name).toBe('Color')
  })
})
