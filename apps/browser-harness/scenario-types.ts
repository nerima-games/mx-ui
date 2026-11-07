import type { DomElement, DomElementFactory } from '../../src/application/dom-surface'
import type { ColorVisionMode, MotionPreference } from '../../src/domain/accessibility'

export type ScreenId = string
export type ScenarioId = string
export type LayoutMode = 'single' | 'gallery'
export type ContrastMode = 'normal' | 'more' | 'forced'
export type BackgroundMode = 'white' | 'black' | 'mid' | 'checker'
export type DevicePixelRatio = 1 | 2 | 3
export type TextScale = 100 | 150 | 200
export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2 | 4

export type HarnessEnvironment = {
  readonly motion: MotionPreference
  readonly cvd: ColorVisionMode
  readonly width: number
  readonly height: number
  readonly safe: number
  readonly dpr: DevicePixelRatio
  readonly textScale: TextScale
  readonly contrast: ContrastMode
  readonly background: BackgroundMode
}

export type HarnessUrlState = HarnessEnvironment & {
  readonly screen: ScreenId
  readonly scenario: ScenarioId
  readonly layout: LayoutMode
  readonly time: number
  readonly playing: boolean
  readonly speed: PlaybackSpeed
  readonly panel: boolean
  readonly breakProgress?: number
}

export type ScenarioContext = {
  readonly factory: DomElementFactory
  readonly host: DomElement
  readonly environment: HarnessEnvironment
  readonly time: number
  readonly emitIntent: (intent: unknown) => void
  readonly breakProgress?: number
}

export type ScenarioMount = {
  readonly root: DomElement
  /** Redraw time-dependent state from the injected virtual time. */
  readonly setTime: (seconds: number) => void
  /** Release listeners and timers before the host is removed. */
  readonly dispose: () => void
  readonly viewModel?: () => unknown
}

export type ScenarioDefinition = {
  readonly screen: ScreenId
  readonly id: ScenarioId
  readonly title: string
  readonly surface: string
  readonly isDefault: boolean
  readonly mount: (context: ScenarioContext) => ScenarioMount
}
