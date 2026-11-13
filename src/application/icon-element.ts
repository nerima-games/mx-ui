/** A health or hunger icon backed by the generated HUD asset set. */

import {
  type AttributeCell,
  type StyleCell,
  attributeCell,
  styleCell,
  writeAttribute,
  writeHidden,
  writeStyle,
} from './dom-write.js'
import { DEFAULT_UI_LANGUAGE, type UiMessageKey, translateUiMessage } from '../domain/ui-language.js'
import { type DomElement, type DomElementFactory } from './dom-surface.js'
import { type HudIconName, hudIconDataUri } from './hud-icons.generated.js'
import { PALETTE_VAR, type PaletteTokenName } from './palette-css.js'
import { type IconState } from '../domain/hud-view-model.js'
import { Result } from 'effect'

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

const configureMaskSource = (layer: DomElement, name: HudIconName): void => {
  layer.style.setProperty('mask-image', iconMaskSource(name))
  layer.style.setProperty('mask-mode', 'alpha')
  layer.style.setProperty('mask-position', 'center')
  layer.style.setProperty('mask-repeat', 'no-repeat')
  layer.style.setProperty('mask-size', 'contain')
}

const configureMaskLayer = (layer: DomElement, name: HudIconName, color: string): void => {
  layer.setAttribute('aria-hidden', 'true')
  layer.style.setProperty('background-color', color)
  layer.style.setProperty('display', 'inline-block')
  layer.style.setProperty('height', '32px')
  layer.style.setProperty('image-rendering', 'pixelated')
  layer.style.setProperty('inset', '0')
  configureMaskSource(layer, name)
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

const createMaskLayer = (
  factory: DomElementFactory,
  name: HudIconName,
  color: string,
): DomElement => {
  const layer = factory.createElement('span')
  configureMaskLayer(layer, name, color)
  return layer
}

type IconArtLayers = Readonly<{ fill: DomElement; initialArt: HudIconName }>

const createIconArtLayers = (
  factory: DomElementFactory,
  art: DomElement,
  kind: IconKind,
): IconArtLayers => {
  const initialArt = DEFAULT_ICON[kind].empty
  const outline = createMaskLayer(factory, initialArt, PALETTE_VAR.iconEmpty)
  const fill = createMaskLayer(factory, initialArt, PALETTE_VAR.iconEmpty)
  fill.style.setProperty('transform', 'scale(0.84)')
  fill.style.setProperty('transform-origin', 'center')
  art.appendChild(outline)
  art.appendChild(fill)
  return { fill, initialArt }
}

type IconArtCells = Readonly<{
  artColorFlag: StyleCell
  artClipFlag: StyleCell
  artMaskFlag: StyleCell
  artVisibilityFlag: StyleCell
  artNameFlag: AttributeCell
  artSourceFlag: AttributeCell
}>

const createIconArtCells = (art: DomElement, fill: DomElement): IconArtCells => ({
  artClipFlag: styleCell(fill, 'clip-path'),
  artColorFlag: styleCell(fill, 'background-color'),
  artMaskFlag: styleCell(fill, 'mask-image'),
  artNameFlag: attributeCell(art, 'data-hud-icon'),
  artSourceFlag: attributeCell(art, 'src'),
  artVisibilityFlag: styleCell(fill, 'display'),
})

const initializeIconArtCells = (cells: IconArtCells, initialArt: HudIconName): void => {
  writeAttribute(cells.artNameFlag, initialArt)
  writeAttribute(cells.artSourceFlag, hudIconDataUri(initialArt))
  writeStyle(cells.artColorFlag, PALETTE_VAR.iconEmpty)
  writeStyle(cells.artClipFlag, NO_ICON_CLIP)
  writeStyle(cells.artVisibilityFlag, 'none')
}

const createIconArt = (
  factory: DomElementFactory,
  kind: IconKind,
): Readonly<IconArtCells & { art: DomElement; initialArt: HudIconName }> => {
  const art = factory.createElement('span')
  configureIconArt(art)
  const { fill, initialArt } = createIconArtLayers(factory, art, kind)
  const cells = createIconArtCells(art, fill)
  initializeIconArtCells(cells, initialArt)
  return { art, initialArt, ...cells }
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

const updateIconIdentity = (icon: IconElement, name: HudIconName, maskName: HudIconName): void => {
  if (icon.previousArt !== name) {
    icon.previousArt = name
    writeAttribute(icon.artNameFlag, name)
    writeAttribute(icon.artSourceFlag, hudIconDataUri(name))
    writeStyle(icon.artMaskFlag, iconMaskSource(maskName))
  }
}

const updateIconPalette = (icon: IconElement, paletteToken: PaletteTokenName): void => {
  if (icon.previousPaletteToken !== paletteToken) {
    icon.previousPaletteToken = paletteToken
    writeStyle(icon.artColorFlag, PALETTE_VAR[paletteToken])
  }
}

const updateIconClip = (icon: IconElement, state: IconState): void => {
  if (state === 'half') {
    writeStyle(icon.artClipFlag, HALF_ICON_CLIP)
    return
  }
  writeStyle(icon.artClipFlag, NO_ICON_CLIP)
}

const updateIconVisibility = (icon: IconElement, state: IconState): void => {
  if (state === 'empty') {
    writeStyle(icon.artVisibilityFlag, 'none')
    return
  }
  writeStyle(icon.artVisibilityFlag, 'inline-block')
}

type IconArtUpdate = Readonly<{
  icon: IconElement
  name: HudIconName
  maskName: HudIconName
  paletteToken: PaletteTokenName
  state: IconState
}>

const updateIconArt = (update: IconArtUpdate): void => {
  updateIconIdentity(update.icon, update.name, update.maskName)
  updateIconPalette(update.icon, update.paletteToken)
  updateIconClip(update.icon, update.state)
  updateIconVisibility(update.icon, update.state)
}

type IconStateProjection = Readonly<{
  icon: IconElement
  state: IconState
  healthCondition: HealthCondition | undefined
  previousCondition: HealthCondition | null
  name: HudIconName
}>

const projectIconState = ({ icon, state, healthCondition, previousCondition, name }: IconStateProjection): void => {
  icon.previous = state
  icon.previousCondition = previousCondition
  writeAttribute(icon.stateFlag, state)
  updateIconArt({
    icon,
    maskName: fillMaskName(icon.kind, state, healthCondition),
    name,
    paletteToken: iconPaletteToken(icon.kind, state, healthCondition),
    state,
  })
}

const previousConditionFor = (healthCondition: HealthCondition | undefined): HealthCondition | null => {
  if (typeof healthCondition === 'undefined') {
    return null
  }
  return healthCondition
}

export const updateIconElement = (
  icon: IconElement,
  state: IconState,
  healthCondition?: HealthCondition,
): Result.Result<void, Readonly<{ _tag: 'InvalidIconElementInput'; field: 'healthCondition' }>> => {
  if (Object.is(healthCondition, null)) {
    return Result.fail({ _tag: 'InvalidIconElementInput', field: 'healthCondition' })
  }
  const previousCondition = previousConditionFor(healthCondition)
  writeHidden(icon.hiddenFlag, false)
  const name = iconName(icon.kind, state, healthCondition)
  if (
    icon.previous === state &&
    icon.previousCondition === previousCondition &&
    icon.previousArt === name
  ) {
    return Result.void
  }
  projectIconState({ healthCondition, icon, name, previousCondition, state })
  return Result.void
}
