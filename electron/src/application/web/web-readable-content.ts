import { parse, type DefaultTreeAdapterMap } from 'parse5'
import { parseWebUrl, sanitizeWebUrl } from './web-response'

type Node = DefaultTreeAdapterMap['node']
const excluded = new Set(['script', 'style', 'noscript', 'nav', 'footer', 'template', 'svg', 'form'])
const blocks = new Set(['p', 'div', 'main', 'section', 'article', 'li', 'tr', 'blockquote', 'br'])

export function readableWebContent(html: string, baseUrl: URL): { title: string; text: string } {
  const document = parse(html)
  const nodes: Node[] = [document]
  let main: Node | undefined
  let article: Node | undefined
  let body: Node | undefined
  let title = ''
  // Iterative discovery avoids recursion on untrusted, deeply nested HTML.
  while (nodes.length) {
    const node = nodes.pop()!
    if ('tagName' in node) {
      if (node.tagName === 'main' && !main) main = node
      if (node.tagName === 'article' && !article) article = node
      if (node.tagName === 'body') body = node
      if (node.tagName === 'title') title = render(node, baseUrl, 0)
    }
    if ('childNodes' in node) nodes.push(...node.childNodes.slice().reverse())
  }
  return {
    title: normalizeWebText(title).slice(0, 300),
    text: normalizeWebText(render(main ?? article ?? body ?? document, baseUrl, 0))
  }
}

function render(node: Node, base: URL, depth: number): string {
  if (depth > 256) return ''
  if (node.nodeName === '#text' && 'value' in node) return node.value
  if (!('childNodes' in node)) return ''
  const tag = 'tagName' in node ? node.tagName : ''
  if (excluded.has(tag)) return ''
  if ('attrs' in node && node.attrs.some(({ name, value }) =>
    name === 'hidden' || (name === 'aria-hidden' && value === 'true'))) return ''
  const content = node.childNodes.map((child) => render(child, base, depth + 1)).join('')
  if (/^h[1-6]$/.test(tag)) return `\n${'#'.repeat(Number(tag[1]))} ${content}\n`
  if (tag === 'a' && 'attrs' in node) {
    const href = node.attrs.find(({ name }) => name === 'href')?.value
    if (href) {
      try {
        const url = sanitizeWebUrl(parseWebUrl(new URL(href, base).href))
        return content.trim() ? `[${content.trim()}](${url})` : url
      } catch { return content }
    }
  }
  return blocks.has(tag) ? `\n${content}\n` : content
}

export function normalizeWebText(value: string): string {
  return value.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n')
}
