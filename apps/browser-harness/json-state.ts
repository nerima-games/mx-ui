import type { ColorVisionMode, MotionPreference } from '../../src/domain/accessibility'
import { parseHarnessUrl, serializeHarnessState } from './url-state'
import type {
  BackgroundMode,
  ContrastMode,
  DevicePixelRatio,
  HarnessUrlState,
  LayoutMode,
  PlaybackSpeed,
  ScenarioDefinition,
  TextScale,
} from './scenario-types'

export const MAX_HARNESS_STATE_JSON_BYTES = 65_536

const REQUIRED_KEYS = [
  'screen',
  'scenario',
  'layout',
  'motion',
  'cvd',
  'width',
  'height',
  'safe',
  'dpr',
  'textScale',
  'contrast',
  'background',
  'time',
  'playing',
  'speed',
  'panel',
] as const

const STRING_KEYS = [
  'screen',
  'scenario',
  'layout',
  'motion',
  'cvd',
  'contrast',
  'background',
] as const

const REQUIRED_NUMBER_KEYS = [
  'width',
  'height',
  'safe',
  'dpr',
  'textScale',
  'time',
  'speed',
] as const

const ALLOWED_KEYS = new Set<string>([...REQUIRED_KEYS, 'breakProgress'])

export type HarnessStateJsonErrorKind =
  | 'too-large'
  | 'invalid-json'
  | 'invalid-schema'
  | 'unknown-scenario'

export type HarnessStateJsonResult =
  | { readonly ok: true; readonly state: HarnessUrlState }
  | {
      readonly ok: false
      readonly error: {
        readonly kind: HarnessStateJsonErrorKind
        readonly message: string
      }
    }

const failure = (
  kind: HarnessStateJsonErrorKind,
  message: string,
): HarnessStateJsonResult => ({ ok: false, error: { kind, message } })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOwn = (value: object, key: string): boolean =>
  Object.hasOwn(value, key)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const skipJsonWhitespace = (input: string, from: number): number => {
  let index = from
  while (/\s/u.test(input[index] ?? '')) {
    index += 1
  }
  return index
}

const jsonStringEnd = (input: string, start: number): number | undefined => {
  let escaped = false
  for (let index = start + 1; index < input.length; index += 1) {
    const character = input[index]
    if (escaped) {
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === '"') {
      return index + 1
    }
  }
  return undefined
}

const topLevelValueDelimiter = (
  input: string,
  from: number,
): { readonly index: number; readonly character: string } | undefined => {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = from; index < input.length; index += 1) {
    const character = input[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
    } else if (character === '"') {
      inString = true
    } else if (character === '{' || character === '[') {
      depth += 1
    } else if (character === '}' || character === ']') {
      if (depth === 0) {
        return { index, character }
      }
      depth -= 1
    } else if (character === ',' && depth === 0) {
      return { index, character }
    }
  }
  return undefined
}

const hasDuplicateTopLevelKeys = (input: string): boolean => {
  let index = skipJsonWhitespace(input, 0)
  if (input[index] !== '{') {
    return false
  }

  const keys = new Set<string>()
  index += 1
  while (index < input.length) {
    index = skipJsonWhitespace(input, index)
    if (input[index] === '}') {
      return false
    }
    if (input[index] !== '"') {
      return false
    }

    const keyEnd = jsonStringEnd(input, index)
    if (keyEnd === undefined) {
      return false
    }
    const key: unknown = JSON.parse(input.slice(index, keyEnd)) as unknown
    if (typeof key !== 'string') {
      return false
    }
    if (keys.has(key)) {
      return true
    }
    keys.add(key)

    index = skipJsonWhitespace(input, keyEnd)
    if (input[index] !== ':') {
      return false
    }
    index += 1
    const delimiter = topLevelValueDelimiter(input, index)
    if (delimiter === undefined || delimiter.character !== ',') {
      return false
    }
    index = delimiter.index + 1
  }
  return false
}

const toHarnessState = (record: Record<string, unknown>): HarnessUrlState => ({
  screen: record['screen'] as string,
  scenario: record['scenario'] as string,
  layout: record['layout'] as LayoutMode,
  motion: record['motion'] as MotionPreference,
  cvd: record['cvd'] as ColorVisionMode,
  width: record['width'] as number,
  height: record['height'] as number,
  safe: record['safe'] as number,
  dpr: record['dpr'] as DevicePixelRatio,
  textScale: record['textScale'] as TextScale,
  contrast: record['contrast'] as ContrastMode,
  background: record['background'] as BackgroundMode,
  time: record['time'] as number,
  playing: record['playing'] as boolean,
  speed: record['speed'] as PlaybackSpeed,
  panel: record['panel'] as boolean,
  ...(hasOwn(record, 'breakProgress')
    ? { breakProgress: record['breakProgress'] as number }
    : {}),
})

export const serializeHarnessStateJson = (state: HarnessUrlState): string =>
  JSON.stringify(
    {
      screen: state.screen,
      scenario: state.scenario,
      layout: state.layout,
      motion: state.motion,
      cvd: state.cvd,
      width: state.width,
      height: state.height,
      safe: state.safe,
      dpr: state.dpr,
      textScale: state.textScale,
      contrast: state.contrast,
      background: state.background,
      time: state.time,
      playing: state.playing,
      speed: state.speed,
      panel: state.panel,
      ...(state.breakProgress === undefined ? {} : { breakProgress: state.breakProgress }),
    },
    null,
    2,
  )

export const parseHarnessStateJson = (
  input: string,
  registry: ReadonlyArray<ScenarioDefinition>,
): HarnessStateJsonResult => {
  if (input.length > MAX_HARNESS_STATE_JSON_BYTES) {
    return failure('too-large', 'State JSON must be 64 KiB or smaller.')
  }
  if (new TextEncoder().encode(input).byteLength > MAX_HARNESS_STATE_JSON_BYTES) {
    return failure('too-large', 'State JSON must be 64 KiB or smaller.')
  }

  let value: unknown = undefined
  try {
    value = JSON.parse(input) as unknown
  } catch {
    return failure('invalid-json', 'Input is not valid JSON.')
  }

  // JSON.parse keeps only one value for repeated names, so reject that ambiguity before using the decoded object.
  if (hasDuplicateTopLevelKeys(input)) {
    return failure('invalid-schema', 'State JSON contains duplicate fields.')
  }

  if (!isRecord(value)) {
    return failure('invalid-schema', 'State JSON must be an object.')
  }

  if (Object.keys(value).some((key) => !ALLOWED_KEYS.has(key))) {
    return failure('invalid-schema', 'State JSON contains an unknown field.')
  }

  if (REQUIRED_KEYS.some((key) => !hasOwn(value, key))) {
    return failure('invalid-schema', 'State JSON is missing a required field.')
  }

  if (
    !STRING_KEYS.every((key) => typeof value[key] === 'string') ||
    !REQUIRED_NUMBER_KEYS.every((key) => isFiniteNumber(value[key])) ||
    (hasOwn(value, 'breakProgress') && !isFiniteNumber(value['breakProgress'])) ||
    typeof value['playing'] !== 'boolean' ||
    typeof value['panel'] !== 'boolean'
  ) {
    return failure('invalid-schema', 'State JSON contains a field with the wrong type.')
  }

  const candidate = toHarnessState(value)
  const parsed = parseHarnessUrl(serializeHarnessState(candidate), registry)
  const selectionIssue = parsed.issues.find(
    (issue) => issue.field === 'screen' || issue.field === 'scenario',
  )
  if (selectionIssue !== undefined) {
    return failure('unknown-scenario', 'State JSON names a screen or scenario not in the registry.')
  }
  if (parsed.issues.length > 0) {
    return failure('invalid-schema', 'State JSON contains a value outside its allowed range.')
  }

  return { ok: true, state: parsed.state }
}
