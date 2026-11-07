import { describe, expect, it } from 'vitest'
import * as mxUi from '../src/index.js'
import { SCENARIO_REGISTRY } from '../apps/browser-harness/scenario-registry'
import {
  scenarioReference,
  UI_SURFACE_LEDGER_ENTRIES,
  UI_SURFACE_SCENARIO_EXCLUSIONS,
  validateUiSurfaceLedger,
} from './helpers/ui-surface-ledger'

const registryScenarioIds = SCENARIO_REGISTRY.map(({ screen, id }) =>
  scenarioReference(screen, id),
)

describe('UI surface ledger', () => {
  it('classifies every public runtime export and accounts for each registry scenario', () => {
    // Catches a view factory or scenario being added without a ledger row or an explicit exclusion.
    expect(
      validateUiSurfaceLedger({
        barrelExportNames: Object.keys(mxUi),
        entries: UI_SURFACE_LEDGER_ENTRIES,
        registryScenarioIds,
        scenarioExclusions: UI_SURFACE_SCENARIO_EXCLUSIONS,
      }),
    ).toEqual([])
  })

  it('rejects an unclassified barrel export', () => {
    // Catches a newly exported factory that has no ledger classification.
    const issues = validateUiSurfaceLedger({
      barrelExportNames: ['knownHelper', 'createNewHudView'],
      entries: [
        {
          surfaceId: 'knownHelper',
          classification: 'nonvisual',
          scenarioIds: [],
          hasTimeInput: false,
          exclusionReason: 'A helper export, not a public view surface.',
        },
      ],
      registryScenarioIds: [],
      scenarioExclusions: [],
    })

    expect(issues).toContainEqual({
      code: 'unclassified-barrel-export',
      subject: 'createNewHudView',
    })
  })

  it.each(['visual', 'composite'] as const)('rejects a %s surface with no scenario', (classification) => {
    // Catches either presentation classification being allowed without registered scenario coverage.
    const issues = validateUiSurfaceLedger({
      barrelExportNames: ['createUncoveredView'],
      entries: [
        {
          surfaceId: 'createUncoveredView',
          classification,
          scenarioIds: [],
          hasTimeInput: false,
        },
      ],
      registryScenarioIds: [],
      scenarioExclusions: [],
    })

    expect(issues).toContainEqual({
      code: 'surface-without-scenario',
      subject: 'createUncoveredView',
    })
  })

  it('rejects an out-of-scope row with an empty reason', () => {
    // Catches an export being classified out of scope without explaining why.
    const issues = validateUiSurfaceLedger({
      barrelExportNames: ['projectHelper'],
      entries: [
        {
          surfaceId: 'projectHelper',
          classification: 'nonvisual',
          scenarioIds: [],
          hasTimeInput: false,
          exclusionReason: '   ',
        },
      ],
      registryScenarioIds: [],
      scenarioExclusions: [],
    })

    expect(issues).toContainEqual({
      code: 'empty-exclusion-reason',
      subject: 'projectHelper',
    })
  })

  it('rejects a scenario reference absent from the registry', () => {
    // Catches a hand-entered scenario ID that does not exist in the live registry.
    const issues = validateUiSurfaceLedger({
      barrelExportNames: ['createHudView'],
      entries: [
        {
          surfaceId: 'createHudView',
          classification: 'visual',
          scenarioIds: ['hud/not-registered'],
          hasTimeInput: false,
        },
      ],
      registryScenarioIds: ['hud/default'],
      scenarioExclusions: [],
    })

    expect(issues).toContainEqual({
      code: 'unknown-scenario',
      subject: 'hud/not-registered',
    })
  })

  it('rejects a registry scenario without a surface or exclusion row', () => {
    // Catches a new harness scenario that has not been assigned to a public surface or excluded.
    const issues = validateUiSurfaceLedger({
      barrelExportNames: ['createHudView'],
      entries: [
        {
          surfaceId: 'createHudView',
          classification: 'visual',
          scenarioIds: ['hud/default'],
          hasTimeInput: false,
        },
      ],
      registryScenarioIds: ['hud/default', 'hud/new-scenario'],
      scenarioExclusions: [],
    })

    expect(issues).toContainEqual({
      code: 'unclassified-registry-scenario',
      subject: 'hud/new-scenario',
    })
  })
})

