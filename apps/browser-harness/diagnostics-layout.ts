type ListenerRecord = {
  readonly type: string
  readonly listener: EventListenerOrEventListenerObject
  readonly capture: boolean
  readonly wrapped: EventListener
  readonly signal: AbortSignal | undefined
  readonly abortListener: EventListener | undefined
}

type BoundsRecord = {
  readonly selector: string
  readonly label: string
  readonly tag: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rootOverflow: boolean
  readonly viewportOverflow: boolean
}

type DomEntry = {
  readonly tag: string
  readonly attributes: ReadonlyArray<readonly [string, string]>
  readonly text: string
}

type DomDiffEntry = {
  readonly type: 'added' | 'removed' | 'changed'
  readonly selector: string
  readonly before?: DomEntry
  readonly after?: DomEntry
}

type CapturedError = {
  readonly kind: 'console' | 'page' | 'rejection'
  readonly message: string
}

const listenerRecords: ListenerRecord[] = []
const originalAdd = document.addEventListener.bind(document)
const originalRemove = document.removeEventListener.bind(document)
const captureOption = (
  options: boolean | AddEventListenerOptions | EventListenerOptions | undefined,
): boolean => typeof options === 'boolean' ? options : options?.capture ?? false
let panel: HTMLElement | undefined = undefined
let listenerOutput: HTMLElement | undefined = undefined
let errorsOutput: HTMLElement | undefined = undefined
let boundsOutput: HTMLElement | undefined = undefined
let overflowOutput: HTMLElement | undefined = undefined
let diffOutput: HTMLElement | undefined = undefined
let overlay: HTMLDivElement | undefined = undefined
let previousDom: Map<string, DomEntry> | undefined = undefined
let displayedDiff: ReadonlyArray<DomDiffEntry> = []
let activeScenarioKey = (() => {
  const params = new URLSearchParams(window.location.search)
  return `${params.get('screen') ?? 'main-menu'}/${params.get('scenario') ?? 'default'}`
})()
const capturedErrors: CapturedError[] = []

const visiblePanel = (): boolean => panel !== undefined && !panel.hidden

const updateListenerOutput = (): void => {
  if (visiblePanel() && listenerOutput !== undefined) {
    listenerOutput.textContent = String(listenerRecords.length)
  }
}

const forgetListener = (record: ListenerRecord): void => {
  const index = listenerRecords.indexOf(record)
  if (index !== -1) {
    listenerRecords.splice(index, 1)
    if (record.signal !== undefined && record.abortListener !== undefined) {
      record.signal.removeEventListener('abort', record.abortListener)
    }
    updateListenerOutput()
  }
}

const addDocumentListener = (
  type: string,
  listener: EventListenerOrEventListenerObject | null,
  options?: boolean | AddEventListenerOptions,
): void => {
  if (listener === null) {
    return
  }
  const capture = captureOption(options)
  const existing = listenerRecords.find(
    (record) => record.type === type && record.listener === listener && record.capture === capture,
  )
  if (existing !== undefined) {
    return
  }
  const signal = typeof options === 'object' ? options.signal : undefined
  const once = typeof options === 'object' && options.once === true
  if (signal?.aborted) {
    originalAdd(type, listener, options)
    return
  }
  const record: ListenerRecord = {
    type,
    listener,
    capture,
    wrapped: (event) => {
      if (once) {
        forgetListener(record)
      }
      if (typeof listener === 'function') {
        listener.call(document, event)
      } else {
        listener.handleEvent(event)
      }
    },
    signal,
    abortListener: signal === undefined ? undefined : () => forgetListener(record),
  }
  originalAdd(type, record.wrapped, options)
  listenerRecords.push(record)
  if (record.signal !== undefined && record.abortListener !== undefined) {
    record.signal.addEventListener('abort', record.abortListener, { once: true })
  }
  updateListenerOutput()
}

const removeDocumentListener = (
  type: string,
  listener: EventListenerOrEventListenerObject | null,
  options?: boolean | EventListenerOptions,
): void => {
  if (listener === null) {
    return
  }
  const record = listenerRecords.find(
    (entry) => entry.type === type && entry.listener === listener && entry.capture === captureOption(options),
  )
  if (record === undefined) {
    originalRemove(type, listener, options)
    return
  }
  originalRemove(type, record.wrapped, options)
  forgetListener(record)
}

Object.defineProperty(document, 'addEventListener', {
  configurable: true,
  writable: true,
  value: addDocumentListener,
})
Object.defineProperty(document, 'removeEventListener', {
  configurable: true,
  writable: true,
  value: removeDocumentListener,
})

const appendError = (kind: CapturedError['kind'], message: string): void => {
  capturedErrors.push({ kind, message })
  if (capturedErrors.length > 100) {
    capturedErrors.shift()
  }
  if (visiblePanel() && errorsOutput !== undefined) {
    errorsOutput.textContent = JSON.stringify(capturedErrors)
  }
}

const errorMessage = (value: unknown): string => value instanceof Error ? value.message : String(value)
const originalConsoleError = window.console.error.bind(window.console)
Object.defineProperty(window.console, 'error', {
  configurable: true,
  writable: true,
  value: (...values: unknown[]): void => {
    appendError('console', values.map(errorMessage).join(' '))
    originalConsoleError(...values)
  },
})
window.addEventListener('error', (event) => {
  if (event instanceof ErrorEvent) {
    appendError('page', event.message)
  }
})
window.addEventListener('unhandledrejection', (event) => {
  appendError('rejection', errorMessage(event.reason))
})

const appendOutput = (parent: HTMLElement, title: string, testId: string): HTMLElement => {
  const section = document.createElement('section')
  const heading = document.createElement('h3')
  heading.textContent = title
  const output = document.createElement('pre')
  output.setAttribute('data-testid', testId)
  section.append(heading, output)
  parent.append(section)
  return output
}

const scenarioSelection = (currentPanel: HTMLElement): { readonly screen: string; readonly scenario: string } => {
  const screen = currentPanel.querySelector<HTMLSelectElement>('select[aria-label="Screen"]')?.value ?? ''
  const selectedScenario = currentPanel.querySelector<HTMLButtonElement>(
    '[data-scenario-buttons] button[aria-pressed="true"]',
  )?.dataset['scenarioId']
  return { screen, scenario: selectedScenario ?? '' }
}

const selectedRoot = (currentPanel: HTMLElement): HTMLElement | null => {
  const { screen, scenario } = scenarioSelection(currentPanel)
  const hosts = document.querySelectorAll<HTMLElement>('[data-harness-stage] [data-harness-host]')
  const host = Array.from(hosts).find(
    (candidate) => candidate.dataset['harnessHost'] === screen && candidate.dataset['harnessScenario'] === scenario,
  )
  return host?.querySelector<HTMLElement>(':scope > [data-mx-ui]') ?? null
}

const nthOfType = (element: Element): number => {
  const parent = element.parentElement
  if (parent === null) {
    return 1
  }
  return Array.from(parent.children)
    .filter((sibling) => sibling.tagName === element.tagName)
    .indexOf(element) + 1
}

const selectorFor = (element: Element, root: Element): string => {
  if (element === root) {
    return ':scope'
  }
  const segments: string[] = []
  let current: Element | null = element
  while (current !== null && current !== root) {
    segments.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${nthOfType(current)})`)
    current = current.parentElement
  }
  return `:scope > ${segments.join(' > ')}`
}

const labelFor = (element: Element, selector: string): string => {
  const accessible = element.getAttribute('aria-label')?.trim()
  const id = element.getAttribute('id')?.trim()
  const text = element.textContent?.replace(/\s+/gu, ' ').trim()
  if (accessible !== undefined && accessible !== '') {
    return accessible
  }
  if (id !== undefined && id !== '') {
    return `#${id}`
  }
  if (text !== undefined && text !== '') {
    return text.slice(0, 100)
  }
  return `${element.tagName.toLowerCase()} ${selector}`
}

const isOutside = (
  rect: DOMRect,
  bounds: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
): boolean =>
  rect.left < bounds.left - 0.5 ||
  rect.top < bounds.top - 0.5 ||
  rect.right > bounds.right + 0.5 ||
  rect.bottom > bounds.bottom + 0.5

const boundsFor = (root: HTMLElement): ReadonlyArray<BoundsRecord> => {
  const rootRect = root.getBoundingClientRect()
  const viewport = root.closest<HTMLElement>('[data-harness-viewport]')
  const viewportRect = viewport?.getBoundingClientRect()
  const viewportBounds = {
    left: viewportRect?.left ?? 0,
    top: viewportRect?.top ?? 0,
    right: viewportRect?.right ?? window.innerWidth,
    bottom: viewportRect?.bottom ?? window.innerHeight,
  }
  const elements = [root, ...root.querySelectorAll<HTMLElement>('*')]
  return elements.map((element) => {
    const rect = element.getBoundingClientRect()
    const selector = selectorFor(element, root)
    return {
      selector,
      label: labelFor(element, selector),
      tag: element.tagName.toLowerCase(),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      rootOverflow: isOutside(rect, rootRect),
      viewportOverflow: isOutside(rect, viewportBounds),
    }
  })
}

const createOverlay = (): HTMLDivElement => {
  const element = document.createElement('div')
  element.setAttribute('data-layout-bounds-overlay', '')
  element.setAttribute('aria-hidden', 'true')
  element.style.position = 'fixed'
  element.style.inset = '0'
  element.style.zIndex = '2147483647'
  element.style.pointerEvents = 'none'
  document.body.append(element)
  return element
}

const renderOverlay = (records: ReadonlyArray<BoundsRecord>): void => {
  overlay ??= createOverlay()
  overlay.replaceChildren()
  for (const record of records) {
    const box = document.createElement('span')
    box.setAttribute('data-layout-bounds-for', record.selector)
    box.style.position = 'absolute'
    box.style.left = `${record.x}px`
    box.style.top = `${record.y}px`
    box.style.width = `${record.width}px`
    box.style.height = `${record.height}px`
    box.style.boxSizing = 'border-box'
    box.style.border = `1px solid ${record.rootOverflow || record.viewportOverflow ? '#d00000' : '#0877d1'}`
    overlay.append(box)
  }
  overlay.hidden = !visiblePanel()
}

const domSnapshot = (root: HTMLElement): Map<string, DomEntry> => {
  const entries = new Map<string, DomEntry>()
  const visit = (element: Element): void => {
    const attributes = Array.from(element.attributes)
      .map((attribute): readonly [string, string] => [attribute.name, attribute.value])
      .sort(([left], [right]) => left.localeCompare(right))
    const text = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join('')
      .replace(/\s+/gu, ' ')
      .trim()
    entries.set(selectorFor(element, root), { tag: element.tagName.toLowerCase(), attributes, text })
    Array.from(element.children).forEach(visit)
  }
  visit(root)
  return entries
}

const diffDom = (before: Map<string, DomEntry> | undefined, after: Map<string, DomEntry>): ReadonlyArray<DomDiffEntry> => {
  if (before === undefined) {
    return []
  }
  const selectors = new Set([...before.keys(), ...after.keys()])
  const entries: DomDiffEntry[] = []
  for (const selector of selectors) {
    const previous = before.get(selector)
    const current = after.get(selector)
    if (previous === undefined && current !== undefined) {
      entries.push({ type: 'added', selector, after: current })
    } else if (previous !== undefined && current === undefined) {
      entries.push({ type: 'removed', selector, before: previous })
    } else if (previous !== undefined && current !== undefined && JSON.stringify(previous) !== JSON.stringify(current)) {
      entries.push({ type: 'changed', selector, before: previous, after: current })
    }
  }
  return entries
}

const resetScenarioErrors = (nextKey: string): void => {
  if (activeScenarioKey !== nextKey) {
    activeScenarioKey = nextKey
    capturedErrors.length = 0
  }
}

const clearDomDiff = (): void => {
  displayedDiff = []
  if (diffOutput !== undefined) {
    diffOutput.textContent = '[]'
  }
}

const beginScenarioMount = (nextKey: string): void => {
  activeScenarioKey = nextKey
  capturedErrors.length = 0
  clearDomDiff()
}

const renderErrors = (): void => {
  if (errorsOutput !== undefined) {
    errorsOutput.textContent = JSON.stringify(capturedErrors)
  }
}

const refresh = (): void => {
  if (panel === undefined || !visiblePanel()) {
    return
  }
  const selection = scenarioSelection(panel)
  const selectedKey = `${selection.screen}/${selection.scenario}`
  const pendingScreenMount = activeScenarioKey === `${selection.screen}/*`
  if (previousDom === undefined) {
    activeScenarioKey = selectedKey
  } else if (activeScenarioKey !== selectedKey && !pendingScreenMount) {
    resetScenarioErrors(selectedKey)
  } else if (pendingScreenMount) {
    activeScenarioKey = selectedKey
  }
  const root = selectedRoot(panel)
  if (root === null) {
    if (boundsOutput !== undefined) {
      boundsOutput.textContent = '[]'
    }
    if (overflowOutput !== undefined) {
      overflowOutput.textContent = '[]'
    }
    if (diffOutput !== undefined) {
      diffOutput.textContent = '[]'
    }
    previousDom = undefined
    renderOverlay([])
    updateListenerOutput()
    renderErrors()
    return
  }
  const bounds = boundsFor(root)
  const overflow = bounds.filter((entry) => entry.rootOverflow || entry.viewportOverflow)
  const nextDom = domSnapshot(root)
  const diff = diffDom(previousDom, nextDom)
  if (diff.length > 0 || previousDom === undefined) {
    displayedDiff = diff
  }
  if (boundsOutput !== undefined) {
    boundsOutput.textContent = JSON.stringify(bounds)
  }
  if (overflowOutput !== undefined) {
    overflowOutput.textContent = JSON.stringify(overflow)
  }
  if (diffOutput !== undefined) {
    diffOutput.textContent = JSON.stringify(displayedDiff)
  }
  previousDom = nextDom
  renderOverlay(bounds)
  updateListenerOutput()
  renderErrors()
}

const scenarioKeyForTarget = (target: Element): string | undefined => {
  const scenarioButton = target.closest<HTMLButtonElement>('[data-scenario-buttons] button')
  if (scenarioButton === null) {
    return undefined
  }
  const screen = panel?.querySelector<HTMLSelectElement>('select[aria-label="Screen"]')?.value ?? ''
  const scenario = scenarioButton.dataset['scenarioId']
  return scenario === undefined ? undefined : `${screen}/${scenario}`
}

const scheduleRefresh = (): void => {
  queueMicrotask(refresh)
}

const installPanel = (element: HTMLElement): void => {
  panel = element
  const diagnosticSection = element.querySelector<HTMLElement>('[data-testid="diagnostics"]')?.parentElement
  if (diagnosticSection === null || diagnosticSection === undefined) {
    return
  }
  const refreshButton = document.createElement('button')
  refreshButton.type = 'button'
  refreshButton.textContent = 'Refresh layout diagnostics'
  refreshButton.setAttribute('data-testid', 'diagnostics-layout-refresh')
  refreshButton.addEventListener('click', refresh)
  diagnosticSection.append(refreshButton)
  boundsOutput = appendOutput(diagnosticSection, 'Layout bounds', 'diagnostics-layout-bounds')
  overflowOutput = appendOutput(diagnosticSection, 'Overflow', 'diagnostics-layout-overflow')
  diffOutput = appendOutput(diagnosticSection, 'DOM diff', 'diagnostics-dom-diff')
  listenerOutput = appendOutput(diagnosticSection, 'Document listeners', 'diagnostics-document-listeners')
  errorsOutput = appendOutput(diagnosticSection, 'Console and page errors', 'diagnostics-errors')
  const initialSelection = scenarioSelection(element)
  activeScenarioKey = `${initialSelection.screen}/${initialSelection.scenario}`
  element.addEventListener('click', (event) => {
    if (event.target instanceof Element) {
      const nextKey = scenarioKeyForTarget(event.target)
      if (nextKey !== undefined) {
        beginScenarioMount(nextKey)
      }
    }
  }, true)
  element.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      return
    }
    const changesScenario = event.target.closest('[data-scenario-buttons] button') !== null
    const advancesTime = event.target.closest('[data-timeline-controls] button')?.textContent === 'Step frame'
    if (changesScenario || advancesTime) {
      if (advancesTime) {
        clearDomDiff()
      }
      scheduleRefresh()
    }
  })
  element.addEventListener('change', (event) => {
    if (event.target instanceof HTMLSelectElement && event.target.getAttribute('aria-label') === 'Screen') {
      beginScenarioMount(`${event.target.value}/*`)
    }
  }, true)
  element.addEventListener('change', (event) => {
    if (event.target instanceof HTMLSelectElement && event.target.type === 'select-one') {
      if (event.target.getAttribute('aria-label') === 'Screen') {
        scheduleRefresh()
      }
    }
  })
  element.addEventListener('input', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'range') {
      clearDomDiff()
    }
  })
  element.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'range') {
      scheduleRefresh()
    }
  })
  const panelObserver = new MutationObserver(() => {
    if (element.hidden) {
      if (overlay !== undefined) {
        overlay.hidden = true
      }
    } else {
      scheduleRefresh()
    }
  })
  panelObserver.observe(element, { attributes: true, attributeFilter: ['hidden'] })
  refresh()
}

const panelObserver = new MutationObserver(() => {
  const found = document.querySelector<HTMLElement>('[data-debug-panel]')
  if (found !== null) {
    panelObserver.disconnect()
    installPanel(found)
  }
})
panelObserver.observe(document.body, { childList: true, subtree: true })
