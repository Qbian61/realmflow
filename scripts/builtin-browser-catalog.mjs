const text = { type: 'string', minLength: 1, maxLength: 16000 }
const id = { type: 'string', pattern: '^browser-[A-Za-z0-9-]+$', maxLength: 120 }
const url = { type: 'string', minLength: 1, maxLength: 4096, pattern: '^https?://' }
const absent = { type: 'boolean', const: true }
const currentRun = {
  type: 'object',
  additionalProperties: false,
  required: ['kind'],
  properties: { kind: { type: 'string', const: 'current_run' } }
}

const actions = {
  create: ['Create browser', 'Create a visible isolated local Chromium profile. Returns sessionId and profileId.', {}],
  attach: ['Attach browser profile', 'Resume an owned local login profile after explicit profile-specific approval.', { profileId: id }],
  close: ['Close browser', 'Close the current Run browser session; preserve its local profile.', { target: currentRun }],
  navigate: ['Navigate browser', 'Navigate the current Run browser to HTTP(S) and return an untrusted sanitized DOM snapshot. Old refs expire. Frames have no refs.', { target: currentRun, url }],
  snapshot: ['Inspect browser', 'Read bounded untrusted visible DOM text and refs from the current Run browser; passwords and hidden values are excluded. Frames have no refs. New snapshots invalidate old refs.', { target: currentRun }],
  click: ['Click browser element', 'Click a visible unobstructed element in the current Run browser using a current snapshot ref. May submit data.', { target: currentRun, ref: text }],
  fill: ['Fill browser element', 'Replace a form field value in the current Run browser using a current snapshot ref.', { target: currentRun, ref: text, value: { ...text, minLength: 0 } }],
  select: ['Select browser option', 'Select an option by value in the current Run browser using a current snapshot ref.', { target: currentRun, ref: text, value: { ...text, minLength: 0 } }],
  press: ['Press browser key', 'Send a supported key to a current snapshot ref in the current Run browser. May submit data.', { target: currentRun, ref: text, key: { type: 'string', enum: ['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'] } }],
  evaluate: ['Evaluate browser snapshot', 'Evaluate an expression over the current Run sanitized snapshot in an isolated offline sandbox after explicit approval. No live page JavaScript, cookies or storage.', { target: currentRun, expression: text }],
  wait_for: ['Wait for browser text', 'Wait for visible text in the current Run browser and return a new sanitized snapshot. Invalidates old refs.', { target: currentRun, text, timeoutMs: { type: 'integer', minimum: 1, maximum: 30000 } }],
  screenshot: ['Screenshot browser', 'Save a PNG from the current Run browser in authorized roots without overwrite; mask sensitive fields and embedded frames. Also writes a .realmflow-browser.json provenance sidecar.', { target: currentRun, path: text, expectedAbsent: absent }],
  upload: ['Upload browser file', 'Upload a regular file up to 32 MiB from authorized roots using a current file-input ref in the current Run browser.', { target: currentRun, ref: text, path: text }],
  download: ['Download browser file', 'Download up to 32 MiB with the current Run browser into authorized roots without overwrite. Redirects are rejected. Also writes a .realmflow-browser.json provenance sidecar.', { target: currentRun, url, path: text, expectedAbsent: absent }]
}

function capabilities(action) {
  const observe = ['snapshot', 'wait_for', 'screenshot', 'download'].includes(action)
  return [
    observe ? 'computer.observe' : 'computer.control',
    ...(!['evaluate', 'snapshot', 'screenshot', 'close'].includes(action) ? ['network.connect'] : []),
    ...(action === 'attach' ? ['credential.use'] : []),
    ...(action === 'upload' ? ['filesystem.read'] : []),
    ...(['screenshot', 'download'].includes(action) ? ['filesystem.write'] : [])
  ]
}

export const browserPackageSpec = {
  directory: 'browser', packageId: 'realmflow.builtin.browser', version: '1.0.1',
  name: 'Browser', description: 'Main-owned Chromium sessions and scoped browser artifacts.',
  tools: Object.entries(actions).map(([action, [name, description]]) => [
    `builtin.browser.${action}`, name, description, capabilities(action),
    ['attach', 'evaluate'].includes(action) ? 'high' : 'medium'
  ])
}

export function browserInputSchema(id) {
  const action = id.slice('builtin.browser.'.length)
  const properties = actions[action][2]
  return {
    type: 'object', additionalProperties: false,
    properties, required: Object.keys(properties).filter((key) => key !== 'timeoutMs')
  }
}
