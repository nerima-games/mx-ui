import { describe, expect, it } from 'vitest'
import { SCENARIO_REGISTRY } from '../apps/browser-harness/scenario-registry'
import { UI_SURFACE_LEDGER_ENTRIES, scenarioReference } from './helpers/ui-surface-ledger'
import { fakeDocument, fakeElement, type FakeElement } from './fake-dom'

type AccessibilityIssue = {
  readonly code: 'missing-role' | 'missing-name' | 'invalid-state'
  readonly element: string
}

const nativeRole = (element: FakeElement): string | undefined => {
  const explicit = element.attributes.get('role')
  if (explicit !== undefined) {
    return explicit
  }
  if (element.tagName === 'button') {
    return 'button'
  }
  if (element.tagName === 'input') {
    return element.attributes.get('type') === 'range' ? 'slider' : 'textbox'
  }
  if (element.tagName === 'select') {
    return 'combobox'
  }
  if (element.tagName === 'textarea') {
    return 'textbox'
  }
  return undefined
}

const auditAccessibilityTree = (root: FakeElement): ReadonlyArray<AccessibilityIssue> => {
  const issues: AccessibilityIssue[] = []
  const allowedBooleanStates = [
    'aria-checked',
    'aria-disabled',
    'aria-expanded',
    'aria-hidden',
    'aria-modal',
    'aria-pressed',
    'aria-selected',
  ] as const

  const controls = [...root.walk()].filter((element) =>
    element.tagName === 'button' ||
    element.tagName === 'input' ||
    element.tagName === 'select' ||
    element.tagName === 'textarea' ||
    element.attributes.has('role') ||
    (element.attributes.has('tabindex') && element.attributes.get('tabindex') !== '-1'),
  )

  for (const element of controls) {
    const role = nativeRole(element)
    const identity = element.attributes.get('data-mx-ui') ?? element.tagName
    if (role === undefined) {
      issues.push({ code: 'missing-role', element: identity })
    }
    const label = element.attributes.get('aria-label')?.trim() ?? element.textContent.trim()
    if (label === '') {
      issues.push({ code: 'missing-name', element: identity })
    }
    for (const state of allowedBooleanStates) {
      const value = element.attributes.get(state)
      if (value !== undefined && value !== 'true' && value !== 'false' && !(state === 'aria-pressed' && value === 'mixed')) {
        issues.push({ code: 'invalid-state', element: `${identity} ${state}` })
      }
    }
  }

  return issues
}

const surfaceEntries = UI_SURFACE_LEDGER_ENTRIES.filter(
  ({ classification }) => classification === 'visual' || classification === 'composite',
)
const registeredScenarioIds = new Set(
  SCENARIO_REGISTRY.map(({ screen, id }) => scenarioReference(screen, id)),
)

describe('accessibility scenario coverage', () => {
  // Catches a surface or scenario being added to the ledger without an openable browser fixture.
  it('resolves each applicable ledger scenario through the live registry', () => {
    const missing = surfaceEntries.flatMap(({ surfaceId, scenarioIds }) =>
      scenarioIds
        .filter((scenarioId) => !registeredScenarioIds.has(scenarioId))
        .map((scenarioId) => `${surfaceId}: ${scenarioId}`),
    )

    expect(surfaceEntries.length).toBeGreaterThan(0)
    expect(missing).toStrictEqual([])
    expect(surfaceEntries.every(({ scenarioIds }) => scenarioIds.length > 0)).toBe(true)
  })

  // Catches the unlabeled keyboard control that a screen-reader user cannot identify.
  it('rejects a button with no accessible name in a synthetic tree', () => {
    const document = fakeDocument()
    const root = fakeElement(document.createElement('main'))
    const unnamedButton = fakeElement(document.createElement('button'))
    unnamedButton.setAttribute('data-mx-ui', 'synthetic-unnamed-button')
    root.appendChild(unnamedButton)

    expect(auditAccessibilityTree(root)).toContainEqual({
      code: 'missing-name',
      element: 'synthetic-unnamed-button',
    })
  })
})
