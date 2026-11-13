import {
  DEFAULT_UI_LANGUAGE,
  type UiLanguage,
  type UiMessageText,
  UiMessageTextSchema,
  translateUiMessage,
} from './ui-language.js'
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

const WorldTypeOptionSchema = Schema.Struct({
  value: WorldTypeIdSchema,
  label: Schema.Struct({ en: UiMessageTextSchema, ja: UiMessageTextSchema }),
})

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
  const omittedWorldName = trimmed.length === EMPTY_NAME_LENGTH
  if (omittedWorldName) {
    // Vanilla treats an omitted world name, including whitespace-only input, as the default name.
    return defaultName
  }
  return worldNameText(trimmed)
}

export type MainMenuState = {
  readonly panel: MenuPanel
  readonly draft: NewWorldDraft
}

export type SavedWorld = {
  readonly sessionId: WorldId
  readonly name: WorldNameText
}

const SavedWorldSchema = Schema.Struct({
  sessionId: WorldIdSchema,
  name: WorldNameTextSchema,
})

/** Local structural mirror of mc-save 0.8.0 until L5 aligns on kernel 0.17.0. */
export type UnreadableSave = {
  readonly _tag: 'SaveDecodeError'
  readonly key: WorldId
  readonly format: SaveSliceId
  readonly version: SaveVersion
  readonly reason: UiMessageText
  readonly record: UnreadableSaveRecord
  readonly repair: UnreadableSaveRepair
}

type UnreadableSaveRecord =
  | { readonly _tag: 'Save'; readonly key: WorldId }
  | { readonly _tag: 'Head'; readonly key: WorldId }
  | { readonly _tag: 'Chunk'; readonly key: WorldId }

type UnreadableSaveRepair = {
  readonly lastHealthyRevisionAvailable: boolean
  readonly discardableChunkKeys: ReadonlyArray<WorldId>
}

const UnreadableSaveRecordSchema = Schema.Union([
  Schema.Struct({ _tag: Schema.Literals(['Save']), key: WorldIdSchema }),
  Schema.Struct({ _tag: Schema.Literals(['Head']), key: WorldIdSchema }),
  Schema.Struct({ _tag: Schema.Literals(['Chunk']), key: WorldIdSchema }),
])

const UnreadableSaveRepairSchema = Schema.Struct({
  lastHealthyRevisionAvailable: Schema.Boolean,
  discardableChunkKeys: Schema.Array(WorldIdSchema),
})

const UnreadableSaveSchema = Schema.Struct({
  _tag: Schema.Literals(['SaveDecodeError']),
  key: WorldIdSchema,
  format: SaveSliceIdSchema,
  version: SaveVersionSchema,
  reason: UiMessageTextSchema,
  record: UnreadableSaveRecordSchema,
  repair: UnreadableSaveRepairSchema,
})

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

type InvalidMainMenuViewModelInput = Readonly<{
  readonly _tag: 'InvalidMainMenuViewModelInput'
  readonly field: string
}>

type MainMenuViewModelArguments = [
  state: MainMenuState,
  savedWorlds?: ReadonlyArray<SavedWorld>,
  worldTypes?: ReadonlyArray<WorldTypeOption>,
  unreadableSaves?: ReadonlyArray<UnreadableSave>,
]
type MainMenuViewModelInputArguments = [
  state: unknown,
  savedWorlds?: unknown,
  worldTypes?: unknown,
  unreadableSaves?: unknown,
]
type MainMenuViewModelValidationArguments = readonly [unknown, unknown, unknown, unknown]
type ValidMainMenuViewModelArguments = readonly [
  MainMenuState,
  ReadonlyArray<SavedWorld>,
  ReadonlyArray<WorldTypeOption>,
  ReadonlyArray<UnreadableSave>,
]

const isRecord = (input: unknown): input is Record<string, unknown> =>
  input !== null && typeof input === 'object' && !Array.isArray(input)

const isMenuPanel = (input: unknown): input is MenuPanel => MENU_PANELS.some((panel) => panel === input)

const isGameMode = (input: unknown): input is GameMode => GAME_MODES.some((mode) => mode === input)

const isGameDifficulty = (input: unknown): input is GameDifficulty =>
  GAME_DIFFICULTIES.some((difficulty) => difficulty === input)

const decodeMainMenuState = (
  input: unknown,
): Result.Result<MainMenuState, Readonly<{ _tag: 'InvalidMainMenuState' }>> => {
  if (!isRecord(input)) {
    return Result.fail({ _tag: 'InvalidMainMenuState' })
  }
  const { draft, panel } = input
  if (!isRecord(draft)) {
    return Result.fail({ _tag: 'InvalidMainMenuState' })
  }
  const name = decodeWorldNameText(draft['name'])
  const seed = decodeWorldSeedText(draft['seed'])
  const worldType = decodeWorldTypeId(draft['worldType'])
  const mode = draft['mode']
  const difficulty = draft['difficulty']
  if (
    !isMenuPanel(panel) ||
    Result.isFailure(name) ||
    Result.isFailure(seed) ||
    !isGameMode(mode) ||
    !isGameDifficulty(difficulty) ||
    Result.isFailure(worldType)
  ) {
    return Result.fail({ _tag: 'InvalidMainMenuState' })
  }
  return Result.succeed({
    panel,
    draft: {
      name: name.success,
      seed: seed.success,
      mode,
      difficulty,
      worldType: worldType.success,
    },
  })
}

type InvalidMainMenuArrayInput = Readonly<{ _tag: 'InvalidMainMenuArrayInput' }>

const decodeMainMenuArray = <Source extends Schema.Codec<unknown>>(
  input: unknown,
  schema: Source,
): Result.Result<ReadonlyArray<Source['Type']>, InvalidMainMenuArrayInput> => {
  if (!Array.isArray(input)) {
    return Result.fail({ _tag: 'InvalidMainMenuArrayInput' })
  }
  const values: Array<Source['Type']> = []
  for (let index = 0; index < input.length; index += 1) {
    const decoded = Schema.decodeUnknownResult(schema)(input[index])
    if (Result.isFailure(decoded)) {
      return Result.fail({ _tag: 'InvalidMainMenuArrayInput' })
    }
    values.push(decoded.success)
  }
  return Result.succeed(values)
}

const decodeWorldTypeOptions = (
  input: unknown,
): Result.Result<ReadonlyArray<WorldTypeOption>, InvalidMainMenuArrayInput> => {
  if (!Array.isArray(input)) {
    return Result.fail({ _tag: 'InvalidMainMenuArrayInput' })
  }
  const options = new Array<WorldTypeOption>(input.length)
  for (let index = 0; index < input.length; index += 1) {
    const option: unknown = input[index]
    if (typeof option === 'undefined') {
      continue
    }
    const decoded = Schema.decodeUnknownResult(WorldTypeOptionSchema)(option)
    if (Result.isFailure(decoded)) {
      return Result.fail({ _tag: 'InvalidMainMenuArrayInput' })
    }
    options[index] = decoded.success
  }
  return Result.succeed(options)
}

const validateMainMenuViewModelArguments = (
  args: MainMenuViewModelValidationArguments,
): Result.Result<ValidMainMenuViewModelArguments, InvalidMainMenuViewModelInput> => {
  const [stateInput, savedWorldsInput, worldTypesInput, unreadableSavesInput] = args
  const state = decodeMainMenuState(stateInput)
  if (Result.isFailure(state)) {
    return Result.fail({ _tag: 'InvalidMainMenuViewModelInput', field: 'state' })
  }
  const savedWorlds = decodeMainMenuArray(savedWorldsInput, SavedWorldSchema)
  if (Result.isFailure(savedWorlds)) {
    return Result.fail({ _tag: 'InvalidMainMenuViewModelInput', field: 'savedWorlds' })
  }
  const worldTypes = decodeWorldTypeOptions(worldTypesInput)
  if (Result.isFailure(worldTypes)) {
    return Result.fail({ _tag: 'InvalidMainMenuViewModelInput', field: 'worldTypes' })
  }
  const unreadableSaves = decodeMainMenuArray(unreadableSavesInput, UnreadableSaveSchema)
  if (Result.isFailure(unreadableSaves)) {
    return Result.fail({ _tag: 'InvalidMainMenuViewModelInput', field: 'unreadableSaves' })
  }
  return Result.succeed([
    state.success,
    savedWorlds.success,
    worldTypes.success,
    unreadableSaves.success,
  ])
}

const projectMainMenuViewModel = ([
  state,
  savedWorlds,
  worldTypeOptions,
  unreadableSaves,
]: ValidMainMenuViewModelArguments): MainMenuViewModel => {
  const selectedWorldType = worldTypeOptions.find((option) =>
    typeof option !== 'undefined' && option.value === state.draft.worldType,
  )
  const firstAvailableWorldType = worldTypeOptions.find((option) => typeof option !== 'undefined')
  const defaultWorldType = ''
  return {
    difficulty: state.draft.difficulty,
    mode: state.draft.mode,
    panel: state.panel,
    savedWorlds,
    seedInput: state.draft.seed,
    unreadableSaves,
    worldName: worldNameLabel(state.draft),
    worldNameInput: state.draft.name,
    worldType: worldTypeId(selectedWorldType?.value ?? firstAvailableWorldType?.value ?? defaultWorldType),
    worldTypes: worldTypeOptions,
  }
}

export function mainMenuViewModel(
  ...args: [state: null, savedWorlds?: unknown, worldTypes?: unknown, unreadableSaves?: unknown]
): Result.Result<MainMenuViewModel, InvalidMainMenuViewModelInput>
export function mainMenuViewModel(...args: MainMenuViewModelArguments): MainMenuViewModel
export function mainMenuViewModel(
  ...args: MainMenuViewModelInputArguments
): MainMenuViewModel | Result.Result<MainMenuViewModel, InvalidMainMenuViewModelInput>
export function mainMenuViewModel(...args: MainMenuViewModelArguments): MainMenuViewModel
export function mainMenuViewModel(
  ...args: MainMenuViewModelInputArguments
): MainMenuViewModel | Result.Result<MainMenuViewModel, InvalidMainMenuViewModelInput> {
  const [state, savedWorlds = [], worldTypes = [], unreadableSaves = []] = args
  const validated = validateMainMenuViewModelArguments([state, savedWorlds, worldTypes, unreadableSaves])
  if (Result.isFailure(validated)) {
    return Result.fail(validated.failure)
  }
  return projectMainMenuViewModel(validated.success)
}
