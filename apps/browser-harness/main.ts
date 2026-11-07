import { Effect } from 'effect'
import { colorVisionMatrixValues } from '../../src/domain/accessibility'
import type { DomElementFactory } from '../../src/application/dom-surface'
import {
  collectDiagnostics,
  createIntentLog,
  intentLogDiagnosticValue,
  type DiagnosticValue,
} from './diagnostics-core'
import { createDebugPanel } from './debug-panel'
import {
  DEFAULT_SCREEN_IDS,
  SCENARIO_REGISTRY,
  defaultScenarioForScreen,
  findScenario,
  scenariosForScreen,
} from './scenario-registry'
import type {
  HarnessEnvironment,
  HarnessUrlState,
  ScenarioContext,
  ScenarioDefinition,
  ScenarioMount,
} from './scenario-types'
import { parseHarnessStateJson, serializeHarnessStateJson } from './json-state'
import { parseHarnessUrl, serializeHarnessState, type UrlIssue } from './url-state'
import { createVirtualClock, type VirtualClockState } from './virtual-clock'

const READY_ATTRIBUTE = 'data-harness-ready'
const IDENTITY_MATRIX = '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0'

const environmentFrom = (state: HarnessUrlState): HarnessEnvironment => ({
  motion: state.motion,
  cvd: state.cvd,
  width: state.width,
  height: state.height,
  safe: state.safe,
  dpr: state.dpr,
  textScale: state.textScale,
  contrast: state.contrast,
  background: state.background,
})

type MountedScenario = {
  readonly definition: ScenarioDefinition
  readonly mount: ScenarioMount
}

const makeHost = (screen: string, scenario: ScenarioDefinition): HTMLDivElement => {
  const host = document.createElement('div')
  host.setAttribute('data-harness-host', screen)
  host.setAttribute('data-harness-scenario', scenario.id)
  return host
}

const addSvgFilter = (): SVGFEColorMatrixElement => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.style.position = 'absolute'

  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter')
  filter.id = 'harness-color-vision-filter'
  const matrix = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix')
  matrix.setAttribute('type', 'matrix')
  matrix.setAttribute('values', IDENTITY_MATRIX)
  filter.append(matrix)
  svg.append(filter)
  document.body.append(svg)
  return matrix
}

const start = (): void => {
  const factory: DomElementFactory = document
  const { hash, pathname, search } = window.location
  const { state: initialState, issues: initialIssues } = parseHarnessUrl(search, SCENARIO_REGISTRY)
  let state = initialState
  let issues: ReadonlyArray<UrlIssue> = initialIssues
  const mounts: MountedScenario[] = []
  const intentLog = createIntentLog(200)
  const runSync: ScenarioContext['runSync'] = (effect) => Effect.runSync(effect)

  const page = document.createElement('div')
  page.setAttribute('data-harness-page', '')
  const panelRef: { current: ReturnType<typeof createDebugPanel> | undefined } = { current: undefined }
  const emitIntent = (intent: unknown): void => {
    intentLog.add(intent)
    if (state.panel) {
      panelRef.current?.setIntentLog(intentLogDiagnosticValue(intentLog))
    }
  }
  const stage = document.createElement('main')
  stage.setAttribute('data-harness-stage', '')
  page.append(stage)
  document.body.append(page)

  const matrix = addSvgFilter()
  const updateUrl = (): void => {
    const query = serializeHarnessState(state)
    window.history.replaceState(null, '', `${pathname}${query}${hash}`)
  }

  const applyEnvironment = (): void => {
    const environment = environmentFrom(state)
    page.dataset['panelHidden'] = String(!state.panel)
    page.style.setProperty('--harness-safe-inset', `${state.safe}px`)
    page.style.setProperty('--harness-text-scale', String(state.textScale / 100))
    page.style.setProperty('--harness-viewport-width', `${state.width}px`)
    page.style.setProperty('--harness-viewport-height', `${state.height}px`)
    stage.dataset['motion'] = environment.motion
    stage.dataset['layout'] = state.layout
    stage.dataset['cvd'] = environment.cvd
    stage.dataset['dpr'] = String(environment.dpr)
    stage.dataset['contrast'] = environment.contrast
    stage.dataset['background'] = environment.background
    stage.dataset['textScale'] = String(environment.textScale)
    stage.dataset['width'] = String(environment.width)
    stage.dataset['height'] = String(environment.height)
    matrix.setAttribute('values', colorVisionMatrixValues(environment.cvd) ?? IDENTITY_MATRIX)

    const filters = [
      environment.cvd === 'off' ? '' : 'url(#harness-color-vision-filter)',
      environment.contrast === 'more' ? 'contrast(1.25)' : '',
      environment.contrast === 'forced' ? 'grayscale(1) contrast(1.8)' : '',
    ].filter((filter) => filter !== '')
    stage.style.filter = filters.join(' ')
  }

  const updatePanel = (): void => {
    const panel = panelRef.current
    if (panel === undefined) {
      return
    }
    const active = scenariosForScreen(state.screen)
    panel.update(
      state,
      issues,
      DEFAULT_SCREEN_IDS.map((screen) => defaultScenarioForScreen(screen)).filter(
        (scenario): scenario is ScenarioDefinition => scenario !== undefined,
      ),
      active,
      `Registered ${SCENARIO_REGISTRY.length} scenarios; mounted ${mounts.length} instance(s).`,
      serializeHarnessStateJson(state),
    )
  }

  let diagnosticsFrame: number | null = null
  const scheduleDiagnostics = (): void => {
    if (diagnosticsFrame !== null) {
      return
    }
    diagnosticsFrame = window.requestAnimationFrame(() => {
      diagnosticsFrame = null
      const panel = panelRef.current
      if (panel === undefined) {
        return
      }
      const scenario = findScenario(state.screen, state.scenario)
      const selectedMount = mounts.find(
        ({ definition }) => definition.screen === state.screen && definition.id === state.scenario,
      )?.mount
      const host = Array.from(stage.querySelectorAll<HTMLElement>('[data-harness-host]')).find(
        (candidate) =>
          candidate.dataset['harnessHost'] === state.screen &&
          candidate.dataset['harnessScenario'] === state.scenario,
      )
      const root = host?.querySelector<HTMLElement>(':scope > [data-mx-ui]') ?? null
      const inputJson: DiagnosticValue<unknown> =
        scenario === undefined
          ? { status: 'unsupported', reason: 'The selected scenario is not registered.' }
          : {
              status: 'available',
              value: {
                scenario: { id: scenario.id, screen: scenario.screen, surface: scenario.surface, title: scenario.title },
                context: {
                  environment: environmentFrom(state),
                  time: state.time,
                  ...(state.breakProgress === undefined ? {} : { breakProgress: state.breakProgress }),
                },
              },
            }
      const intents = intentLogDiagnosticValue(intentLog)
      const viewModelJson: DiagnosticValue<unknown> =
        scenario === undefined
          ? { status: 'unsupported', reason: 'The selected scenario is not registered.' }
          : selectedMount === undefined
            ? { status: 'unsupported', reason: 'The selected scenario is not mounted.' }
            : selectedMount.viewModel === undefined
              ? { status: 'unsupported', reason: 'The selected scenario does not expose a view model.' }
              : { status: 'available', value: selectedMount.viewModel() }
      panel.setDiagnostics(collectDiagnostics(root, inputJson, intents, viewModelJson))
    })
  }

  const syncMountTime = (time: number): void => {
    for (const { mount } of mounts) {
      mount.setTime(time)
    }
  }

  const mountScenario = (
    scenario: ScenarioDefinition,
    parent: HTMLElement,
    hidden: boolean,
    scale = 1,
  ): void => {
    const host = makeHost(scenario.screen, scenario)
    // Keep inactive screens measurable for the browser geometry checks without painting them.
    host.style.visibility = hidden ? 'hidden' : 'visible'
    host.style.width = `${state.width}px`
    host.style.height = `${state.height}px`
    host.style.setProperty('--harness-safe-inset', `${state.safe}px`)
    host.style.setProperty('--harness-text-scale', String(state.textScale / 100))
    if (scale !== 1) {
      host.style.transform = `scale(${String(scale)})`
      host.style.transformOrigin = 'top left'
    }
    parent.append(host)
    const context = {
      factory,
      host,
      environment: environmentFrom(state),
      time: state.time,
      emitIntent,
      runSync,
      ...(state.breakProgress === undefined ? {} : { breakProgress: state.breakProgress }),
    }
    try {
      mounts.push({ definition: scenario, mount: scenario.mount(context) })
    } catch (error) {
      host.remove()
      throw error
    }
  }

  const renderSingle = (): void => {
    const viewport = document.createElement('div')
    viewport.setAttribute('data-harness-viewport', '')
    viewport.style.width = `${state.width}px`
    viewport.style.height = `${state.height}px`
    for (const screen of DEFAULT_SCREEN_IDS) {
      const selected = screen === state.screen
      const scenario = selected
        ? findScenario(screen, state.scenario)
        : defaultScenarioForScreen(screen)
      if (scenario === undefined) {
        throw new Error(`browser-harness: missing scenario "${screen}/${state.scenario}"`)
      }
      mountScenario(scenario, viewport, !selected)
    }
    stage.append(viewport)
  }

  const renderGallery = (): void => {
    const gallery = document.createElement('div')
    gallery.setAttribute('data-harness-gallery', '')
    const width = Math.min(320, state.width)
    const height = Math.min(180, state.height)
    const scale = Math.min(width / state.width, height / state.height)
    for (const scenario of scenariosForScreen(state.screen)) {
      const card = document.createElement('section')
      card.setAttribute('data-scenario-card', scenario.id)
      const title = document.createElement('h2')
      title.textContent = `${scenario.surface}: ${scenario.title}`
      card.append(title)
      const viewport = document.createElement('div')
      viewport.setAttribute('data-harness-viewport', '')
      viewport.style.width = `${width}px`
      viewport.style.height = `${height}px`
      card.append(viewport)
      mountScenario(scenario, viewport, false, scale)
      gallery.append(card)
    }
    stage.append(gallery)
  }

  const renderStage = (): void => {
    for (const { mount } of mounts.splice(0)) {
      mount.dispose()
    }
    stage.replaceChildren()
    applyEnvironment()
    if (state.layout === 'gallery') {
      renderGallery()
    } else {
      renderSingle()
    }
    syncMountTime(state.time)
    updatePanel()
    scheduleDiagnostics()
    document.documentElement.setAttribute(READY_ATTRIBUTE, String(mounts.length))
  }

  const replaceState = (nextState: HarnessUrlState): void => {
    if (nextState.screen !== state.screen || nextState.scenario !== state.scenario) {
      intentLog.reset()
    }
    state = nextState
    issues = []
    panelRef.current?.setStateJsonError('')
    applyEnvironment()
    updateUrl()
    renderStage()
  }

  const commit = (patch: Partial<HarnessUrlState>): void => {
    replaceState({ ...state, ...patch })
  }

  const clock = createVirtualClock(
    { time: state.time, playing: state.playing, speed: state.speed },
    (clockState: VirtualClockState) => {
      state = { ...state, ...clockState }
      syncMountTime(clockState.time)
      updateUrl()
      updatePanel()
    },
  )

  const panel = createDebugPanel({
    emitIntent,
    runSync,
    onScreen: (screen) => {
      const scenario = defaultScenarioForScreen(screen)
      if (scenario === undefined) {
        throw new Error(`browser-harness: no default scenario for screen "${screen}"`)
      }
      clock.reset()
      commit({ screen, scenario: scenario.id })
    },
    onScenario: (scenario) => {
      clock.reset()
      commit({ scenario })
    },
    onLayout: (layout) => commit({ layout }),
    onEnvironment: (patch) => commit(patch),
    onTime: (seconds) => {
      clock.pause()
      clock.setTime(seconds)
    },
    onPause: () => clock.pause(),
    onStep: () => clock.step(),
    onPlay: () => clock.play(),
    onSpeed: (speed) => clock.setSpeed(speed),
    onReset: () => {
      issues = []
      panelRef.current?.setStateJsonError('')
      clock.reset()
      renderStage()
    },
    onCopyUrl: async () => {
      const activePanel = panelRef.current
      if (activePanel === undefined) {
        return
      }
      try {
        await navigator.clipboard.writeText(window.location.href)
        activePanel.setCopyMessage('URL copied.')
      } catch {
        activePanel.setCopyMessage('Copy failed: clipboard access is unavailable.')
      }
    },
    onCopyJson: async () => {
      const activePanel = panelRef.current
      if (activePanel === undefined) {
        return
      }
      const json = serializeHarnessStateJson(state)
      activePanel.setStateJson(json)
      try {
        if (navigator.clipboard === undefined) {
          throw new Error('Clipboard access is unavailable.')
        }
        await navigator.clipboard.writeText(json)
        activePanel.setCopyMessage('JSON copied.')
      } catch {
        activePanel.selectStateJson()
        activePanel.setCopyMessage('Clipboard unavailable. The JSON is selected for manual copying.')
      }
    },
    onImportJson: (input) => {
      const activePanel = panelRef.current
      if (activePanel === undefined) {
        return
      }
      const result = parseHarnessStateJson(input, SCENARIO_REGISTRY)
      if (!result.ok) {
        activePanel.setStateJsonError(result.error.message)
        return
      }
      clock.pause()
      clock.setSpeed(result.state.speed)
      clock.setTime(result.state.time)
      if (result.state.playing) {
        clock.play()
      }
      replaceState(result.state)
      activePanel.setCopyMessage('JSON imported.')
    },
  })
  panelRef.current = panel
  page.append(panel.element)

  applyEnvironment()
  renderStage()
}

start()
