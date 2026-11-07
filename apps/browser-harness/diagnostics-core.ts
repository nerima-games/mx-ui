import { PALETTE_PROPERTY } from '../../src/application/palette-css'

export type DiagnosticValue<T> =
  | { readonly status: 'available'; readonly value: T }
  | { readonly status: 'unsupported'; readonly reason: string }

export type IntentRecord = {
  readonly sequence: number
  readonly intent: unknown
}

export type DiagnosticsSnapshot = {
  readonly intents: DiagnosticValue<ReadonlyArray<IntentRecord>>
  readonly inputJson: DiagnosticValue<unknown>
  readonly viewModelJson: DiagnosticValue<unknown>
  readonly a11yTree: DiagnosticValue<
    ReadonlyArray<{
      readonly role: string
      readonly name: string
      readonly state: Readonly<Record<string, string | boolean>>
    }>
  >
  readonly focusOrder: DiagnosticValue<
    ReadonlyArray<{
      readonly index: number
      readonly name: string
      readonly role: string
    }>
  >
  readonly tokens: DiagnosticValue<
    ReadonlyArray<{
      readonly name: string
      readonly value: string
      readonly against: string
      readonly againstValue: string
      readonly contrastRatio: number | null
      readonly reason?: string
    }>
  >
}

type ParsedColor = {
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly alpha: number
}

const DEFAULT_INTENT_LIMIT = 200,
  ELEMENT_ROLES: Readonly<Record<string, string>> = {
    button: 'button',
    form: 'form',
    img: 'img',
    li: 'listitem',
    main: 'main',
    meter: 'meter',
    nav: 'navigation',
    ol: 'list',
    option: 'option',
    output: 'status',
    progress: 'progressbar',
    summary: 'button',
    textarea: 'textbox',
    ul: 'list',
  },
  interactiveSelector =
    'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, [tabindex]',
  normalizeLimit = (limit: number | undefined): number => {
    if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
      return DEFAULT_INTENT_LIMIT
    }
    return Math.max(1, Math.floor(limit))
  },
  createIntentLog = (
    limit?: number,
  ): {
    readonly add: (intent: unknown) => void
    readonly reset: () => void
    readonly get: () => ReadonlyArray<IntentRecord>
  } => {
    const maximum = normalizeLimit(limit),
      entries: IntentRecord[] = []
    let sequence = 0

    return {
      add: (intent) => {
        sequence += 1
        entries.push({ sequence, intent })
        if (entries.length > maximum) {
          entries.splice(0, entries.length - maximum)
        }
      },
      reset: () => {
        entries.length = 0
        sequence = 0
      },
      get: () => entries.slice(),
    }
  },
  parseColorComponent = (value: string, maximum: number): number | null => {
    const trimmed = value.trim(),
      percent = trimmed.endsWith('%'),
      numericValue = Number(percent ? trimmed.slice(0, -1) : trimmed),
      normalized = percent ? (numericValue * maximum) / 100 : numericValue
    if (!Number.isFinite(numericValue)) {
      return null
    }
    return normalized >= 0 && normalized <= maximum ? normalized : null
  },
  parseHexColor = (value: string): ParsedColor | null => {
    const match = /^#(?<channels>[\da-f]{6})$/iu.exec(value.trim()),
      channels = match?.groups?.['channels']
    if (channels === undefined) {
      return null
    }
    return {
      red: Number.parseInt(channels.slice(0, 2), 16),
      green: Number.parseInt(channels.slice(2, 4), 16),
      blue: Number.parseInt(channels.slice(4, 6), 16),
      alpha: 1,
    }
  },
  parseRgbChannels = (components: string[], alphaText: string | undefined): ParsedColor | null => {
    const red = parseColorComponent(components[0] ?? '', 255),
      green = parseColorComponent(components[1] ?? '', 255),
      blue = parseColorComponent(components[2] ?? '', 255),
      alpha = alphaText === undefined ? 1 : parseColorComponent(alphaText, 1)
    if (red === null || green === null || blue === null || alpha === null) {
      return null
    }
    return { red, green, blue, alpha }
  },
  parseRgbColor = (value: string): ParsedColor | null => {
    const match = /^rgba?\((?<body>.*)\)$/iu.exec(value.trim()),
      body = match?.groups?.['body'],
      groups = body?.split('/') ?? [],
      components = (groups[0] ?? '').trim().split(/[\s,]+/u).filter((part) => part !== '')
    if (body === undefined || groups.length > 2) {
      return null
    }
    let alphaText = groups[1]?.trim()
    if (components.length === 4 && alphaText === undefined) {
      alphaText = components.pop()
    }
    if (components.length !== 3) {
      return null
    }
    return parseRgbChannels(components, alphaText)
  },
  parseColor = (value: string): ParsedColor | null => parseHexColor(value) ?? parseRgbColor(value),
  composite = (foreground: ParsedColor, background: ParsedColor): ParsedColor => ({
    red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
    green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
    blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
    alpha: 1,
  }),
  linearize = (channel: number): number => {
    const srgb = channel / 255
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  },
  relativeLuminance = (color: ParsedColor): number =>
    0.2126 * linearize(color.red) + 0.7152 * linearize(color.green) + 0.0722 * linearize(color.blue),
  ratioForColors = (parsedForeground: ParsedColor, parsedBackground: ParsedColor): number => {
    const opaqueForeground = parsedForeground.alpha === 1
        ? parsedForeground
        : composite(parsedForeground, parsedBackground),
      foregroundLuminance = relativeLuminance(opaqueForeground),
      backgroundLuminance = relativeLuminance(parsedBackground),
      lighter = Math.max(foregroundLuminance, backgroundLuminance),
      darker = Math.min(foregroundLuminance, backgroundLuminance)
    return (lighter + 0.05) / (darker + 0.05)
  },
  contrastRatio = (foreground: string, background: string): number | null => {
    const parsedForeground = parseColor(foreground),
      parsedBackground = parseColor(background)
    if (parsedForeground === null || parsedBackground === null || parsedBackground.alpha !== 1) {
      return null
    }
    return ratioForColors(parsedForeground, parsedBackground)
  },
  inputRoleFor = (element: Element): string => {
    const { type } = element as HTMLInputElement
    switch (type) {
      case 'hidden': return 'none'
      case 'checkbox': return 'checkbox'
      case 'radio': return 'radio'
      case 'range': return 'slider'
      case 'button':
      case 'submit':
      case 'reset': return 'button'
      case 'search': return 'searchbox'
      default: return 'textbox'
    }
  },
  implicitRoleFor = (element: Element): string => {
    const tagName = element.tagName.toLowerCase()
    if (tagName === 'a' && element.hasAttribute('href')) {
      return 'link'
    }
    if (tagName === 'select') {
      const { multiple, size } = element as HTMLSelectElement
      return multiple || size > 1 ? 'listbox' : 'combobox'
    }
    if (tagName === 'input') {
      return inputRoleFor(element)
    }
    if (/^h[1-6]$/u.test(tagName)) {
      return 'heading'
    }
    return ELEMENT_ROLES[tagName] ?? 'generic'
  },
  roleFor = (element: Element): string => {
    const explicitRole = element.getAttribute('role')?.trim().split(/\s+/u)[0]
    return explicitRole === undefined || explicitRole === '' ? implicitRoleFor(element) : explicitRole
  },
  isHidden = (element: Element, root: Element): boolean => {
    let current: Element | null = element
    while (current !== null) {
      if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') {
        return true
      }
      const view = current.ownerDocument.defaultView
      if (view !== null) {
        const style = view.getComputedStyle(current)
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
          return true
        }
      }
      if (current === root) {
        return false
      }
      current = current.parentElement
    }
    return false
  },
  accessibleName = (element: Element): string => {
    const ariaLabel = element.getAttribute('aria-label')?.trim(),
      labelledBy = element.getAttribute('aria-labelledby'),
      tagName = element.tagName.toLowerCase()
    if (ariaLabel !== undefined && ariaLabel !== '') {
      return ariaLabel
    }
    if (labelledBy !== null) {
      const name = labelledBy
        .split(/\s+/u)
        .map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
        .filter((part) => part !== '')
        .join(' ')
      if (name !== '') {
        return name
      }
    }
    if (tagName === 'img' || tagName === 'input') {
      const alternative = element.getAttribute('alt')?.trim()
      if (alternative !== undefined && alternative !== '') {
        return alternative
      }
    }
    const label = element.closest('label')?.textContent?.replace(/\s+/gu, ' ').trim()
    if (label !== undefined && label !== '') {
      return label
    }
    return (element.textContent ?? '').replace(/\s+/gu, ' ').trim()
  },
  stateFor = (element: Element, role: string): Readonly<Record<string, string | boolean>> => {
    const state: Record<string, string | boolean> = {},
      stateAttributes = [
        'aria-checked',
        'aria-current',
        'aria-disabled',
        'aria-expanded',
        'aria-invalid',
        'aria-pressed',
        'aria-selected',
        'aria-valuenow',
        'aria-valuemin',
        'aria-valuemax',
      ]
    for (const attribute of stateAttributes) {
      const value = element.getAttribute(attribute)
      if (value !== null) {
        state[attribute.slice('aria-'.length)] = value
      }
    }
    if (
      role === 'button' ||
      role === 'checkbox' ||
      role === 'combobox' ||
      role === 'link' ||
      role === 'listbox' ||
      role === 'radio' ||
      role === 'searchbox' ||
      role === 'slider' ||
      role === 'textbox'
    ) {
      state['disabled'] = element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true'
    }
    if (role === 'checkbox' || role === 'radio') {
      state['checked'] = (element as HTMLInputElement).checked
    }
    if (role === 'option') {
      state['selected'] = (element as HTMLOptionElement).selected
    }
    return state
  },
  isFocusable = (element: Element): boolean => {
    if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') {
      return false
    }
    const { tabIndex } = element as HTMLElement
    return Number.isFinite(tabIndex) && tabIndex >= 0
  },
  collectTree = (
    root: Element,
  ): ReadonlyArray<{
    readonly role: string
    readonly name: string
    readonly state: Readonly<Record<string, string | boolean>>
  }> => {
    const elements = [root, ...root.querySelectorAll('*')]
    return elements
      .filter((element) => !isHidden(element, root))
      .map((element) => ({ element, role: roleFor(element) }))
      .filter(({ element, role }) =>
        role !== 'none' || element.hasAttribute('aria-hidden') || element.hasAttribute('role'),
      )
      .filter(({ element, role }) =>
        role !== 'generic' ||
        element.hasAttribute('role') ||
        element.hasAttribute('aria-label') ||
        element.hasAttribute('aria-labelledby') ||
        element.hasAttribute('tabindex') ||
        element.matches(interactiveSelector),
      )
      .map(({ element, role }) => ({ role, name: accessibleName(element), state: stateFor(element, role) }))
  },
  collectFocusOrder = (
    root: Element,
  ): ReadonlyArray<{ readonly index: number; readonly name: string; readonly role: string }> => {
    const elements = [root, ...root.querySelectorAll(interactiveSelector)]
      .filter((element) => !isHidden(element, root) && isFocusable(element))
    return elements.map((element, index) => ({ index, name: accessibleName(element), role: roleFor(element) }))
  },
  tokenRow = (
    computed: CSSStyleDeclaration,
    property: string,
    against: string,
    againstValue: string,
  ): {
    readonly name: string
    readonly value: string
    readonly against: string
    readonly againstValue: string
    readonly contrastRatio: number | null
    readonly reason?: string
  } => {
    const value = computed.getPropertyValue(property).trim()
    if (value === '') {
      return {
        name: property,
        value,
        against,
        againstValue,
        contrastRatio: null,
        reason: `The token ${property} is not resolved on this UI root.`,
      }
    }
    if (againstValue === '') {
      return {
        name: property,
        value,
        against,
        againstValue,
        contrastRatio: null,
        reason: `The comparison token ${against} is not resolved on this UI root.`,
      }
    }
    const ratio = contrastRatio(value, againstValue)
    return ratio === null
      ? {
          name: property,
          value,
          against,
          againstValue,
          contrastRatio: null,
          reason: 'The resolved token color format is unsupported for WCAG contrast calculation.',
        }
      : { name: property, value, against, againstValue, contrastRatio: ratio }
  },
  collectResolvedTokens = (
    computed: CSSStyleDeclaration,
  ): ReadonlyArray<{
    readonly name: string
    readonly value: string
    readonly against: string
    readonly againstValue: string
    readonly contrastRatio: number | null
    readonly reason?: string
  }> => {
    const against = PALETTE_PROPERTY.surface,
      againstValue = computed.getPropertyValue(against).trim()
    return Object.entries(PALETTE_PROPERTY).map(([, property]) =>
      tokenRow(computed, property, against, againstValue),
    )
  },
  collectTokens = (
    root: Element,
  ): ReadonlyArray<{
    readonly name: string
    readonly value: string
    readonly against: string
    readonly againstValue: string
    readonly contrastRatio: number | null
    readonly reason?: string
  }> => {
    const view = root.ownerDocument.defaultView
    if (view === null) {
      return Object.entries(PALETTE_PROPERTY).map(([name, property]) => ({
        name: property,
        value: '',
        against: PALETTE_PROPERTY.surface,
        againstValue: '',
        contrastRatio: null,
        reason: `Cannot resolve ${name}: the owner document has no window.`,
      }))
    }
    return collectResolvedTokens(view.getComputedStyle(root))
  },
  collectDiagnostics = (
    root: Element | null,
    inputJson: DiagnosticValue<unknown>,
    intents: DiagnosticValue<ReadonlyArray<IntentRecord>>,
    viewModelJson: DiagnosticValue<unknown>,
  ): DiagnosticsSnapshot => {
    if (root === null) {
      const reason = 'The selected scenario UI root is not mounted.'
      return {
        intents,
        inputJson,
        viewModelJson,
        a11yTree: { status: 'unsupported', reason },
        focusOrder: { status: 'unsupported', reason },
        tokens: { status: 'unsupported', reason },
      }
    }
    return {
      intents,
      inputJson,
      viewModelJson,
      a11yTree: { status: 'available', value: collectTree(root) },
      focusOrder: { status: 'available', value: collectFocusOrder(root) },
      tokens: { status: 'available', value: collectTokens(root) },
    }
  }

const intentLogDiagnosticValue = (
  log: ReturnType<typeof createIntentLog>,
): DiagnosticValue<ReadonlyArray<IntentRecord>> => ({
  status: 'available',
  value: log.get(),
})

export { collectDiagnostics, contrastRatio, createIntentLog, intentLogDiagnosticValue }
