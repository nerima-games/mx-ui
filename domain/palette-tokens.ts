/** Palette values and CSS rendering helpers. */

/** sRGB channels in 0–255. */
export type Rgb = readonly [number, number, number]

const clampChannel = (value: number): number =>
  Number.isNaN(value) ? 0 : Math.min(255, Math.max(0, Math.round(value)))

/** `#rrggbb`. */
export const hex = (color: Rgb): string =>
  `#${color.map((channel) => clampChannel(channel).toString(16).padStart(2, '0')).join('')}`

/** A CSS colour, opaque or not. */
export const cssColor = (color: Rgb, alpha = 1): string => {
  const [red, green, blue] = [clampChannel(color[0]), clampChannel(color[1]), clampChannel(color[2])]
  const opacity = Number.isNaN(alpha) ? 1 : Math.min(1, Math.max(0, alpha))
  return opacity >= 1
    ? hex(color)
    : `rgba(${String(red)}, ${String(green)}, ${String(blue)}, ${String(opacity)})`
}

export const SCRIM: Rgb = [10, 14, 18]
export const SCRIM_ALPHA = 0.9
export const SURFACE: Rgb = [30, 30, 30]
export const SURFACE_RAISED: Rgb = [42, 42, 42]
export const METER_TRACK: Rgb = [27, 27, 27]
export const SLOT_FILL: Rgb = [0, 0, 0]
export const SLOT_FILL_ALPHA = 0.55

export const INK: Rgb = [240, 240, 240]
export const INK_MUTED: Rgb = [200, 200, 200]
export const INK_FAINT: Rgb = [171, 171, 171]

export const HEART: Rgb = [224, 40, 40]
export const SHANK: Rgb = [209, 139, 47]
export const ICON_EMPTY: Rgb = [118, 118, 118]

export const XP_FILL: Rgb = [79, 174, 36]
export const XP_FILL_HIGHLIGHT: Rgb = [168, 255, 88]
export const XP_LEVEL: Rgb = [125, 255, 79]

export const SLOT_BORDER: Rgb = [139, 139, 139]
export const SLOT_SELECTED: Rgb = [255, 255, 255]

export const STATUS_OK: Rgb = [215, 247, 194]
export const STATUS_BUSY: Rgb = [232, 192, 64]
export const STATUS_ALERT: Rgb = [244, 85, 63]
export const DURABILITY_HIGH: Rgb = STATUS_OK
export const DURABILITY_LOW: Rgb = STATUS_ALERT

export const FOCUS_RING: Rgb = [255, 224, 144]
export const FOCUS_RING_SHADOW: Rgb = [20, 29, 25]
