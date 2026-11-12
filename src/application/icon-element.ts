/** A health or hunger icon backed by the generated HUD asset set. */

import {
  type StyleCell,
  type AttributeCell,
  attributeCell,
  styleCell,
  writeAttribute,
  writeHidden,
  writeStyle,
} from './dom-write.js'
import { DEFAULT_UI_LANGUAGE, type UiMessageKey, translateUiMessage } from '../domain/ui-language.js'
import type { DomElement, DomElementFactory } from './dom-surface.js'
import { type HudIconName, hudIconDataUri } from './hud-icons.generated.js'
import { type IconState } from '../domain/hud-view-model.js'
import { PALETTE_VAR, type PaletteTokenName } from './palette-css.js'

export type IconKind = 'heart' | 'shank'
type HealthCondition = 'poison' | 'wither'
type FilledIconState = Exclude<IconState, 'empty'>

const ICON_ROW_LABELS: Readonly<Record<IconKind, string>> = {
  heart: translateUiMessage(DEFAULT_UI_LANGUAGE, 'hud.health'),
  shank: translateUiMessage(DEFAULT_UI_LANGUAGE, 'hud.hunger'),
}

export const ICON_ROW_LABEL: Readonly<Record<IconKind, string>> = ICON_ROW_LABELS

export const ICON_ROW_MESSAGE_KEY: Readonly<Record<IconKind, UiMessageKey>> = {
  heart: 'hud.health',
  shank: 'hud.hunger',
}

const DEFAULT_ICON: Readonly<Record<IconKind, Readonly<Record<IconState, HudIconName>>>> = {
  heart: {
    empty: 'health-empty',
    full: 'health-full',
    half: 'health-half',
  },
  shank: {
    empty: 'hunger-empty',
    full: 'hunger-full',
    half: 'hunger-half',
  },
}

const CONDITION_ICON: Readonly<Record<HealthCondition, Readonly<Record<FilledIconState, HudIconName>>>> = {
  poison: {
    full: 'poison-full',
    half: 'poison-half',
  },
  wither: {
    full: 'wither-full',
    half: 'wither-half',
  },
}

const NO_ICON_CLIP = 'none'
const HALF_ICON_CLIP = 'inset(0 50% 0 0)'

const iconName = (
  kind: IconKind,
  state: IconState,
  healthCondition?: HealthCondition,
): HudIconName => {
  if (kind === 'heart' && state !== 'empty' && typeof healthCondition !== 'undefined') {
    return CONDITION_ICON[healthCondition][state]
  }
  return DEFAULT_ICON[kind][state]
}

const fillMaskName = (
  kind: IconKind,
  state: IconState,
  healthCondition?: HealthCondition,
): HudIconName => {
  if (state !== 'half') {
    return iconName(kind, state, healthCondition)
  }
  if (kind === 'shank') {
    return 'hunger-full'
  }
  if (healthCondition === 'poison') {
    return 'poison-full'
  }
  if (healthCondition === 'wither') {
    return 'wither-full'
  }
  return 'health-full'
}

const iconPaletteToken = (
  kind: IconKind,
  state: IconState,
  healthCondition?: HealthCondition,
): PaletteTokenName => {
  if (kind === 'heart' && state !== 'empty' && typeof healthCondition !== 'undefined') {
    if (healthCondition === 'poison') {
      return 'statusAlert'
    }
    return 'inkMuted'
  }
  if (state === 'empty') {
    return 'iconEmpty'
  }
  if (kind === 'heart') {
    return 'heart'
  }
  return 'shank'
}

const iconMaskSource = (name: HudIconName): string => `url("${hudIconDataUri(name)}")`

const configureIconArt = (art: DomElement): void => {
  art.setAttribute('data-mx-ui', 'icon-art')
  art.setAttribute('aria-hidden', 'true')
  art.style.setProperty('display', 'inline-block')
  art.style.setProperty('height', '32px')
  art.style.setProperty('image-rendering', 'pixelated')
  art.style.setProperty('line-height', '0')
  art.style.setProperty('position', 'relative')
  art.style.setProperty('width', '32px')
}

const configureMaskLayer = (layer: DomElement, name: HudIconName, color: string): void => {
  layer.setAttribute('aria-hidden', 'true')
  layer.style.setProperty('background-color', color)
  layer.style.setProperty('display', 'inline-block')
  layer.style.setProperty('height', '32px')
  layer.style.setProperty('image-rendering', 'pixelated')
  layer.style.setProperty('inset', '0')
  layer.style.setProperty('mask-image', iconMaskSource(name))
  layer.style.setProperty('mask-mode', 'alpha')
  layer.style.setProperty('mask-position', 'center')
  layer.style.setProperty('mask-repeat', 'no-repeat')
  layer.style.setProperty('mask-size', 'contain')
  layer.style.setProperty('position', 'absolute')
  layer.style.setProperty('width', '32px')
}

export type IconElement = {
  readonly kind: IconKind
  readonly root: DomElement
  readonly art: DomElement
  readonly stateFlag: AttributeCell
  readonly hiddenFlag: AttributeCell
  readonly artNameFlag: AttributeCell
  readonly artSourceFlag: AttributeCell
  readonly artMaskFlag: StyleCell
  readonly artColorFlag: StyleCell
  readonly artClipFlag: StyleCell
  readonly artVisibilityFlag: StyleCell
  previous: IconState | null
  previousCondition: HealthCondition | null
  previousArt: HudIconName | null
  previousPaletteToken: PaletteTokenName | null
}

const createIconRoot = (factory: DomElementFactory, kind: IconKind): DomElement => {
  const root = factory.createElement('span')
  root.setAttribute('data-mx-ui', 'icon')
  root.setAttribute('data-icon', kind)
  root.style.setProperty('display', 'inline-block')
  root.style.setProperty('line-height', '0')
  return root
}

const createIconArt = (
  factory: DomElementFactory,
  kind: IconKind,
): Readonly<{
  art: DomElement
  artColorFlag: StyleCell
  artClipFlag: StyleCell
  artMaskFlag: StyleCell
  artVisibilityFlag: StyleCell
  artNameFlag: AttributeCell
  artSourceFlag: AttributeCell
  initialArt: HudIconName
}> => {
  const art = factory.createElement('span')
  configureIconArt(art)
  const initialArt = DEFAULT_ICON[kind].empty
  const outline = factory.createElement('span')
  configureMaskLayer(outline, DEFAULT_ICON[kind].empty, PALETTE_VAR.iconEmpty)
  const fill = factory.createElement('span')
  configureMaskLayer(fill, initialArt, PALETTE_VAR.iconEmpty)
  fill.style.setProperty('transform', 'scale(0.84)')
  fill.style.setProperty('transform-origin', 'center')
  art.appendChild(outline)
  art.appendChild(fill)
  const artNameFlag = attributeCell(art, 'data-hud-icon')
  const artSourceFlag = attributeCell(art, 'src')
  const artMaskFlag = styleCell(fill, 'mask-image')
  const artColorFlag = styleCell(fill, 'background-color')
  const artClipFlag = styleCell(fill, 'clip-path')
  const artVisibilityFlag = styleCell(fill, 'display')
  writeAttribute(artNameFlag, initialArt)
  writeAttribute(artSourceFlag, hudIconDataUri(initialArt))
  writeStyle(artColorFlag, PALETTE_VAR.iconEmpty)
  writeStyle(artClipFlag, NO_ICON_CLIP)
  writeStyle(artVisibilityFlag, 'none')
  return {
    art,
    artClipFlag,
    artColorFlag,
    artMaskFlag,
    artNameFlag,
    artSourceFlag,
    artVisibilityFlag,
    initialArt,
  }
}

const buildIconElement = (factory: DomElementFactory, kind: IconKind): IconElement => {
  const root = createIconRoot(factory, kind)
  const {
    art,
    artClipFlag,
    artColorFlag,
    artMaskFlag,
    artNameFlag,
    artSourceFlag,
    artVisibilityFlag,
    initialArt,
  } = createIconArt(factory, kind)
  root.appendChild(art)

  return {
    art,
    artClipFlag,
    artColorFlag,
    artMaskFlag,
    artNameFlag,
    artSourceFlag,
    artVisibilityFlag,
    hiddenFlag: attributeCell(root, 'hidden'),
    kind,
    previous: null,
    previousArt: initialArt,
    previousCondition: null,
    previousPaletteToken: 'iconEmpty',
    root,
    stateFlag: attributeCell(root, 'data-icon-state'),
  }
}

export const createIconElement = (factory: DomElementFactory, kind: IconKind): IconElement =>
  buildIconElement(factory, kind)

export const retireIconElement = (icon: IconElement): void => {
  writeHidden(icon.hiddenFlag, true)
  writeAttribute(icon.stateFlag)
  icon.previous = null
  icon.previousCondition = null
}

const updateIconArt = (
  icon: IconElement,
  name: HudIconName,
  maskName: HudIconName,
  paletteToken: PaletteTokenName,
  state: IconState,
): void => {
  if (icon.previousArt !== name) {
    icon.previousArt = name
    writeAttribute(icon.artNameFlag, name)
    writeAttribute(icon.artSourceFlag, hudIconDataUri(name))
    writeStyle(icon.artMaskFlag, iconMaskSource(maskName))
  }
  if (icon.previousPaletteToken !== paletteToken) {
    icon.previousPaletteToken = paletteToken
    writeStyle(icon.artColorFlag, PALETTE_VAR[paletteToken])
  }
  writeStyle(icon.artClipFlag, state === 'half' ? HALF_ICON_CLIP : NO_ICON_CLIP)
  writeStyle(icon.artVisibilityFlag, state === 'empty' ? 'none' : 'inline-block')
}

export const updateIconElement = (
  icon: IconElement,
  state: IconState,
  healthCondition?: HealthCondition,
): void => {
  writeHidden(icon.hiddenFlag, false)
  const name = iconName(icon.kind, state, healthCondition)
  if (
    icon.previous === state &&
    icon.previousCondition === (healthCondition ?? null) &&
    icon.previousArt === name
  ) {
    return
  }
  icon.previous = state
  icon.previousCondition = healthCondition ?? null
  writeAttribute(icon.stateFlag, state)
  updateIconArt(
    icon,
    name,
    fillMaskName(icon.kind, state, healthCondition),
    iconPaletteToken(icon.kind, state, healthCondition),
    state,
  )
}
