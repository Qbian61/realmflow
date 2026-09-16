import { readFileSync } from 'node:fs'

const indexHtml = readFileSync('index.html', 'utf8')

describe('renderer security policy', () => {
  it('allows only the controlled artifact protocol in preview frames', () => {
    expect(indexHtml).toContain("frame-src realmflow-artifact:")
  })
})
