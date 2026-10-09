import { readFileSync, readdirSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import ts from 'typescript'

const sourceRoot = resolve('src')
const LOCALIZED_ATTRIBUTES = new Set([
  'aria-label',
  'aria-description',
  'placeholder',
  'title',
  'alt'
])
const ALLOWED_AUTONYMS = new Set(['简体中文', '日本語'])
const CJK_PATTERN = /[\u3400-\u9fff\u3040-\u30ff]/

describe('translation coverage', () => {
  it('keeps Renderer-owned JSX copy behind the localization catalog', () => {
    const violations = collectTsxFiles(sourceRoot)
      .filter((file) => !file.endsWith('.test.tsx'))
      .flatMap(findUntranslatedJsx)

    expect(violations).toEqual([])
  })
})

function findUntranslatedJsx(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const violations: string[] = []

  const report = (node: ts.Node, text: string): void => {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (
      normalized &&
      CJK_PATTERN.test(normalized) &&
      !ALLOWED_AUTONYMS.has(normalized)
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart())
      violations.push(
        `${relative(sourceRoot, file)}:${position.line + 1} ${normalized}`
      )
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      report(node, node.text)
    } else if (
      ts.isJsxAttribute(node) &&
      LOCALIZED_ATTRIBUTES.has(node.name.getText(sourceFile))
    ) {
      if (node.initializer && ts.isStringLiteral(node.initializer)) {
        report(node.initializer, node.initializer.text)
      } else if (
        node.initializer &&
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression &&
        (ts.isStringLiteral(node.initializer.expression) ||
          ts.isNoSubstitutionTemplateLiteral(node.initializer.expression))
      ) {
        report(node.initializer.expression, node.initializer.expression.text)
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

function collectTsxFiles(directory: string): string[] {
  return readdirSync(directory)
    .map((entry) => resolve(directory, entry))
    .flatMap((entry) =>
      statSync(entry).isDirectory() ? collectTsxFiles(entry) : entry
    )
    .filter((file) => file.endsWith('.tsx'))
}
