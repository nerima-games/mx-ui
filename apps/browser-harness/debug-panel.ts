import './diagnostics-layout'
import { COLOR_VISION_MODES } from '../../src/domain/accessibility'
import { installComparison } from './comparison'
import type { DiagnosticsSnapshot, DiagnosticValue, IntentRecord } from './diagnostics-core'
import type {
  BackgroundMode,
  ContrastMode,
  HarnessEnvironment,
  HarnessUrlState,
  LayoutMode,
  PlaybackSpeed,
  ScenarioDefinition,
} from './scenario-types'
import { MAX_HARNESS_STATE_JSON_BYTES } from './json-state'
import { PLAYBACK_SPEEDS } from './virtual-clock'
import type { UrlIssue } from './url-state'

export type DebugPanelActions = {
  readonly emitIntent: (intent: unknown) => void
  readonly onScreen: (screen: string) => void
  readonly onScenario: (scenario: string) => void
  readonly onLayout: (layout: LayoutMode) => void
  readonly onEnvironment: (patch: Partial<HarnessEnvironment>) => void
  readonly onTime: (seconds: number) => void
  readonly onPause: () => void
  readonly onStep: () => void
  readonly onPlay: () => void
  readonly onSpeed: (speed: PlaybackSpeed) => void
  readonly onReset: () => void
  readonly onCopyUrl: () => void
  readonly onCopyJson: () => void | Promise<void>
  readonly onImportJson: (input: string) => void
}

export type DebugPanel = {
  readonly element: HTMLElement
  readonly update: (
    state: HarnessUrlState,
    issues: ReadonlyArray<UrlIssue>,
    screens: ReadonlyArray<ScenarioDefinition>,
    scenarios: ReadonlyArray<ScenarioDefinition>,
    diagnostics: string,
    stateJson: string,
  ) => void
  readonly setCopyMessage: (message: string) => void
  readonly setStateJson: (value: string) => void
  readonly selectStateJson: () => void
  readonly setStateJsonError: (message: string) => void
  readonly setIntentLog: (value: DiagnosticValue<ReadonlyArray<IntentRecord>>) => void
  readonly setDiagnostics: (snapshot: DiagnosticsSnapshot) => void
}

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag)
  if (text !== undefined) {
    element.textContent = text
  }
  return element
}

const addSelect = <T extends string>(
  parent: HTMLElement,
  labelText: string,
  options: ReadonlyArray<T>,
  onChange: (value: T) => void,
): HTMLSelectElement => {
  const label = make('label')
  label.append(make('span', labelText))
  const select = make('select')
  select.setAttribute('aria-label', labelText)
  for (const value of options) {
    const option = make('option', value)
    option.value = value
    select.append(option)
  }
  select.addEventListener('change', () => {
    const selected = select.selectedOptions.item(0)
    if (selected !== null) {
      onChange(selected.value as T)
    }
  })
  label.append(select)
  parent.append(label)
  return select
}

const addNumber = (
  parent: HTMLElement,
  labelText: string,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
): HTMLInputElement => {
  const label = make('label')
  label.append(make('span', labelText))
  const input = make('input')
  input.type = 'number'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.setAttribute('aria-label', labelText)
  input.addEventListener('change', () => {
    const value = Number(input.value)
    if (Number.isFinite(value) && value >= min && value <= max) {
      onChange(value)
    }
  })
  label.append(input)
  parent.append(label)
  return input
}

const addSection = (parent: HTMLElement, title: string): HTMLElement => {
  const section = make('section')
  section.append(make('h2', title))
  parent.append(section)
  return section
}

const diagnosticText = <T>(value: DiagnosticValue<T>): string =>
  value.status === 'unsupported'
    ? `未対応: ${value.reason}`
    : JSON.stringify(value.value, null, 2) ?? 'undefined'

const intentText = (value: DiagnosticValue<ReadonlyArray<IntentRecord>>): string =>
  value.status === 'available' && value.value.length === 0 ? 'no intents emitted' : diagnosticText(value)

export const createDebugPanel = (actions: DebugPanelActions): DebugPanel => {
  const element = make('aside')
  element.setAttribute('data-debug-panel', '')
  element.setAttribute('aria-label', 'Debug controls')
  element.append(make('h1', 'mx-ui browser harness'))

  const alert = make('p')
  alert.setAttribute('role', 'alert')
  alert.hidden = true
  element.append(alert)
  let currentIssues: ReadonlyArray<UrlIssue> = []
  let stateJsonError = ''
  const updateAlert = (): void => {
    const message = [...currentIssues.map((issue) => issue.message), stateJsonError]
      .filter((part) => part !== '')
      .join(' ')
    alert.textContent = message
    alert.hidden = message === ''
  }

  const scenarioSection = addSection(element, 'Scenario')
  const screenSelect = addSelect(scenarioSection, 'Screen', [], actions.onScreen)
  const scenarioButtons = make('div')
  scenarioButtons.setAttribute('data-scenario-buttons', '')
  scenarioButtons.setAttribute('role', 'group')
  scenarioButtons.setAttribute('aria-label', 'Scenarios')
  scenarioSection.append(scenarioButtons)
  const galleryButton = make('button', 'Gallery')
  galleryButton.type = 'button'
  galleryButton.setAttribute('data-testid', 'gallery-toggle')
  galleryButton.addEventListener('click', () =>
    actions.onLayout(galleryButton.getAttribute('aria-pressed') === 'true' ? 'single' : 'gallery'),
  )
  scenarioSection.append(galleryButton)

  const environmentSection = addSection(element, 'Environment')
  const motionSelect = addSelect(environmentSection, 'Motion', ['full', 'reduced'], (motion) =>
    actions.onEnvironment({ motion }),
  )
  const cvdSelect = addSelect(environmentSection, 'Harness color vision', COLOR_VISION_MODES, (cvd) =>
    actions.onEnvironment({ cvd }),
  )
  const widthInput = addNumber(environmentSection, 'Viewport width', 1, 4096, 1, (width) =>
    actions.onEnvironment({ width }),
  )
  const heightInput = addNumber(environmentSection, 'Viewport height', 1, 4096, 1, (height) =>
    actions.onEnvironment({ height }),
  )
  const safeInput = addNumber(environmentSection, 'Safe area', 0, 512, 1, (safe) =>
    actions.onEnvironment({ safe }),
  )
  const dprSelect = addSelect(environmentSection, 'DPR', ['1', '2', '3'], (value) =>
    actions.onEnvironment({ dpr: Number(value) as HarnessEnvironment['dpr'] }),
  )
  const textScaleSelect = addSelect(environmentSection, 'Text scale', ['100', '150', '200'], (value) =>
    actions.onEnvironment({ textScale: Number(value) as HarnessEnvironment['textScale'] }),
  )
  const contrastSelect = addSelect<ContrastMode>(
    environmentSection,
    'Contrast',
    ['normal', 'more', 'forced'],
    (contrast) => actions.onEnvironment({ contrast }),
  )
  const backgroundSelect = addSelect<BackgroundMode>(
    environmentSection,
    'Background',
    ['white', 'black', 'mid', 'checker'],
    (background) => actions.onEnvironment({ background }),
  )

  const timelineSection = addSection(element, 'Timeline')
  const timeInput = make('input')
  timeInput.type = 'range'
  timeInput.min = '0'
  timeInput.max = '86400'
  timeInput.step = '0.016667'
  timeInput.setAttribute('data-testid', 'time-slider')
  timeInput.setAttribute('aria-label', 'Virtual time')
  timeInput.addEventListener('input', () => actions.onTime(Number(timeInput.value)))
  timelineSection.append(timeInput)
  const timeOutput = make('output')
  timeOutput.setAttribute('data-testid', 'time-readout')
  timeOutput.setAttribute('aria-live', 'polite')
  timelineSection.append(timeOutput)

  const controls = make('div')
  controls.setAttribute('data-timeline-controls', '')
  const pauseButton = make('button', 'Pause')
  pauseButton.type = 'button'
  pauseButton.addEventListener('click', actions.onPause)
  const stepButton = make('button', 'Step frame')
  stepButton.type = 'button'
  stepButton.addEventListener('click', actions.onStep)
  const playButton = make('button', 'Play')
  playButton.type = 'button'
  playButton.addEventListener('click', actions.onPlay)
  controls.append(pauseButton, stepButton, playButton)
  timelineSection.append(controls)
  const speedSelect = addSelect(
    timelineSection,
    'Speed',
    PLAYBACK_SPEEDS.map(String),
    (value) => {
      const speed = PLAYBACK_SPEEDS.find((item) => String(item) === value)
      if (speed !== undefined) {
        actions.onSpeed(speed)
      }
    },
  )

  const stateSection = addSection(element, 'State JSON')
  const stateOutput = make('textarea')
  stateOutput.setAttribute('data-testid', 'state-json')
  stateOutput.setAttribute('aria-label', 'Canonical state JSON')
  stateOutput.spellcheck = false
  stateOutput.rows = 14
  stateOutput.style.width = '100%'
  stateOutput.style.maxHeight = '12rem'
  stateOutput.style.boxSizing = 'border-box'
  stateOutput.style.font = 'inherit'
  const stateJsonHelp = make('p', `Maximum import size: ${MAX_HARNESS_STATE_JSON_BYTES / 1024} KiB.`)
  stateJsonHelp.id = 'state-json-help'
  stateOutput.setAttribute('aria-describedby', stateJsonHelp.id)
  stateSection.append(stateOutput, stateJsonHelp)
  const copyJsonButton = make('button', 'Copy JSON')
  copyJsonButton.type = 'button'
  copyJsonButton.addEventListener('click', async () => {
    await actions.onCopyJson()
  })
  const importJsonButton = make('button', 'Import JSON')
  importJsonButton.type = 'button'
  importJsonButton.addEventListener('click', () => actions.onImportJson(stateOutput.value))
  stateSection.append(copyJsonButton, importJsonButton)

  const diagnosticsSection = addSection(element, 'Diagnostics')
  const diagnosticsOutput = make('output')
  diagnosticsOutput.setAttribute('data-testid', 'diagnostics')
  diagnosticsSection.append(diagnosticsOutput)
  const diagnosticValues = [
    ['Intent log', 'diagnostics-intents'],
    ['Input JSON', 'diagnostics-input-json'],
    ['View-model JSON', 'diagnostics-view-model-json'],
    ['Accessibility tree', 'diagnostics-a11y-tree'],
    ['Focus order', 'diagnostics-focus-order'],
    ['Resolved tokens and contrast', 'diagnostics-tokens'],
  ] as const
  const diagnosticOutputs = new Map<string, HTMLElement>()
  for (const [title, testId] of diagnosticValues) {
    const section = make('section')
    section.append(make('h3', title))
    const output = make('pre')
    output.setAttribute('data-testid', testId)
    section.append(output)
    diagnosticsSection.append(section)
    diagnosticOutputs.set(testId, output)
  }
  const setDiagnosticText = (testId: string, value: string): void => {
    const output = diagnosticOutputs.get(testId)
    if (output !== undefined) {
      output.textContent = value
    }
  }

  const copyButton = make('button', 'Copy URL')
  copyButton.type = 'button'
  copyButton.addEventListener('click', actions.onCopyUrl)
  const resetButton = make('button', 'Reset')
  resetButton.type = 'button'
  resetButton.addEventListener('click', actions.onReset)
  element.append(copyButton, resetButton)
  const copyMessage = make('output')
  copyMessage.setAttribute('aria-live', 'polite')
  element.append(copyMessage)

  const update = (
    state: HarnessUrlState,
    issues: ReadonlyArray<UrlIssue>,
    screens: ReadonlyArray<ScenarioDefinition>,
    scenarios: ReadonlyArray<ScenarioDefinition>,
    diagnostics: string,
    stateJson: string,
  ): void => {
    if (screenSelect.options.length === 0) {
      screenSelect.replaceChildren()
      for (const screen of screens) {
        const option = make('option', screen.surface)
        option.value = screen.screen
        screenSelect.append(option)
      }
    }
    screenSelect.value = state.screen
    if (scenarioButtons.dataset['screen'] !== state.screen) {
      scenarioButtons.replaceChildren()
      scenarioButtons.dataset['screen'] = state.screen
      for (const scenario of scenarios) {
        const button = make('button', scenario.title)
        button.type = 'button'
        button.dataset['scenarioId'] = scenario.id
        button.addEventListener('click', () => actions.onScenario(scenario.id))
        scenarioButtons.append(button)
      }
    }
    for (const button of scenarioButtons.querySelectorAll<HTMLButtonElement>('button')) {
      button.setAttribute('aria-pressed', String(button.dataset['scenarioId'] === state.scenario))
    }
    galleryButton.setAttribute('aria-pressed', String(state.layout === 'gallery'))
    motionSelect.value = state.motion
    cvdSelect.value = state.cvd
    widthInput.value = String(state.width)
    heightInput.value = String(state.height)
    safeInput.value = String(state.safe)
    dprSelect.value = String(state.dpr)
    textScaleSelect.value = String(state.textScale)
    contrastSelect.value = state.contrast
    backgroundSelect.value = state.background
    timeInput.value = String(state.time)
    timeOutput.value = `${state.time.toFixed(3)} s`
    pauseButton.disabled = !state.playing
    stepButton.disabled = state.playing
    playButton.disabled = state.playing
    speedSelect.value = String(state.speed)
    stateOutput.value = stateJson
    diagnosticsOutput.textContent = diagnostics
    currentIssues = issues
    updateAlert()
    element.hidden = !state.panel
  }

  installComparison(element, actions.emitIntent)

  return {
    element,
    update,
    setCopyMessage: (message) => {
      copyMessage.textContent = message
    },
    setStateJson: (value) => {
      stateOutput.value = value
    },
    selectStateJson: () => {
      stateOutput.focus()
      stateOutput.select()
    },
    setStateJsonError: (message) => {
      stateJsonError = message
      updateAlert()
    },
    setIntentLog: (value) => {
      setDiagnosticText('diagnostics-intents', intentText(value))
    },
    setDiagnostics: (snapshot) => {
      setDiagnosticText('diagnostics-intents', intentText(snapshot.intents))
      setDiagnosticText('diagnostics-input-json', diagnosticText(snapshot.inputJson))
      setDiagnosticText('diagnostics-view-model-json', diagnosticText(snapshot.viewModelJson))
      setDiagnosticText('diagnostics-a11y-tree', diagnosticText(snapshot.a11yTree))
      setDiagnosticText('diagnostics-focus-order', diagnosticText(snapshot.focusOrder))
      setDiagnosticText('diagnostics-tokens', diagnosticText(snapshot.tokens))
    },
  }
}
