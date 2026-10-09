import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { en } from './messages/en'
import { ja } from './messages/ja'
import { zhCN } from './messages/zh-CN'

describe('toast message catalogs', () => {
  it('keeps every toast key available in Chinese, English and Japanese', () => {
    const toastKeys = Object.keys(zhCN).filter((key) =>
      key.startsWith('toast.')
    ) as (keyof typeof zhCN)[]

    expect(toastKeys.length).toBeGreaterThan(0)
    expect(toastKeys.filter((key) => !en[key])).toEqual([])
    expect(toastKeys.filter((key) => !ja[key])).toEqual([])
  })

  it('keeps toast interpolation parameters aligned across locales', () => {
    const toastKeys = Object.keys(zhCN).filter((key) =>
      key.startsWith('toast.')
    ) as (keyof typeof zhCN)[]

    for (const key of toastKeys) {
      const expected = placeholders(zhCN[key])
      expect(placeholders(en[key] ?? '')).toEqual(expected)
      expect(placeholders(ja[key] ?? '')).toEqual(expected)
    }
  })

  it('localizes every statically declared Toast message key', () => {
    const keys = collectToastMessageKeys(resolve('src'))

    expect(keys.size).toBeGreaterThan(60)
    for (const key of keys) {
      expect(zhCN[key], `missing zh-CN message for ${key}`).toBeTruthy()
      expect(en[key], `missing English message for ${key}`).toBeTruthy()
      expect(ja[key], `missing Japanese message for ${key}`).toBeTruthy()
      expect(placeholders(en[key] ?? '')).toEqual(placeholders(zhCN[key] ?? ''))
      expect(placeholders(ja[key] ?? '')).toEqual(placeholders(zhCN[key] ?? ''))
    }
  })
})

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)]
    .map((match) => match[1])
    .sort()
}

function collectToastMessageKeys(directory: string): Set<keyof typeof zhCN> {
  const keys = new Set<keyof typeof zhCN>()
  for (const file of collectSourceFiles(directory)) {
    if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue
    const source = readFileSync(file, 'utf8')
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    )
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'toast' &&
        /^(success|info|warning|error|system)$/.test(node.expression.name.text)
      ) {
        collectStringLiterals(node.arguments[0], keys)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return keys
}

function collectStringLiterals(
  node: ts.Node | undefined,
  keys: Set<keyof typeof zhCN>
): void {
  if (!node) return
  if (ts.isStringLiteral(node)) {
    keys.add(node.text as keyof typeof zhCN)
    return
  }
  if (ts.isConditionalExpression(node)) {
    collectStringLiterals(node.whenTrue, keys)
    collectStringLiterals(node.whenFalse, keys)
  } else if (ts.isParenthesizedExpression(node)) {
    collectStringLiterals(node.expression, keys)
  }
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory)
    .map((entry) => resolve(directory, entry))
    .flatMap((entry) =>
      statSync(entry).isDirectory() ? collectSourceFiles(entry) : entry
    )
    .filter((file) => /\.(ts|tsx)$/.test(file))
}
