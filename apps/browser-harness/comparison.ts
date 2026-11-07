import { COLOR_VISION_MODES, colorVisionMatrixValues, type ColorVisionMode } from '../../src/domain/accessibility'
import type { HarnessEnvironment, HarnessUrlState, ScenarioContext, ScenarioDefinition, ScenarioMount } from './scenario-types'
import { SCENARIO_REGISTRY } from './scenario-registry'
import { parseHarnessUrl } from './url-state'

type ComparisonMode = 'motion' | 'color-vision'
type PaneCondition = HarnessEnvironment

const MAIN_MENU_BASELINE = new URL(
  '../../test-browser/ui-baselines.spec.ts-snapshots/main-menu-chromium-linux.png',
  import.meta.url,
).href

const BASELINE_WIDTH = 1280
const BASELINE_HEIGHT = 720
const BASELINE_BACKGROUND = 'mid'

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag)
  if (text !== undefined) {
    element.textContent = text
  }
  return element
}

const addSelect = (
  parent: HTMLElement,
  labelText: string,
  options: ReadonlyArray<readonly [string, string]>,
): HTMLSelectElement => {
  const label = make('label')
  label.append(make('span', labelText))
  const select = make('select')
  select.setAttribute('aria-label', labelText)
  for (const [value, text] of options) {
    const option = make('option', text)
    option.value = value
    select.append(option)
  }
  label.append(select)
  parent.append(label)
  return select
}

const colorModes = (): ReadonlyArray<readonly [string, string]> =>
  COLOR_VISION_MODES.filter((mode) => mode !== 'off').map((mode): readonly [string, string] => [mode, mode])

const conditionFor = (
  mode: ComparisonMode,
  side: 'left' | 'right',
  state: HarnessUrlState,
  colorVision: ColorVisionMode,
): PaneCondition => ({
  motion: mode === 'motion' ? (side === 'left' ? 'full' : 'reduced') : state.motion,
  cvd: mode === 'motion' ? state.cvd : side === 'left' ? 'off' : colorVision,
  width: state.width,
  height: state.height,
  safe: state.safe,
  dpr: state.dpr,
  textScale: state.textScale,
  contrast: state.contrast,
  background: state.background,
})

const hasApprovedBaseline = (
  scenario: ScenarioDefinition,
  state: HarnessUrlState,
  condition: PaneCondition,
): boolean =>
  scenario.screen === 'main-menu' &&
  scenario.id === 'default' &&
  condition.motion === 'full' &&
  condition.cvd === 'off' &&
  state.width === BASELINE_WIDTH &&
  state.height === BASELINE_HEIGHT &&
  state.safe === 0 &&
  state.dpr === 1 &&
  state.textScale === 100 &&
  state.contrast === 'normal' &&
  state.background === BASELINE_BACKGROUND &&
  state.time === 0 &&
  !state.playing &&
  state.breakProgress === undefined

const parseState = (): HarnessUrlState => parseHarnessUrl(window.location.search, SCENARIO_REGISTRY).state

const currentScenario = (state: HarnessUrlState): ScenarioDefinition | undefined =>
  SCENARIO_REGISTRY.find(
    (scenario) => scenario.screen === state.screen && scenario.id === state.scenario,
  )

const BACKGROUND_COLORS: Readonly<Record<HarnessEnvironment['background'], string>> = {
  white: 'white',
  black: 'black',
  checker: '#aaa',
  mid: 'rgb(128, 128, 128)',
}

const backgroundFor = (background: HarnessEnvironment['background']): string => BACKGROUND_COLORS[background]

const createColorFilter = (parent: HTMLElement, paneId: string, mode: ColorVisionMode): string => {
  const values = colorVisionMatrixValues(mode)
  if (values === undefined) {
    return ''
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.style.position = 'absolute'
  const filterId = `comparison-${paneId}-color-filter`
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter')
  filter.id = filterId
  const matrix = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix')
  matrix.setAttribute('type', 'matrix')
  matrix.setAttribute('values', values)
  filter.append(matrix)
  svg.append(filter)
  parent.append(svg)
  return `url(#${filterId})`
}

const setOverlayOpacity = (slider: HTMLInputElement, image: HTMLImageElement): void => {
  const opacity = Number(slider.value) / 100
  image.style.opacity = String(opacity)
  slider.dataset['overlayOpacity'] = String(slider.value)
}

const addStyles = (): HTMLStyleElement => {
  const style = make('style')
  style.textContent = `
    [data-condition-comparison] { display: grid; gap: .5rem; }
    [data-comparison-controls] { display: grid; gap: .5rem; }
    [data-comparison-panes] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; }
    [data-comparison-pane] { min-width: 0; overflow: hidden; border: 1px solid #888; padding: .25rem; }
    [data-comparison-view] { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; }
    [data-comparison-host] { position: absolute; inset: 0 auto auto 0; box-sizing: border-box; }
    [data-comparison-baseline] { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
    [data-comparison-pane] p { margin: .25rem 0; font-size: .75rem; }
    [data-comparison-pane] h3 { margin: 0 0 .25rem; font-size: .8rem; }
  `
  document.head.append(style)
  return style
}

export const installComparison = (
  panel: HTMLElement,
  emitIntent: ScenarioContext['emitIntent'],
): void => {
  if (panel.querySelector('[data-condition-comparison]') !== null) {
    return
  }

  const style = addStyles()
  const section = make('section')
  section.setAttribute('data-condition-comparison', '')
  section.setAttribute('aria-label', 'Condition comparison')
  section.append(make('h2', 'Condition comparison'))

  const controls = make('div')
  controls.setAttribute('data-comparison-controls', '')
  const modeSelect = addSelect(controls, 'Comparison conditions', [
    ['motion', 'Full / reduced motion'],
    ['color-vision', 'Color vision'],
  ])
  const colorSelect = addSelect(controls, 'Color vision mode', colorModes())
  colorSelect.value = 'deuteranopia'
  section.append(controls)

  const panes = make('div')
  panes.setAttribute('data-comparison-panes', '')
  section.append(panes)
  panel.append(section)

  let mounts: Array<ScenarioMount> = []

  const dispose = (): void => {
    for (const mount of mounts) {
      mount.dispose()
    }
    mounts = []
  }

  const render = (): void => {
    dispose()
    panes.replaceChildren()
    const state = parseState()
    const scenario = currentScenario(state)
    if (scenario === undefined) {
      panes.append(make('p', 'No registered scenario is selected.'))
      return
    }

    const mode: ComparisonMode = modeSelect.value === 'color-vision' ? 'color-vision' : 'motion'
    const selectedColorVision = COLOR_VISION_MODES.find((candidate) => candidate === colorSelect.value)
    const colorVision = selectedColorVision !== undefined && selectedColorVision !== 'off'
      ? selectedColorVision
      : 'deuteranopia'
    const sides: ReadonlyArray<'left' | 'right'> = ['left', 'right']
    for (const side of sides) {
      const condition = conditionFor(mode, side, state, colorVision)
      const pane = make('article')
      pane.setAttribute('data-comparison-pane', side)
      pane.dataset['scenarioId'] = scenario.id
      pane.dataset['screen'] = scenario.screen
      pane.dataset['motion'] = condition.motion
      pane.dataset['cvd'] = condition.cvd
      const title = mode === 'motion'
        ? side === 'left' ? 'Full motion' : 'Reduced motion'
        : `Color vision: ${condition.cvd}`
      pane.append(make('h3', title))

      const view = make('div')
      view.setAttribute('data-comparison-view', '')
      view.style.backgroundColor = backgroundFor(condition.background)
      if (condition.background === 'checker') {
        view.style.backgroundImage = 'conic-gradient(#eee 25%, #888 0 50%, #eee 0 75%, #888 0)'
        view.style.backgroundSize = '24px 24px'
      }
      const viewportWidth = Math.min(160, condition.width)
      const viewportHeight = Math.min(90, condition.height)
      const scale = Math.min(viewportWidth / condition.width, viewportHeight / condition.height)
      const viewWidth = viewportWidth
      const viewHeight = viewWidth * condition.height / condition.width
      view.style.width = `${String(viewWidth)}px`
      view.style.height = `${String(viewHeight)}px`
      view.style.marginInline = 'auto'
      const host = make('div')
      host.setAttribute('data-comparison-host', '')
      host.setAttribute('aria-hidden', 'true')
      host.inert = true
      host.dataset['scenarioId'] = scenario.id
      host.style.boxSizing = 'border-box'
      host.style.width = `${String(condition.width)}px`
      host.style.height = `${String(condition.height)}px`
      host.style.transform = `scale(${String(scale)})`
      host.style.transformOrigin = 'top left'
      host.style.padding = `${String(condition.safe)}px`
      host.style.fontSize = `${String(condition.textScale / 100)}rem`
      host.style.setProperty('--harness-safe-inset', `${String(condition.safe)}px`)
      host.style.setProperty('--harness-text-scale', String(condition.textScale / 100))
      const filters = [
        createColorFilter(view, side, condition.cvd),
        condition.contrast === 'more' ? 'contrast(1.25)' : '',
        condition.contrast === 'forced' ? 'grayscale(1) contrast(1.8)' : '',
      ].filter((value) => value !== '')
      host.style.filter = filters.join(' ')
      const mount = scenario.mount({
        factory: document,
        host,
        environment: condition,
        time: state.time,
        emitIntent,
        ...(state.breakProgress === undefined ? {} : { breakProgress: state.breakProgress }),
      })
      view.append(host)
      pane.append(view)
      mounts.push(mount)

      if (hasApprovedBaseline(scenario, state, condition)) {
        const image = make('img')
        image.setAttribute('data-comparison-baseline', '')
        image.alt = `Approved baseline for ${scenario.screen}/${scenario.id}, ${condition.motion}, ${condition.cvd}`
        image.style.opacity = '0.5'
        const slider = make('input')
        slider.type = 'range'
        slider.min = '0'
        slider.max = '100'
        slider.value = '50'
        slider.id = `comparison-baseline-${side}`
        slider.setAttribute('data-baseline-slider', '')
        slider.setAttribute('aria-label', 'Approved baseline overlay opacity')
        slider.addEventListener('input', () => setOverlayOpacity(slider, image))
        const sliderLabel = make('label', 'Baseline overlay')
        sliderLabel.htmlFor = slider.id
        const status = make('p', 'Loading approved baseline…')
        status.setAttribute('data-baseline-status', 'loading')
        const markUnavailable = (): void => {
          image.remove()
          slider.remove()
          sliderLabel.remove()
          status.textContent = 'Not compared: the approved baseline could not be loaded.'
          status.setAttribute('data-baseline-status', 'not-compared')
        }
        const enableOverlay = (): void => {
          if (image.naturalWidth === 0) {
            markUnavailable()
            return
          }
          status.textContent = `Approved baseline: ${scenario.screen}/${scenario.id}, ${condition.motion}, ${condition.cvd}.`
          status.setAttribute('data-baseline-status', 'approved')
          setOverlayOpacity(slider, image)
          pane.append(sliderLabel, slider)
        }
        image.addEventListener('load', enableOverlay, { once: true })
        image.addEventListener('error', markUnavailable, { once: true })
        image.src = MAIN_MENU_BASELINE
        view.append(image)
        pane.append(status)
        if (image.complete) {
          queueMicrotask(enableOverlay)
        }
      } else {
        const status = make('p', 'Not compared: no approved baseline for this scenario and condition.')
        status.setAttribute('data-baseline-status', 'not-compared')
        pane.append(status)
      }
      panes.append(pane)
    }
  }

  const updateTime = (): void => {
    const { time } = parseState()
    for (const mount of mounts) {
      mount.setTime(time)
    }
  }

  const onPanelChange = (event: Event): void => {
    const { target } = event
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return
    }
    if (target.hasAttribute('data-baseline-slider')) {
      return
    }
    if (target.getAttribute('data-testid') === 'time-slider') {
      queueMicrotask(updateTime)
      return
    }
    if (event.type === 'input') {
      return
    }
    queueMicrotask(render)
  }

  const onScenarioClick = (event: Event): void => {
    const { target } = event
    if (!(target instanceof Element) || target.closest('[data-scenario-buttons] button') === null) {
      return
    }
    queueMicrotask(render)
  }

  panel.addEventListener('change', onPanelChange)
  panel.addEventListener('input', onPanelChange)
  panel.addEventListener('click', onScenarioClick)
  window.addEventListener('popstate', render)
  render()

  const cleanup = (): void => {
    dispose()
    style.remove()
    panel.removeEventListener('change', onPanelChange)
    panel.removeEventListener('input', onPanelChange)
    panel.removeEventListener('click', onScenarioClick)
    window.removeEventListener('popstate', render)
  }
  window.addEventListener('pagehide', cleanup, { once: true })
}
