/** Palette values and CSS rendering helpers. */

/** SRGB channels in 0–255. */
export type Rgb = readonly [number, number, number]

/** The smallest and largest value an sRGB channel can hold. */
const RGB_MIN = 0
const RGB_MAX = 255

const clampChannel = (value: number): number => {
  if (Number.isNaN(value)) {
    return RGB_MIN
  }
  return Math.min(RGB_MAX, Math.max(RGB_MIN, Math.round(value)))
}

const HEX_RADIX = 16
const HEX_CHANNEL_WIDTH = 2

/** `#rrggbb`. */
export const hex = (color: Rgb): string =>
  `#${color
    .map((channel) => clampChannel(channel).toString(HEX_RADIX).padStart(HEX_CHANNEL_WIDTH, '0'))
    .join('')}`

const RED_INDEX = 0
const GREEN_INDEX = 1
const BLUE_INDEX = 2
/** Fully opaque, and the default when no `alpha` is given. */
const ALPHA_OPAQUE = 1
const ALPHA_TRANSPARENT = 0

const resolveOpacity = (alpha: number): number => {
  if (Number.isNaN(alpha)) {
    return ALPHA_OPAQUE
  }
  return Math.min(ALPHA_OPAQUE, Math.max(ALPHA_TRANSPARENT, alpha))
}

/** A CSS colour, opaque or not. */
export const cssColor = (color: Rgb, alpha: number = ALPHA_OPAQUE): string => {
  const red = clampChannel(color[RED_INDEX])
  const green = clampChannel(color[GREEN_INDEX])
  const blue = clampChannel(color[BLUE_INDEX])
  const opacity = resolveOpacity(alpha)
  if (opacity >= ALPHA_OPAQUE) {
    return hex(color)
  }
  return `rgba(${String(red)}, ${String(green)}, ${String(blue)}, ${String(opacity)})`
}

const SCRIM_RED = 10
const SCRIM_GREEN = 14
const SCRIM_BLUE = 18
export const SCRIM: Rgb = [SCRIM_RED, SCRIM_GREEN, SCRIM_BLUE]
export const SCRIM_ALPHA = 0.9
const SURFACE_GRAY = 30
export const SURFACE: Rgb = [SURFACE_GRAY, SURFACE_GRAY, SURFACE_GRAY]
const SURFACE_RAISED_GRAY = 42
export const SURFACE_RAISED: Rgb = [SURFACE_RAISED_GRAY, SURFACE_RAISED_GRAY, SURFACE_RAISED_GRAY]
const METER_TRACK_GRAY = 27
export const METER_TRACK: Rgb = [METER_TRACK_GRAY, METER_TRACK_GRAY, METER_TRACK_GRAY]
export const SLOT_FILL: Rgb = [RGB_MIN, RGB_MIN, RGB_MIN]
export const SLOT_FILL_ALPHA = 0.55

const INK_GRAY = 240
export const INK: Rgb = [INK_GRAY, INK_GRAY, INK_GRAY]
const INK_MUTED_GRAY = 200
export const INK_MUTED: Rgb = [INK_MUTED_GRAY, INK_MUTED_GRAY, INK_MUTED_GRAY]
const INK_FAINT_GRAY = 171
export const INK_FAINT: Rgb = [INK_FAINT_GRAY, INK_FAINT_GRAY, INK_FAINT_GRAY]

const HEART_RED = 224
const HEART_GREEN_BLUE = 40
export const HEART: Rgb = [HEART_RED, HEART_GREEN_BLUE, HEART_GREEN_BLUE]
const SHANK_RED = 209
const SHANK_GREEN = 139
const SHANK_BLUE = 47
export const SHANK: Rgb = [SHANK_RED, SHANK_GREEN, SHANK_BLUE]
const ICON_EMPTY_GRAY = 118
export const ICON_EMPTY: Rgb = [ICON_EMPTY_GRAY, ICON_EMPTY_GRAY, ICON_EMPTY_GRAY]

const XP_FILL_RED = 79
const XP_FILL_GREEN = 174
const XP_FILL_BLUE = 36
export const XP_FILL: Rgb = [XP_FILL_RED, XP_FILL_GREEN, XP_FILL_BLUE]
const XP_FILL_HIGHLIGHT_RED = 168
const XP_FILL_HIGHLIGHT_BLUE = 88
export const XP_FILL_HIGHLIGHT: Rgb = [XP_FILL_HIGHLIGHT_RED, RGB_MAX, XP_FILL_HIGHLIGHT_BLUE]
const XP_LEVEL_RED = 125
const XP_LEVEL_BLUE = 79
export const XP_LEVEL: Rgb = [XP_LEVEL_RED, RGB_MAX, XP_LEVEL_BLUE]

const SLOT_BORDER_GRAY = 139
export const SLOT_BORDER: Rgb = [SLOT_BORDER_GRAY, SLOT_BORDER_GRAY, SLOT_BORDER_GRAY]
export const SLOT_SELECTED: Rgb = [RGB_MAX, RGB_MAX, RGB_MAX]

const STATUS_OK_RED = 215
const STATUS_OK_GREEN = 247
const STATUS_OK_BLUE = 194
export const STATUS_OK: Rgb = [STATUS_OK_RED, STATUS_OK_GREEN, STATUS_OK_BLUE]
const STATUS_BUSY_RED = 232
const STATUS_BUSY_GREEN = 192
const STATUS_BUSY_BLUE = 64
export const STATUS_BUSY: Rgb = [STATUS_BUSY_RED, STATUS_BUSY_GREEN, STATUS_BUSY_BLUE]
const STATUS_ALERT_RED = 244
const STATUS_ALERT_GREEN = 85
const STATUS_ALERT_BLUE = 63
export const STATUS_ALERT: Rgb = [STATUS_ALERT_RED, STATUS_ALERT_GREEN, STATUS_ALERT_BLUE]
export const DURABILITY_HIGH: Rgb = STATUS_OK
export const DURABILITY_LOW: Rgb = STATUS_ALERT

const FOCUS_RING_GREEN = 224
const FOCUS_RING_BLUE = 144
export const FOCUS_RING: Rgb = [RGB_MAX, FOCUS_RING_GREEN, FOCUS_RING_BLUE]
const FOCUS_RING_SHADOW_RED = 20
const FOCUS_RING_SHADOW_GREEN = 29
const FOCUS_RING_SHADOW_BLUE = 25
export const FOCUS_RING_SHADOW: Rgb = [
  FOCUS_RING_SHADOW_RED,
  FOCUS_RING_SHADOW_GREEN,
  FOCUS_RING_SHADOW_BLUE,
]
