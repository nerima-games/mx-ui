import { INVENTORY_SCENARIOS } from './mc-sim-scenarios'
import { OVERLAY_SCENARIOS } from './scenarios/overlay'
import { SESSION_SCENARIOS } from './scenarios/session'
import { STATION_SCENARIOS } from './scenarios/stations'
import { DEFAULT_SCREEN_SCENARIOS } from './screens'
import { END_HUD_INSPECTOR_SCENARIOS } from './end-hud-inspector'
import type { ScenarioDefinition, ScreenId, ScenarioId } from './scenario-types'

export const SCENARIO_REGISTRY: ReadonlyArray<ScenarioDefinition> = [
  ...DEFAULT_SCREEN_SCENARIOS,
  ...OVERLAY_SCENARIOS,
  ...SESSION_SCENARIOS,
  ...INVENTORY_SCENARIOS,
  ...STATION_SCENARIOS,
  ...END_HUD_INSPECTOR_SCENARIOS,
]

const scenariosByScreen = new Map<ScreenId, ReadonlyArray<ScenarioDefinition>>()
const defaultByScreen = new Map<ScreenId, ScenarioDefinition>()

for (const scenario of SCENARIO_REGISTRY) {
  const existing = scenariosByScreen.get(scenario.screen) ?? []
  if (existing.some((item) => item.id === scenario.id)) {
    throw new Error(`browser-harness: duplicate scenario id "${scenario.screen}/${scenario.id}"`)
  }
  scenariosByScreen.set(scenario.screen, [...existing, scenario])
  if (scenario.isDefault) {
    if (defaultByScreen.has(scenario.screen)) {
      throw new Error(`browser-harness: multiple default scenarios for screen "${scenario.screen}"`)
    }
    defaultByScreen.set(scenario.screen, scenario)
  }
}

for (const screen of scenariosByScreen.keys()) {
  if (!defaultByScreen.has(screen)) {
    throw new Error(`browser-harness: screen "${screen}" has no default scenario`)
  }
}

export const DEFAULT_SCREEN_IDS: ReadonlyArray<ScreenId> = [...defaultByScreen.keys()]

export const scenariosForScreen = (screen: ScreenId): ReadonlyArray<ScenarioDefinition> =>
  scenariosByScreen.get(screen) ?? []

export const defaultScenarioForScreen = (screen: ScreenId): ScenarioDefinition | undefined =>
  defaultByScreen.get(screen)

export const findScenario = (screen: ScreenId, id: ScenarioId): ScenarioDefinition | undefined =>
  scenariosForScreen(screen).find((scenario) => scenario.id === id)

export const defaultScenario: ScenarioDefinition | undefined =
  defaultScenarioForScreen('main-menu') ?? SCENARIO_REGISTRY.find((scenario) => scenario.isDefault)

if (defaultScenario === undefined) {
  throw new Error('browser-harness: scenario registry must contain at least one default scenario')
}
