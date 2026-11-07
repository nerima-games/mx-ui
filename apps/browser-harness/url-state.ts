import { COLOR_VISION_MODES, type ColorVisionMode } from '../../src/domain/accessibility'
import type {
  BackgroundMode,
  ContrastMode,
  DevicePixelRatio,
  HarnessUrlState,
  LayoutMode,
  PlaybackSpeed,
  ScenarioDefinition,
  ScreenId,
  TextScale,
} from './scenario-types'
import { PLAYBACK_SPEEDS } from './virtual-clock'

export const DEFAULT_HARNESS_STATE: HarnessUrlState = {
  screen: 'main-menu',
  scenario: 'default',
  layout: 'single',
  motion: 'full',
  cvd: 'off',
  width: 1280,
  height: 720,
  safe: 0,
  dpr: 1,
  textScale: 100,
  contrast: 'normal',
  background: 'mid',
  time: 0,
  playing: false,
  speed: 1,
  panel: true,
}

export type UrlIssue = {
  readonly field: string
  readonly message: string
}

export type ParsedHarnessUrl = {
  readonly state: HarnessUrlState
  readonly issues: ReadonlyArray<UrlIssue>
}

const KNOWN_KEYS = new Set([
  'screen',
  'scenario',
  'layout',
  'motion',
  'cvd',
  'w',
  'h',
  'safe',
  'dpr',
  'textScale',
  'contrast',
  'background',
  'time',
  'play',
  'speed',
  'panel',
  'breakProgress',
])

const readSingle = (
  params: URLSearchParams,
  field: string,
  fallback: string,
  issues: UrlIssue[],
): string | undefined => {
  const values = params.getAll(field)
  if (values.length > 1) {
    issues.push({ field, message: `${field} appears more than once; using "${fallback}".` })
    return undefined
  }
  return values[0]
}

const parseEnum = <T extends string>(
  params: URLSearchParams,
  field: string,
  fallback: T,
  choices: ReadonlyArray<T>,
  issues: UrlIssue[],
): T => {
  const raw = readSingle(params, field, fallback, issues)
  if (raw === undefined) {
    return fallback
  }
  if (choices.includes(raw as T)) {
    return raw as T
  }
  issues.push({ field, message: `Invalid ${field} value "${raw}"; using "${fallback}".` })
  return fallback
}

const parseNumber = (
  params: URLSearchParams,
  field: string,
  fallback: number,
  minimum: number,
  maximum: number,
  issues: UrlIssue[],
  integer = false,
): number => {
  const raw = readSingle(params, field, String(fallback), issues)
  if (raw === undefined) {
    return fallback
  }
  const value = Number(raw)
  const valid =
    raw.trim() !== '' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum &&
    (!integer || Number.isInteger(value))
  if (valid) {
    return value
  }
  issues.push({
    field,
    message: `Invalid ${field} value "${raw}"; using "${String(fallback)}".`,
  })
  return fallback
}

const defaultFor = (
  registry: ReadonlyArray<ScenarioDefinition>,
  screen: ScreenId,
): ScenarioDefinition | undefined =>
  registry.find((scenario) => scenario.screen === screen && scenario.isDefault)

const parseScenarioSelection = (
  params: URLSearchParams,
  registry: ReadonlyArray<ScenarioDefinition>,
  issues: UrlIssue[],
): Pick<HarnessUrlState, 'screen' | 'scenario'> => {
  const mainDefault = defaultFor(registry, 'main-menu') ?? registry.find((scenario) => scenario.isDefault)
  if (mainDefault === undefined) {
    throw new Error('browser-harness: cannot parse URL without a default scenario')
  }

  const { screen: defaultScreen } = mainDefault
  let screen = defaultScreen
  const requestedScreen = readSingle(params, 'screen', defaultScreen, issues)
  if (requestedScreen !== undefined) {
    if (defaultFor(registry, requestedScreen) !== undefined) {
      screen = requestedScreen
    } else {
      issues.push({
        field: 'screen',
        message: `Unknown screen "${requestedScreen}"; using "${defaultScreen}".`,
      })
    }
  }

  const screenDefault = defaultFor(registry, screen) ?? mainDefault
  let scenario = screenDefault.id
  const requestedScenario = readSingle(params, 'scenario', screenDefault.id, issues)
  if (requestedScenario !== undefined) {
    const match = registry.find(
      (entry) => entry.screen === screen && entry.id === requestedScenario,
    )
    if (match !== undefined) {
      scenario = match.id
    } else {
      issues.push({
        field: 'scenario',
        message: `Unknown scenario "${requestedScenario}" for "${screen}"; using "${screenDefault.id}".`,
      })
    }
  }

  return { screen, scenario }
}

export const parseHarnessUrl = (
  search: string,
  registry: ReadonlyArray<ScenarioDefinition>,
): ParsedHarnessUrl => {
  const params = new URLSearchParams(search)
  const issues: UrlIssue[] = []
  const { screen, scenario } = parseScenarioSelection(params, registry, issues)

  const layout = parseEnum<LayoutMode>(params, 'layout', 'single', ['single', 'gallery'], issues)
  const motion = parseEnum(params, 'motion', 'full', ['full', 'reduced'], issues)
  const cvdValue = parseEnum(params, 'cvd', 'none', ['none', ...COLOR_VISION_MODES], issues)
  const cvd: ColorVisionMode = cvdValue === 'none' ? 'off' : cvdValue
  const width = parseNumber(params, 'w', 1280, 1, 4096, issues, true)
  const height = parseNumber(params, 'h', 720, 1, 4096, issues, true)
  const safe = parseNumber(params, 'safe', 0, 0, 512, issues, true)
  const dpr = parseNumber(params, 'dpr', 1, 1, 3, issues, true) as DevicePixelRatio
  if (![1, 2, 3].includes(dpr)) {
    issues.push({ field: 'dpr', message: `Invalid dpr value; using "1".` })
  }
  const requestedTextScale = parseNumber(params, 'textScale', 100, 100, 200, issues, true)
  const textScale = [100, 150, 200].includes(requestedTextScale)
    ? (requestedTextScale as TextScale)
    : 100
  if (requestedTextScale !== textScale && !issues.some((issue) => issue.field === 'textScale')) {
    issues.push({
      field: 'textScale',
      message: `Unsupported textScale value "${String(requestedTextScale)}"; using "100".`,
    })
  }
  const contrast = parseEnum<ContrastMode>(params, 'contrast', 'normal', ['normal', 'more', 'forced'], issues)
  const background = parseEnum<BackgroundMode>(params, 'background', 'mid', ['white', 'black', 'mid', 'checker'], issues)
  const time = parseNumber(params, 'time', 0, 0, 86_400, issues)
  const play = parseEnum(params, 'play', '0', ['0', '1'], issues)
  const rawSpeed = readSingle(params, 'speed', '1', issues)
  const parsedSpeed = rawSpeed === undefined ? 1 : Number(rawSpeed)
  const speed = PLAYBACK_SPEEDS.includes(parsedSpeed as PlaybackSpeed)
    ? (parsedSpeed as PlaybackSpeed)
    : 1
  if (rawSpeed !== undefined && speed !== parsedSpeed) {
    issues.push({ field: 'speed', message: `Invalid speed value "${rawSpeed}"; using "1".` })
  }
  const panel = parseEnum(params, 'panel', '1', ['0', '1'], issues)

  let breakProgress: number | undefined = undefined
  if (params.has('breakProgress')) {
    const value = parseNumber(params, 'breakProgress', 0, 0, 1, issues)
    if (!issues.some((issue) => issue.field === 'breakProgress')) {
      breakProgress = value
    }
  }

  const unknownKeys = [...new Set([...params.keys()].filter((key) => !KNOWN_KEYS.has(key)))].sort()
  if (unknownKeys.length > 0) {
    issues.push({
      field: 'query',
      message: `Unknown query parameter${unknownKeys.length === 1 ? '' : 's'} ${unknownKeys.join(', ')} ignored.`,
    })
  }

  const state: HarnessUrlState = {
    screen,
    scenario,
    layout,
    motion,
    cvd,
    width,
    height,
    safe,
    dpr,
    textScale,
    contrast,
    background,
    time,
    playing: play === '1',
    speed,
    panel: panel === '1',
    ...(breakProgress === undefined ? {} : { breakProgress }),
  }

  return { state, issues }
}

export const serializeHarnessState = (state: HarnessUrlState): string => {
  const params = new URLSearchParams()
  params.set('screen', state.screen)
  params.set('scenario', state.scenario)
  params.set('layout', state.layout)
  params.set('motion', state.motion)
  params.set('cvd', state.cvd === 'off' ? 'none' : state.cvd)
  params.set('w', String(state.width))
  params.set('h', String(state.height))
  params.set('safe', String(state.safe))
  params.set('dpr', String(state.dpr))
  params.set('textScale', String(state.textScale))
  params.set('contrast', state.contrast)
  params.set('background', state.background)
  params.set('time', String(state.time))
  params.set('play', state.playing ? '1' : '0')
  params.set('speed', String(state.speed))
  params.set('panel', state.panel ? '1' : '0')
  if (state.breakProgress !== undefined) {
    params.set('breakProgress', String(state.breakProgress))
  }
  return `?${params.toString()}`
}
