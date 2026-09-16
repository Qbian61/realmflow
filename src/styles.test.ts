import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
const workbenchStyles = readFileSync(
  resolve(process.cwd(), 'src/features/workbench/workbench.css'),
  'utf8'
)
const artifactWorkbenchStyles = readFileSync(
  resolve(process.cwd(), 'src/features/artifacts/artifact-workbench.css'),
  'utf8'
)
const nativeWorkbenchMenuStyles = readFileSync(
  resolve(
    process.cwd(),
    'src/features/workbench/native-workbench-menu.css'
  ),
  'utf8'
)
const electronMainSource = readFileSync(
  resolve(process.cwd(), 'electron/src/main.ts'),
  'utf8'
)

describe('Composer focus styles', () => {
  it('uses only the inner input border as focus feedback', () => {
    expect(styles).not.toMatch(/\.composer:focus-within\s*\{/)
    expect(styles).toMatch(
      /\.composer:focus-within \.composer-input\s*\{[^}]*border-color: #bcbcbc;[^}]*\}/
    )
  })

  it('darkens context controls without adding decoration', () => {
    const interactionRule = styles.match(
      /\.composer-context \.select-control:hover,\s*\.composer-context \.select-control:focus-within\s*\{([^}]*)\}/
    )?.[1]

    expect(interactionRule).toBeDefined()
    expect(interactionRule ?? '').toContain('color: #222;')
    expect(interactionRule ?? '').not.toMatch(/background|border|box-shadow/)
    expect(styles).toMatch(
      /\.composer-context \.select-control select\s*\{[^}]*color: inherit;[^}]*\}/
    )
  })

  it('keeps the composer attachment menu compact', () => {
    const menuRule =
      styles.match(/\.attachment-menu\s*\{([^}]*)\}/)?.[1] ?? ''
    const optionRule =
      styles.match(/\.attachment-menu button\s*\{([^}]*)\}/)?.[1] ?? ''
    const dividerRule =
      styles.match(/\.attachment-menu-rule\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(menuRule).toContain('padding: 4px;')
    expect(menuRule).toContain('border-radius: 10px;')
    expect(optionRule).toContain('min-height: 32px;')
    expect(optionRule).toContain('font-size: 13px;')
    expect(dividerRule).toContain('margin: 3px 6px;')
  })

  it('keeps elevation on the composer but not the inner input', () => {
    const composerRule =
      styles.match(/(?:^|\n)\.composer\s*\{([^}]*)\}/)?.[1] ?? ''
    const inputRule =
      styles.match(/(?:^|\n)\.composer-input\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(composerRule).toContain('box-shadow:')
    expect(composerRule).toContain(
      'box-shadow: 0 18px 24px -22px rgba(0, 0, 0, 0.14);'
    )
    expect(inputRule).not.toContain('box-shadow:')
  })

  it('centers the new-chat composer unchanged on the space overview', () => {
    const launcherRule =
      styles.match(/\.space-chat\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(launcherRule).toContain('display: flex;')
    expect(launcherRule).toContain('justify-content: center;')
    expect(styles).not.toMatch(/\.space-chat \.composer-input\s*\{/)
    expect(styles).not.toMatch(/\.space-chat \.composer textarea\s*\{/)
    expect(styles).toMatch(
      /\.composer\.without-context \.composer-input\s*\{[^}]*border-radius: 28px;[^}]*\}/
    )
  })

  it('aligns space and new-chat composers to the same top position', () => {
    const chatLauncherRule =
      styles.match(/\.chat-launcher\s*\{([^}]*)\}/)?.[1] ?? ''
    const spacePageRule =
      styles.match(/\.space-detail-page\s*\{([^}]*)\}/)?.[1] ?? ''
    const spaceContentRule =
      styles.match(/\.space-detail-content\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(chatLauncherRule).toContain(
      'padding: 89px clamp(36px, 7vw, 96px) 36px;'
    )
    expect(spacePageRule).toContain(
      'grid-template-rows: 64px minmax(0, 1fr);'
    )
    expect(spaceContentRule).toContain('padding: 25px 0 40px;')
  })

  it('keeps space and new-chat composers aligned in narrow workspaces', () => {
    const narrowStyles =
      styles.match(
        /@container main-workspace \(max-width: 520px\) \{([\s\S]*?)\n\}/
      )?.[1] ?? ''

    expect(narrowStyles).toMatch(
      /\.chat-launcher\s*\{[^}]*padding: 84px 16px 24px;/
    )
    expect(narrowStyles).toMatch(
      /\.space-detail-content\s*\{[^}]*padding: 20px 16px 32px;/
    )
  })

  it('matches the space detail body width to the new-chat content width', () => {
    const spaceContentRules = [
      ...styles.matchAll(/\.space-detail-content\s*\{([^}]*)\}/g)
    ]

    expect(spaceContentRules).toHaveLength(2)
    expect(spaceContentRules[0]?.[1]).toContain(
      'width: min(1180px, calc(100% - clamp(68px, 10vw, 144px)));'
    )
    expect(spaceContentRules[1]?.[1]).toContain('width: auto;')
  })

  it('centers the space detail tabs in the title row', () => {
    const tabsRule =
      styles.match(/\.space-detail-tabs\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(tabsRule).toContain('justify-content: center;')
    expect(tabsRule).toContain('align-items: center;')
  })

  it('keeps only the active tab underline in the space detail header', () => {
    const tabsRule =
      styles.match(/\.space-detail-tabs\s*\{([^}]*)\}/)?.[1] ?? ''
    const activeTabRule =
      styles.match(
        /\.space-detail-tabs button\[aria-selected='true'\]\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(tabsRule).not.toContain('border-bottom:')
    expect(activeTabRule).toContain('border-bottom-color: #202020;')
  })

  it('does not draw a full-width divider below the conversation header', () => {
    const headerRule =
      styles.match(/\.chat-session-header\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(headerRule).not.toContain('border-bottom:')
  })

  it('uses readable new-chat typography below the space composer', () => {
    const summaryLabelRule =
      styles.match(/\.space-statistics-summary span\s*\{([^}]*)\}/)?.[1] ?? ''
    const headingRule =
      styles.match(
        /\.space-statistics-grid h2,\s*\.space-resource-header h2\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const stageRule =
      styles.match(/\.space-stage-row\s*\{([^}]*)\}/)?.[1] ?? ''
    const requirementRule =
      styles.match(
        /\.space-requirement-table > div,\s*\.space-requirement-table > a\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const resourceRule =
      styles.match(/\.space-resource-table > div\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(summaryLabelRule).toContain('font-size: 13px;')
    expect(headingRule).toContain('font-size: 16px;')
    expect(stageRule).toContain('font-size: 12px;')
    expect(requirementRule).toContain('font-size: 12px;')
    expect(resourceRule).toContain('font-size: 12px;')
  })

  it('matches the recent heading density to the spaces heading', () => {
    const spacesHeadingRule =
      styles.match(/\.spaces-heading\s*\{([^}]*)\}/)?.[1] ?? ''
    const recentHeadingRule =
      styles.match(/\.recent-heading\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(spacesHeadingRule).toContain('height: 32px;')
    expect(recentHeadingRule).toContain('height: 32px;')
    expect(recentHeadingRule).toContain('padding: 0 8px;')
    expect(recentHeadingRule).toContain('font-size: 13px;')
  })

  it('lets compact spaces move recent conversations upward while preserving scroll', () => {
    const sidebarRule =
      styles.match(/(?:^|\n)\.sidebar\s*\{([^}]*)\}/)?.[1] ?? ''
    const collectionsRule =
      styles.match(/\.sidebar-collections\s*\{([^}]*)\}/)?.[1] ?? ''
    const spacesSectionRule =
      [...styles.matchAll(/(?:^|\n)\.spaces-section\s*\{([^}]*)\}/g)]
        .map((match) => match[1])
        .find((rule) => rule.includes('flex:')) ?? ''
    const recentSectionRule =
      [...styles.matchAll(/(?:^|\n)\.recent-section\s*\{([^}]*)\}/g)]
        .map((match) => match[1])
        .find((rule) => rule.includes('flex:')) ?? ''
    const listRule =
      styles.match(
        /\.space-list,\s*\.recent-session-list\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(sidebarRule).toContain('height: 100%;')
    expect(sidebarRule).toContain('min-height: 0;')
    expect(sidebarRule).toContain('overflow: hidden;')
    expect(collectionsRule).toContain('display: flex;')
    expect(collectionsRule).toContain('flex-direction: column;')
    expect(collectionsRule).toContain('overflow: hidden;')
    expect(spacesSectionRule).toContain('flex: 0 1 auto;')
    expect(spacesSectionRule).toContain('max-height: 50%;')
    expect(recentSectionRule).toContain('flex: 1 1 0;')
    expect(listRule).toContain('min-height: 0;')
    expect(listRule).toContain('align-content: start;')
    expect(listRule).toContain('overflow-y: auto;')
  })

  it('does not stretch spaces when recent conversations are collapsed', () => {
    expect(styles).not.toMatch(
      /\.sidebar-collections\.spaces-open\.recent-closed\s+\.spaces-section/
    )
  })

  it('keeps sidebar section spacing compact without divider lines', () => {
    const navigationRule =
      styles.match(/\.sidebar > nav\s*\{([^}]*)\}/)?.[1] ?? ''
    const sectionRule =
      styles.match(
        /\.spaces-section,\s*\.recent-section\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(navigationRule).toContain('padding: 0 16px 8px;')
    expect(sectionRule).toContain('padding: 8px 16px;')
    expect(sectionRule).not.toContain('border-top:')
  })

  it('keeps the outer shell transparent around the input', () => {
    const composerRule =
      styles.match(/(?:^|\n)\.composer\s*\{([^}]*)\}/)?.[1] ?? ''
    const contextRule =
      styles.match(/(?:^|\n)\.composer-context\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(composerRule).toContain('background: transparent;')
    expect(composerRule).toContain('border: 0;')
    expect(contextRule).toContain('background: #f3f3f3;')
  })

  it('joins the input bottom corners to the context area', () => {
    const inputRule =
      styles.match(/(?:^|\n)\.composer-input\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(inputRule).toContain('border-radius: 28px 28px 0 0;')
  })

  it('uses the composer as the schedule dialog surface', () => {
    const dialogRule =
      styles.match(/\.schedule-create-dialog\s*\{([^}]*)\}/)?.[1] ?? ''
    const headerRule =
      styles.match(/\.schedule-create-dialog > header\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(dialogRule).toContain('padding: 0;')
    expect(dialogRule).toContain('background: transparent;')
    expect(dialogRule).toContain('border: 0;')
    expect(dialogRule).toContain('box-shadow: none;')
    expect(headerRule).toContain('position: absolute;')
  })

  it('fixes the schedule create action as a circular bottom-right button', () => {
    const buttonRule =
      styles.match(/\.schedule-create-fab\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(buttonRule).toContain('position: fixed;')
    expect(buttonRule).toContain('right: 28px;')
    expect(buttonRule).toContain('bottom: 28px;')
    expect(buttonRule).toContain('width: 48px;')
    expect(buttonRule).toContain('height: 48px;')
    expect(buttonRule).toContain('border-radius: 50%;')
  })

  it('positions space item menus outside the scroll clipping context', () => {
    const menuRule =
      [...styles.matchAll(/(?:^|\n)\.space-item-actions-menu\s*\{([^}]*)\}/g)]
        .map((match) => match[1])
        .find((rule) => rule.includes('position:')) ?? ''

    expect(menuRule).toContain('position: fixed;')
  })

  it('keeps primary navigation rows compact', () => {
    const navigationRule =
      styles.match(/\.sidebar > nav\s*\{([^}]*)\}/)?.[1] ?? ''
    const itemRule =
      styles.match(/(?:^|\n)\.nav-item\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(navigationRule).toContain('gap: 1px;')
    expect(itemRule).toContain('min-height: 36px;')
  })

  it('keeps compact space rows and inline requirement controls', () => {
    const itemRule =
      styles.match(/(?:^|\n)\.space-item\s*\{([^}]*)\}/)?.[1] ?? ''
    const iconRule =
      styles.match(/(?:^|\n)\.space-icon\s*\{([^}]*)\}/)?.[1] ?? ''
    const rowRule =
      styles.match(/(?:^|\n)\.space-row\s*\{([^}]*)\}/)?.[1] ?? ''
    const toggleRule =
      styles.match(/\.space-requirements-toggle\s*\{([^}]*)\}/)?.[1] ?? ''
    const listRule =
      styles.match(/(?:^|\n)\.space-list\s*\{([^}]*)\}/)?.[1] ?? ''
    const entryRule =
      styles.match(/(?:^|\n)\.space-entry\s*\{([^}]*)\}/)?.[1] ?? ''
    const requirementListRule =
      styles.match(/(?:^|\n)\.space-requirements\s*\{([^}]*)\}/)?.[1] ?? ''
    const requirementItemRule =
      styles.match(/\.space-requirements li\s*\{([^}]*)\}/)?.[1] ?? ''
    const requirementLinkRule =
      styles.match(/\.space-requirements li a\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(rowRule).toContain('display: flex;')
    expect(rowRule).toContain('min-height: 32px;')
    expect(itemRule).toContain('flex: 0 1 auto;')
    expect(itemRule).toContain('gap: 11px;')
    expect(itemRule).toContain('min-height: 32px;')
    expect(iconRule).toContain('width: 18px;')
    expect(iconRule).toContain('height: 18px;')
    expect(toggleRule).toContain('width: 22px;')
    expect(listRule).toContain('gap: 1px;')
    expect(listRule).toContain('margin-top: 2px;')
    expect(entryRule).toContain('gap: 1px;')
    expect(requirementListRule).toContain('padding: 0 0 2px 12px;')
    expect(requirementListRule).toContain('gap: 1px;')
    expect(requirementItemRule).toContain('min-height: 28px;')
    expect(requirementLinkRule).toContain('min-height: 28px;')
  })

  it('truncates long space and requirement names to one line', () => {
    const spaceNameRule =
      styles.match(/\.space-item > span:last-child\s*\{([^}]*)\}/)?.[1] ?? ''
    const requirementNameRule =
      styles.match(/\.space-requirements li span\s*\{([^}]*)\}/)?.[1] ?? ''

    for (const rule of [spaceNameRule, requirementNameRule]) {
      expect(rule).toContain('min-width: 0;')
      expect(rule).toContain('overflow: hidden;')
      expect(rule).toContain('text-overflow: ellipsis;')
      expect(rule).toContain('white-space: nowrap;')
    }

    for (const selector of [
      '.space-list',
      '.space-entry',
      '.space-row',
      '.space-item',
      '.space-requirements'
    ]) {
      const rule =
        styles.match(
          new RegExp(
            `(?:^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`
          )
        )?.[1] ?? ''
      expect(rule).toContain('min-width: 0;')
    }
  })

  it('reveals space collapse controls only on row interaction', () => {
    const groupChevronRule =
      styles.match(/(?:^|\n)\.spaces-chevron\s*\{([^}]*)\}/)?.[1] ?? ''
    const spaceToggleRule =
      styles.match(/\.space-requirements-toggle\s*\{([^}]*)\}/)?.[1] ?? ''
    const groupRevealRule =
      styles.match(
        /\.spaces-heading:hover \.spaces-chevron,\s*\.spaces-heading:focus-within \.spaces-chevron\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const spaceRevealRule =
      styles.match(
        /\.space-row:hover \.space-requirements-toggle,\s*\.space-row:focus-within \.space-requirements-toggle\s*\{([^}]*)\}/
      )?.[1] ?? ''

    for (const rule of [groupChevronRule, spaceToggleRule]) {
      expect(rule).toContain('opacity: 0;')
      expect(rule).toContain('pointer-events: none;')
    }

    for (const rule of [groupRevealRule, spaceRevealRule]) {
      expect(rule).toContain('opacity: 1;')
      expect(rule).toContain('pointer-events: auto;')
    }
  })

  it('matches recent collapse controls to the space collapse controls', () => {
    const spacesToggleRule =
      styles.match(/\.spaces-toggle\s*\{([^}]*)\}/)?.[1]?.trim() ?? ''
    const recentToggleRule =
      styles.match(/\.recent-toggle\s*\{([^}]*)\}/)?.[1]?.trim() ?? ''
    const spacesChevronRule =
      styles.match(/(?:^|\n)\.spaces-chevron\s*\{([^}]*)\}/)?.[1]?.trim() ?? ''
    const recentChevronRule =
      styles.match(/(?:^|\n)\.recent-chevron\s*\{([^}]*)\}/)?.[1]?.trim() ?? ''

    expect(recentToggleRule).toBe(spacesToggleRule)
    expect(recentChevronRule).toBe(spacesChevronRule)
    expect(styles).not.toContain('.recent-chevron:hover')
  })

  it('matches the space heading typography to primary navigation', () => {
    const toggleRule =
      styles.match(/(?:^|\n)\.spaces-toggle\s*\{([^}]*)\}/)?.[1] ?? ''
    const labelRule =
      styles.match(/\.spaces-toggle span\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(toggleRule).toContain('color: #343434;')
    expect(labelRule).toContain('font-size: 13px;')
    expect(labelRule).toContain('font-weight: 500;')
  })

  it('gives the selected requirement a visible active background', () => {
    const activeRule =
      styles.match(
        /\.space-requirements li a\.active\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(activeRule).toContain('background: #e3e3e3;')
  })

  it('adds space between the requirement background and icon', () => {
    const linkRule =
      styles.match(/\.space-requirements li a\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(linkRule).toContain('padding: 0 58px 0 8px;')
  })

  it('reveals requirement actions only when its row is active', () => {
    const triggerRule =
      styles.match(/\.requirement-actions-trigger\s*\{([^}]*)\}/)?.[1] ?? ''
    const revealRule =
      styles.match(
        /\.space-requirements li:hover \.requirement-actions-trigger,\s*\.space-requirements li:focus-within \.requirement-actions-trigger,\s*\.requirement-actions-trigger\[aria-expanded='true'\]\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(triggerRule).toContain('opacity: 0;')
    expect(triggerRule).toContain('pointer-events: none;')
    expect(revealRule).toContain('opacity: 1;')
    expect(revealRule).toContain('pointer-events: auto;')
  })

  it('reveals drag handles on hover and marks valid drop targets', () => {
    const handleRule =
      styles.match(
        /\.space-drag-handle,\s*\.requirement-drag-handle\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const revealRule =
      styles.match(
        /\.space-row:hover \.space-drag-handle,\s*\.space-row:focus-within \.space-drag-handle,\s*\.space-requirements li:hover \.requirement-drag-handle,\s*\.space-requirements li:focus-within \.requirement-drag-handle\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const dropRule =
      styles.match(
        /\.space-entry\.drag-over > \.space-row::before,\s*\.space-requirements li\.drag-over::before\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(handleRule).toContain('cursor: grab;')
    expect(handleRule).toContain('opacity: 0;')
    expect(revealRule).toContain('opacity: 1;')
    expect(dropRule).toContain('height: 2px;')
    expect(dropRule).toContain('background: #555;')
  })

  it('separates requirement creation from space management actions', () => {
    const dividerRule =
      styles.match(
        /\.space-item-actions-group \+ \.space-item-actions-group\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(dividerRule).toContain('border-top: 1px solid #e2e2e2;')
  })

  it('anchors the sidebar toggle to the left edge of the main page', () => {
    const edgeButtonRule =
      styles.match(
        /\.sidebar-edge-toggle\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const closedButtonRule =
      styles.match(
        /\.sidebar-edge-toggle\.sidebar-closed\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(edgeButtonRule).toContain('position: absolute;')
    expect(edgeButtonRule).toContain(
      'left: calc(var(--sidebar-width) + 20px);'
    )
    expect(edgeButtonRule).toContain('top: 20px;')
    expect(edgeButtonRule).toContain('z-index: 40;')
    expect(closedButtonRule).toContain('left: 88px;')
  })

  it('anchors the workbench toggle to the right edge of the main page', () => {
    const toolsRule =
      workbenchStyles.match(
        /(?:^|\n)\.global-workbench-tools\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const buttonRule =
      workbenchStyles.match(
        /\.global-workbench-tools button\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(toolsRule).toContain('position: absolute;')
    expect(toolsRule).toContain('top: 20px;')
    expect(toolsRule).toContain('right: 20px;')
    expect(toolsRule).toContain('z-index: 40;')
    expect(buttonRule).toContain('width: 34px;')
    expect(buttonRule).toContain('height: 34px;')
    expect(buttonRule).toContain('color: #353535;')
    expect(buttonRule).toContain('background: transparent;')
    expect(buttonRule).toContain('border: 0;')
  })

  it('styles the workbench as a rounded inset panel with a compact toolbar', () => {
    const panelRule =
      workbenchStyles.match(
        /(?:^|\n)\.global-workbench\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const headerRule =
      workbenchStyles.match(
        /(?:^|\n)\.global-workbench-header\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const emptyRule =
      workbenchStyles.match(
        /\.global-workbench-empty\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(panelRule).toContain('margin: 8px 8px 8px 0;')
    expect(panelRule).toContain('border: 1px solid #e1e1e1;')
    expect(panelRule).toContain('border-radius: 12px;')
    expect(panelRule).toContain('box-shadow: none;')
    expect(headerRule).toContain('height: 48px;')
    expect(emptyRule).toContain('align-content: start;')
  })

  it('places the main and right workspaces above the sidebar background', () => {
    const shellRule =
      styles.match(/(?:^|\n)\.app-shell\s*\{([^}]*)\}/)?.[1] ?? ''
    const sidebarRule =
      styles.match(/(?:^|\n)\.sidebar\s*\{([^}]*)\}/)?.[1] ?? ''
    const contentRule =
      styles.match(/(?:^|\n)\.app-content\s*\{([^}]*)\}/)?.[1] ?? ''
    const openContentRule =
      workbenchStyles.match(
        /\.global-workbench-layout\.open \.app-content\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const resizerRule =
      workbenchStyles.match(
        /(?:^|\n)\.global-workbench-resizer\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const openLayoutRule =
      workbenchStyles.match(
        /\.global-workbench-layout\.open\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const resizerIndicatorRule =
      workbenchStyles.match(
        /\.global-workbench-resizer::after\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const activeResizerRule =
      workbenchStyles.match(
        /\.global-workbench-resizer:hover::after,[^{]*body\.resizing-global-workbench \.global-workbench-resizer::after\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(shellRule).toContain('background: var(--sidebar);')
    expect(sidebarRule).not.toContain('border-right:')
    expect(contentRule).toContain('height: auto;')
    expect(contentRule).toContain('margin: 8px;')
    expect(contentRule).toContain('background: #fff;')
    expect(contentRule).toContain('border: 1px solid #dedede;')
    expect(contentRule).toContain('border-radius: 12px;')
    expect(openContentRule).toContain('margin-right: 0;')
    expect(openLayoutRule).toContain('4px')
    expect(resizerRule).toContain('width: 4px;')
    expect(resizerIndicatorRule).toContain('width: 1px;')
    expect(resizerIndicatorRule).toContain('var(--ink) 50%')
    expect(resizerIndicatorRule).toContain('opacity: 0;')
    expect(activeResizerRule).toContain('opacity: 1;')
  })

  it('enforces 220px, 320px, and 440px minimum workspace widths', () => {
    const sidebarRule =
      styles.match(/(?:^|\n)\.sidebar\s*\{([^}]*)\}/)?.[1] ?? ''
    const contentRule =
      styles.match(/(?:^|\n)\.app-content\s*\{([^}]*)\}/)?.[1] ?? ''
    const openLayoutRule =
      workbenchStyles.match(
        /\.global-workbench-layout\.open\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const panelRule =
      workbenchStyles.match(
        /(?:^|\n)\.global-workbench\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(sidebarRule).toContain('min-width: 220px;')
    expect(contentRule).toContain('min-width: 320px;')
    expect(openLayoutRule).toContain('minmax(548px, 1fr)')
    expect(openLayoutRule).toContain(
      'minmax(448px, var(--global-workbench-width))'
    )
    expect(panelRule).toContain('min-width: 440px;')
  })

  it('adapts every center workspace page at the 320px minimum width', () => {
    const contentRule =
      styles.match(/(?:^|\n)\.app-content\s*\{([^}]*)\}/)?.[1] ?? ''
    const narrowQueryStart = styles.indexOf(
      '@container main-workspace (max-width: 520px)'
    )
    const narrowStyles =
      narrowQueryStart >= 0 ? styles.slice(narrowQueryStart) : ''

    expect(contentRule).toContain('container-name: main-workspace;')
    expect(contentRule).toContain('container-type: inline-size;')
    expect(narrowStyles).toMatch(
      /\.page-heading\s*\{[^}]*flex-direction: column;/
    )
    expect(narrowStyles).toMatch(
      /\.chat-session-page\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/
    )
    expect(narrowStyles).toMatch(
      /\.composer-actions\s*\{[^}]*flex-wrap: wrap;/
    )
    expect(narrowStyles).toMatch(
      /\.template-grid\s*\{[^}]*grid-template-columns: 1fr;/
    )
    expect(narrowStyles).toMatch(
      /\.schedule-recommendation-grid\s*\{[^}]*grid-template-columns: 1fr;/
    )
    expect(narrowStyles).toMatch(
      /\.space-statistics-grid\s*\{[^}]*grid-template-columns: 1fr;/
    )
    expect(narrowStyles).toMatch(
      /\.space-resource-header\s*\{[^}]*flex-direction: column;/
    )
    expect(narrowStyles).toMatch(
      /\.requirement-overview\s*\{[^}]*grid-template-columns: 1fr;/
    )
    expect(narrowStyles).toMatch(
      /\.development-flow-track\s*\{[^}]*overflow-x: auto;/
    )
  })

  it('uses matching theme-colored fade handles for both workspace resizers', () => {
    const sidebarResizerRule =
      styles.match(/\.sidebar-resizer\s*\{([^}]*)\}/)?.[1] ?? ''
    const shellIndicatorRule =
      styles.match(/\.app-shell::before\s*\{([^}]*)\}/)?.[1] ?? ''
    const shellActiveRule =
      styles.match(
        /\.app-shell:has\(\.sidebar-resizer:hover\)::before,[\s\S]*?\.app-shell\.resizing::before\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const workbenchIndicatorRule =
      workbenchStyles.match(
        /\.global-workbench-resizer::after\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(sidebarResizerRule).toContain(
      'left: calc(var(--sidebar-width) + 5px);'
    )
    expect(sidebarResizerRule).toContain('width: 6px;')
    expect(shellIndicatorRule).toContain(
      'left: calc(var(--sidebar-width) + 8px);'
    )

    for (const rule of [shellIndicatorRule, workbenchIndicatorRule]) {
      expect(rule).toContain('width: 1px;')
      expect(rule).toContain(
        'linear-gradient(to bottom, transparent 0%, var(--ink) 50%, transparent 100%)'
      )
      expect(rule).toContain('opacity: 0;')
    }
    expect(shellActiveRule).toContain('opacity: 1;')
  })

  it('uses the sidebar color behind every workspace edge', () => {
    const rootRule =
      styles.match(/:root\s*\{([^}]*)\}/)?.[1] ?? ''
    const viewportRule =
      styles.match(/html,\s*body,\s*#root\s*\{([^}]*)\}/)?.[1] ?? ''
    const layoutRule =
      workbenchStyles.match(
        /(?:^|\n)\.global-workbench-layout\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const pageRule =
      workbenchStyles.match(
        /(?:^|\n)\.global-workbench-page\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(rootRule).toContain('background: #f1f1f1;')
    expect(viewportRule).toContain('background: var(--sidebar);')
    expect(layoutRule).toContain('background: var(--sidebar);')
    expect(pageRule).toContain('background: var(--sidebar);')
    expect(electronMainSource).toContain("backgroundColor: '#f1f1f1'")
  })

  it('hides page-edge toggles and clears macOS controls when maximized', () => {
    const maximizedPanelRule =
      workbenchStyles.match(
        /\.global-workbench-layout\.open\.maximized \.global-workbench\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const maximizedEdgeControlsRule =
      workbenchStyles.match(
        /\.global-workbench-layout\.maximized \.sidebar-edge-toggle,\s*\.global-workbench-layout\.maximized \.global-workbench-tools\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const maximizedHeaderRule =
      workbenchStyles.match(
        /\.global-workbench-layout\.maximized \.global-workbench-header\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const maximizedActionsRule =
      workbenchStyles.match(
        /\.global-workbench-layout\.maximized \.global-workbench-header-actions\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(maximizedPanelRule).toContain('position: absolute;')
    expect(maximizedPanelRule).toContain('inset: 0;')
    expect(maximizedEdgeControlsRule).toContain('display: none;')
    expect(maximizedHeaderRule).toContain('padding-left: 76px;')
    expect(maximizedActionsRule).toContain('margin-right: 0;')
  })

  it('keeps the add button fixed beside horizontally scrolling tabs', () => {
    const headerRule =
      workbenchStyles.match(
        /(?:^|\n)\.global-workbench-header\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const tabBarRule =
      workbenchStyles.match(
        /\.global-workbench-tabbar\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const tabsRule =
      workbenchStyles.match(
        /\.global-workbench-tabs\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const addRule =
      workbenchStyles.match(
        /\.global-workbench-add\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(headerRule).toContain('min-width: 0;')
    expect(tabBarRule).toContain('flex: 1 1 0;')
    expect(tabsRule).toContain('overflow-x: auto;')
    expect(tabsRule).toContain('flex: 0 1 auto;')
    expect(addRule).toContain('flex: 0 0 42px;')
  })

  it('removes main-window minimum dimensions from native overlays', () => {
    expect(nativeWorkbenchMenuStyles).toMatch(
      /html\.native-overlay-root,\s*body\.native-overlay-body,\s*body\.native-overlay-body #root\s*\{[^}]*min-width: 0;[^}]*min-height: 0;[^}]*\}/
    )
  })

  it('places the active secondary tab indicator on the bottom edge', () => {
    const activeTabRule =
      artifactWorkbenchStyles.match(
        /\.artifact-tab\.active\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(activeTabRule).toContain('box-shadow: inset 0 -2px #383838;')
  })

  it('keeps routed page content in the visible grid column', () => {
    const contentRule =
      styles.match(/\.app-content\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(contentRule).toContain('grid-column: 2;')
    expect(contentRule).toContain('min-width: 320px;')
    expect(contentRule).toContain('overflow: hidden;')
  })

  it('constrains the new chat page so its content scrolls vertically', () => {
    const pageRule =
      styles.match(/\.new-chat-page\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(pageRule).toContain('height: 100%;')
    expect(pageRule).toContain('min-height: 0;')
    expect(pageRule).toContain('overflow-y: auto;')
  })

  it('keeps requirement details as a single page under the global workbench', () => {
    const pageRule =
      styles.match(/\.requirement-detail-page\s*\{([^}]*)\}/)?.[1] ?? ''
    const contentRule =
      styles.match(/\.requirement-detail-content\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(pageRule).toContain('height: 100%;')
    expect(pageRule).not.toContain('grid-template-columns:')
    expect(contentRule).toContain('overflow: auto;')
  })

})
