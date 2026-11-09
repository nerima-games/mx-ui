import { DEFAULT_UI_LANGUAGE, type UiLanguage, type UiMessageText, translateUiMessage } from './ui-language.js'
import { Result, Schema } from 'effect'
import { SaveSliceIdSchema, SaveVersionSchema, WorldIdSchema } from '@nerima-games/mc-kernel'
import {
  type WorldNameText,
  WorldNameTextSchema,
  type WorldSeedText,
  WorldSeedTextSchema,
  type WorldSeedValue,
  WorldSeedValueSchema,
  type WorldTypeId,
  WorldTypeIdSchema,
  decodeWorldNameText,
  decodeWorldSeedText,
  decodeWorldTypeId,
} from './ui3-brand-schemas.js'

export type { WorldNameText, WorldSeedText, WorldSeedValue, WorldTypeId } from './ui3-brand-schemas.js'
export { decodeWorldNameText, decodeWorldSeedText, decodeWorldTypeId }
const worldTypeId = Schema.decodeUnknownSync(WorldTypeIdSchema)

const worldSeedText = Schema.decodeUnknownSync(WorldSeedTextSchema)
const worldSeedValue = Schema.decodeUnknownSync(WorldSeedValueSchema)
const worldNameText = Schema.decodeUnknownSync(WorldNameTextSchema)

export type WorldId = Schema.Schema.Type<typeof WorldIdSchema>
export type SaveSliceId = Schema.Schema.Type<typeof SaveSliceIdSchema>
export type SaveVersion = Schema.Schema.Type<typeof SaveVersionSchema>

export type MenuPanel = 'root' | 'new-world' | 'load-world'
export const MENU_PANELS: ReadonlyArray<MenuPanel> = ['root', 'new-world', 'load-world']

export type RootEntry = 'single-player' | 'multiplayer' | 'settings' | 'exit'
export const ROOT_ENTRIES: ReadonlyArray<RootEntry> = ['single-player', 'multiplayer', 'settings', 'exit']

export type GameMode = 'survival' | 'creative'
export const GAME_MODES: ReadonlyArray<GameMode> = ['survival', 'creative']

export type GameDifficulty = 'peaceful' | 'easy' | 'normal' | 'hard'
export const GAME_DIFFICULTIES: ReadonlyArray<GameDifficulty> = ['peaceful', 'easy', 'normal', 'hard']

export type WorldTypeOption = {
  readonly value: WorldTypeId
  readonly label: Readonly<Record<UiLanguage, UiMessageText>>
}

export type WorldSeed = { readonly kind: 'random' } | { readonly kind: 'fixed'; readonly value: WorldSeedValue }

export type WorldSeedFailure = {
  readonly _tag: 'InvalidWorldSeed'
  readonly input: WorldSeedText
  readonly reason: 'unsafe-integer'
} | {
  readonly _tag: 'InvalidWorldSeedInput'
  readonly reason: 'not-string'
}

const FNV1A_OFFSET_BASIS = 2166136261
const FNV1A_PRIME = 16777619
const UINT32_RANGE = 0x1_0000_0000
const BYTE_RANGE = 0x100
const ZERO = 0
const ONE = 1
const TWO = 2
const EMPTY_SEED_LENGTH = 0
const DECIMAL_INTEGER_PATTERN = /^[+-]?\d+$/u

const unsignedWord = (value: number): number => {
  if (value < ZERO) {
    return value + UINT32_RANGE
  }
  return value
}

const xorByteBits = (left: number, right: number, place: number): number => {
  if (left === ZERO && right === ZERO) {
    return ZERO
  }
  let current = ZERO
  if (left % TWO !== right % TWO) {
    current = place
  }
  return current + xorByteBits(Math.floor(left / TWO), Math.floor(right / TWO), place * TWO)
}

const xorLowByte = (leftByte: number, rightByte: number): number => xorByteBits(leftByte, rightByte, ONE)

const xorByte = (word: number, byte: number): number => {
  const unsigned = unsignedWord(word)
  const lowByte = unsigned % BYTE_RANGE
  const highBytes = unsigned - lowByte
  return highBytes + xorLowByte(lowByte, byte)
}

type IntegerSeedAttempt = WorldSeed | { readonly failure: WorldSeedFailure } | null

const parseIntegerSeed = (input: WorldSeedText, trimmed: string): IntegerSeedAttempt => {
  if (!DECIMAL_INTEGER_PATTERN.test(trimmed)) {
    return null
  }
  const integer = Number(trimmed)
  if (Number.isSafeInteger(integer)) {
    return { kind: 'fixed', value: worldSeedValue(integer) }
  }
  return { failure: { _tag: 'InvalidWorldSeed', input, reason: 'unsafe-integer' } }
}

const hashTextSeed = (input: WorldSeedText): WorldSeed => {
  let hash = FNV1A_OFFSET_BASIS
  for (const byte of new TextEncoder().encode(input)) {
    hash = Math.imul(xorByte(hash, byte), FNV1A_PRIME)
  }
  return { kind: 'fixed', value: worldSeedValue(unsignedWord(hash)) }
}

const decodeWorldSeedInput = (input: unknown): Result.Result<WorldSeedText, WorldSeedFailure> => {
  const decoded = decodeWorldSeedText(input)
  if (Result.isFailure(decoded)) {
    return Result.fail({ _tag: 'InvalidWorldSeedInput', reason: 'not-string' })
  }
  return Result.succeed(decoded.success)
}

const parseDecodedWorldSeed = (seed: WorldSeedText): Result.Result<WorldSeed, WorldSeedFailure> => {
  const trimmed = seed.trim()
  if (trimmed.length === EMPTY_SEED_LENGTH) {
    return Result.succeed({ kind: 'random' })
  }
  const integerSeed = parseIntegerSeed(seed, trimmed)
  if (integerSeed === null) {
    return Result.succeed(hashTextSeed(seed))
  }
  if ('failure' in integerSeed) {
    return Result.fail(integerSeed.failure)
  }
  return Result.succeed(integerSeed)
}

/** Blank input requests a random seed; text seeds hash their original UTF-8 bytes. */
export const parseWorldSeed = (input: unknown): Result.Result<WorldSeed, WorldSeedFailure> => {
  const decoded = decodeWorldSeedInput(input)
  if (Result.isFailure(decoded)) {
    return Result.fail(decoded.failure)
  }
  return parseDecodedWorldSeed(decoded.success)
}

export const cycleGameMode = (mode: GameMode): GameMode => {
  if (mode === 'survival') {
    return 'creative'
  }
  return 'survival'
}

export const DEFAULT_WORLD_NAME: UiMessageText = translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.world-name.default')

export type NewWorldDraft = {
  readonly name: WorldNameText
  readonly seed: WorldSeedText
  readonly mode: GameMode
  readonly difficulty: GameDifficulty
  readonly worldType: WorldTypeId
}

export const emptyNewWorldDraft: NewWorldDraft = {
  difficulty: 'normal',
  mode: 'survival',
  name: worldNameText(''),
  seed: worldSeedText(''),
  worldType: worldTypeId(''),
}

const EMPTY_NAME_LENGTH = 0

export const worldNameLabel = (
  draft: Pick<NewWorldDraft, 'name'>,
  defaultName: UiMessageText = DEFAULT_WORLD_NAME,
): WorldNameText | UiMessageText => {
  const trimmed = draft.name.trim()
  if (trimmed.length > EMPTY_NAME_LENGTH) {
    return worldNameText(trimmed)
  }
  return defaultName
}

export type MainMenuState = {
  readonly panel: MenuPanel
  readonly draft: NewWorldDraft
}

export type SavedWorld = {
  readonly sessionId: WorldId
  readonly name: WorldNameText
}

/** Structurally compatible with mc-save's `ListedSaveFailure` on main. */
export type UnreadableSave = {
  readonly _tag: 'SaveDecodeError'
  readonly key: WorldId
  readonly format: SaveSliceId
  readonly version: SaveVersion
  readonly reason: UiMessageText
}

export type CreateWorldRequest = {
  readonly name: WorldNameText | UiMessageText
  readonly seed: WorldSeed
  readonly mode: GameMode
  readonly difficulty: GameDifficulty
  readonly worldType?: WorldTypeId
}

export const initialMainMenuState: MainMenuState = {
  draft: emptyNewWorldDraft,
  panel: 'root',
}

export const openPanel = (state: MainMenuState, panel: MenuPanel): MainMenuState => {
  if (state.panel === panel) {
    return state
  }
  return { ...state, panel }
}

export const backToRoot = (state: MainMenuState): MainMenuState => openPanel(state, 'root')

export const nameWorld = (state: MainMenuState, name: WorldNameText): MainMenuState => ({
  ...state,
  draft: { ...state.draft, name },
})

export const seedWorld = (state: MainMenuState, seed: WorldSeedText): MainMenuState => ({
  ...state,
  draft: { ...state.draft, seed },
})

export const setWorldType = (state: MainMenuState, worldType: WorldTypeId): MainMenuState => ({
  ...state,
  draft: { ...state.draft, worldType },
})

export const setWorldDifficulty = (state: MainMenuState, difficulty: GameDifficulty): MainMenuState => ({
  ...state,
  draft: { ...state.draft, difficulty },
})

export const cycleWorldMode = (state: MainMenuState): MainMenuState => ({
  ...state,
  draft: { ...state.draft, mode: cycleGameMode(state.draft.mode) },
})

export type MainMenuViewModel = {
  readonly panel: MenuPanel
  readonly worldNameInput: WorldNameText
  readonly worldName: WorldNameText | UiMessageText
  readonly seedInput: WorldSeedText
  readonly mode: GameMode
  readonly difficulty: GameDifficulty
  readonly worldType: WorldTypeId
  readonly worldTypes: ReadonlyArray<WorldTypeOption>
  readonly savedWorlds: ReadonlyArray<SavedWorld>
  readonly unreadableSaves: ReadonlyArray<UnreadableSave>
}

export const mainMenuViewModel = (
  ...[
    state,
    savedWorlds = [],
    worldTypes = [],
    unreadableSaves = [],
  ]: [
    state: MainMenuState,
    savedWorlds?: ReadonlyArray<SavedWorld>,
    worldTypes?: ReadonlyArray<WorldTypeOption>,
    unreadableSaves?: ReadonlyArray<UnreadableSave>,
  ]
): MainMenuViewModel => {
  const selectedWorldType = worldTypes.find((option) =>
    typeof option !== 'undefined' && option.value === state.draft.worldType,
  )
  const firstAvailableWorldType = worldTypes.find((option) => typeof option !== 'undefined')
  return {
    difficulty: state.draft.difficulty,
    mode: state.draft.mode,
    panel: state.panel,
    savedWorlds,
    seedInput: state.draft.seed,
    unreadableSaves,
    worldName: worldNameLabel(state.draft),
    worldNameInput: state.draft.name,
    worldType: worldTypeId(selectedWorldType?.value ?? firstAvailableWorldType?.value ?? ''),
    worldTypes,
  }
}
