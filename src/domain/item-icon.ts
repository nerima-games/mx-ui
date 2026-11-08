import { type ItemType, isItemType } from '@nerima-games/mc-kernel'
import { Result } from 'effect'

export type ItemIcon =
  | Readonly<{ readonly kind: 'url'; readonly url: string }>
  | Readonly<{
      readonly kind: 'atlas'
      readonly url: string
      readonly [X_COORDINATE]: number
      readonly [Y_COORDINATE]: number
      readonly width: number
      readonly height: number
      readonly atlasWidth: number
      readonly atlasHeight: number
    }>

export type ItemIconFailure =
  | Readonly<{ readonly _tag: 'InvalidItemId' }>
  | Readonly<{ readonly _tag: 'ItemIconUnavailable' }>
  | Readonly<{ readonly _tag: 'InvalidItemIcon' }>

export type ItemIconResolverFailure = Readonly<{ readonly _tag: 'ItemIconUnavailable' }>
export type ItemIconResolver = (itemType: ItemType) => Result.Result<ItemIcon, ItemIconResolverFailure>
type ItemIconResolverCallback = (itemType: ItemType) => unknown

export type ItemIconView = Readonly<{
  readonly result: Result.Result<ItemIcon, ItemIconFailure>
}>

type DataRecord = Readonly<Record<string, unknown>>

const MINECRAFT_NAMESPACE_PREFIX = 'minecraft:'
const ITEM_ICON_UNAVAILABLE: ItemIconFailure = { _tag: 'ItemIconUnavailable' }
const INVALID_ITEM_ICON: ItemIconFailure = { _tag: 'InvalidItemIcon' }
const MAX_ICON_URL_LENGTH = 2_048
const MAX_ATLAS_DIMENSION = 16_384
const ZERO = 0
const FIRST_ARRAY_INDEX = 0
const SUCCESS_RESULT_PROTOTYPE = Object.getPrototypeOf(Result.succeed(null))
const FAILURE_RESULT_PROTOTYPE = Object.getPrototypeOf(Result.fail(null))
const X_COORDINATE: 'x' = 'x'
const Y_COORDINATE: 'y' = 'y'
const SINGLE_KEY = 1

const itemTypeFromId = (input: unknown): ItemType | undefined => {
  if (typeof input !== 'string') {
    return
  }
  let itemId = input
  if (input.startsWith(MINECRAFT_NAMESPACE_PREFIX)) {
    itemId = input.slice(MINECRAFT_NAMESPACE_PREFIX.length)
  }
  if (!isItemType(itemId)) {
    return
  }
  return itemId
}

const isDataDescriptor = (descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } =>
  typeof descriptor !== 'undefined' && Object.hasOwn(descriptor, 'value')

const copyDataEntry = (
  key: PropertyKey,
  descriptors: PropertyDescriptorMap,
  record: Record<string, unknown>,
): boolean => {
  if (typeof key !== 'string') {
    return false
  }
  const descriptor = descriptors[key]
  if (!isDataDescriptor(descriptor)) {
    return false
  }
  record[key] = descriptor.value
  return true
}

const ownDataRecord = (input: object, allowedKeys: ReadonlyArray<string>): Record<string, unknown> | undefined => {
  const descriptors = Object.getOwnPropertyDescriptors(input)
  const keys = Reflect.ownKeys(descriptors)
  if (keys.some((key) => typeof key !== 'string' || !allowedKeys.includes(key))) {
    return
  }
  const record: Record<string, unknown> = {}
  for (const key of keys) {
    if (!copyDataEntry(key, descriptors, record)) {
      return
    }
  }
  return record
}

const decodeDataRecord = (
  input: object,
  allowedKeys: ReadonlyArray<string>,
  requiredKeys: ReadonlyArray<string>,
): DataRecord | undefined => {
  const prototype = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) {
    return
  }
  const record = ownDataRecord(input, allowedKeys)
  if (typeof record === 'undefined' || !requiredKeys.every((key) => Object.hasOwn(record, key))) {
    return
  }
  return record
}

const dataRecord = (
  input: unknown,
  allowedKeys: ReadonlyArray<string>,
  requiredKeys: ReadonlyArray<string>,
): Result.Result<DataRecord, ItemIconFailure> => {
  const parsed = Result.try({
    catch: () => INVALID_ITEM_ICON,
    try: () => {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        return
      }
      return decodeDataRecord(input, allowedKeys, requiredKeys)
    },
  })
  if (Result.isFailure(parsed) || typeof parsed.success === 'undefined') {
    return Result.fail(INVALID_ITEM_ICON)
  }
  return Result.succeed(parsed.success)
}

const boundedUrlText = (input: unknown): input is string =>
  typeof input === 'string' && input.length > ZERO && input.length <= MAX_ICON_URL_LENGTH && input.trim() === input

const parseAbsoluteUrl = (input: string): Result.Result<URL, ItemIconFailure> =>
  Result.try({
    catch: () => INVALID_ITEM_ICON,
    try: () => new URL(input),
  })

const hasHttpOrigin = (parsed: URL): boolean =>
  (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.hostname !== ''

const hasCredentials = (parsed: URL): boolean => parsed.username !== '' || parsed.password !== ''

const validBlobUrl = (parsed: URL): Result.Result<boolean, ItemIconFailure> => {
  if (parsed.protocol !== 'blob:') {
    return Result.succeed(false)
  }
  const origin = parseAbsoluteUrl(parsed.pathname)
  if (Result.isFailure(origin)) {
    return Result.fail(origin.failure)
  }
  return Result.succeed(hasHttpOrigin(origin.success) && !hasCredentials(origin.success))
}

const acceptedImageUrl = (parsed: URL): Result.Result<string, ItemIconFailure> => {
  if (hasCredentials(parsed)) {
    return Result.fail(INVALID_ITEM_ICON)
  }
  if (hasHttpOrigin(parsed)) {
    return Result.succeed(parsed.href)
  }
  const blob = validBlobUrl(parsed)
  if (Result.isFailure(blob)) {
    return Result.fail(blob.failure)
  }
  if (!blob.success) {
    return Result.fail(INVALID_ITEM_ICON)
  }
  return Result.succeed(parsed.href)
}

const absoluteImageUrl = (input: unknown): Result.Result<string, ItemIconFailure> => {
  if (!boundedUrlText(input)) {
    return Result.fail(INVALID_ITEM_ICON)
  }
  const parsed = parseAbsoluteUrl(input)
  if (Result.isFailure(parsed)) {
    return Result.fail(parsed.failure)
  }
  return acceptedImageUrl(parsed.success)
}

const validPositiveCoordinate = (value: number): boolean => Number.isSafeInteger(value) && value > ZERO
const validNonnegativeCoordinate = (value: number): boolean => Number.isSafeInteger(value) && value >= ZERO

const ATLAS_KEYS = ['kind', 'url', 'x', 'y', 'width', 'height', 'atlasWidth', 'atlasHeight']
const ATLAS_REQUIRED_KEYS = ATLAS_KEYS
const URL_ICON_KEYS = 2

type AtlasGeometry = Readonly<{
  readonly [X_COORDINATE]: number
  readonly [Y_COORDINATE]: number
  readonly width: number
  readonly height: number
  readonly atlasWidth: number
  readonly atlasHeight: number
}>

const atlasGeometry = (record: DataRecord): AtlasGeometry | undefined => {
  const { x: coordinateX, y: coordinateY, width, height, atlasWidth, atlasHeight } = record
  if (
    typeof coordinateX !== 'number' || !validNonnegativeCoordinate(coordinateX) ||
    typeof coordinateY !== 'number' || !validNonnegativeCoordinate(coordinateY) ||
    typeof width !== 'number' || !validPositiveCoordinate(width) ||
    typeof height !== 'number' || !validPositiveCoordinate(height) ||
    typeof atlasWidth !== 'number' || !validPositiveCoordinate(atlasWidth) ||
    typeof atlasHeight !== 'number' || !validPositiveCoordinate(atlasHeight) ||
    atlasWidth > MAX_ATLAS_DIMENSION || atlasHeight > MAX_ATLAS_DIMENSION ||
    coordinateX > atlasWidth - width || coordinateY > atlasHeight - height
  ) {
    return
  }
  return {
    atlasHeight,
    atlasWidth,
    height,
    width,
    [X_COORDINATE]: coordinateX,
    [Y_COORDINATE]: coordinateY,
  }
}

const decodeAtlasIcon = (input: unknown, url: string): Result.Result<ItemIcon, ItemIconFailure> => {
  const parsedAtlas = dataRecord(input, ATLAS_KEYS, ATLAS_REQUIRED_KEYS)
  if (Result.isFailure(parsedAtlas)) {
    return Result.fail(parsedAtlas.failure)
  }
  const geometry = atlasGeometry(parsedAtlas.success)
  if (typeof geometry === 'undefined') {
    return Result.fail(INVALID_ITEM_ICON)
  }
  const { x: coordinateX, y: coordinateY, width, height, atlasWidth, atlasHeight } = geometry
  return Result.succeed({
    atlasHeight,
    atlasWidth,
    height,
    kind: 'atlas',
    url,
    width,
    [X_COORDINATE]: coordinateX,
    [Y_COORDINATE]: coordinateY,
  })
}

const decodeUrlIcon = (common: DataRecord, url: string): Result.Result<ItemIcon, ItemIconFailure> => {
  if (Object.keys(common).length !== URL_ICON_KEYS) {
    return Result.fail(INVALID_ITEM_ICON)
  }
  return Result.succeed({ kind: 'url', url })
}

const decodeCommonIcon = (input: unknown, common: DataRecord): Result.Result<ItemIcon, ItemIconFailure> => {
  const imageUrl = absoluteImageUrl(common['url'])
  if (Result.isFailure(imageUrl)) {
    return Result.fail(imageUrl.failure)
  }
  if (common['kind'] === 'url') {
    return decodeUrlIcon(common, imageUrl.success)
  }
  if (common['kind'] === 'atlas') {
    return decodeAtlasIcon(input, imageUrl.success)
  }
  return Result.fail(INVALID_ITEM_ICON)
}

const decodeIcon = (input: unknown): Result.Result<ItemIcon, ItemIconFailure> => {
  const parsedCommon = dataRecord(input, ATLAS_KEYS, ['kind', 'url'])
  if (Result.isFailure(parsedCommon)) {
    return Result.fail(parsedCommon.failure)
  }
  return decodeCommonIcon(input, parsedCommon.success)
}

const resultMember = (
  input: object,
  prototype: object,
  expected: Readonly<{ readonly tag: 'Success' | 'Failure'; readonly memberName: 'success' | 'failure' }>,
): unknown | undefined => {
  if (Object.getPrototypeOf(input) !== prototype) {
    return
  }
  if (Object.getOwnPropertyDescriptor(prototype, '_tag')?.value !== expected.tag) {
    return
  }
  const descriptors = Object.getOwnPropertyDescriptors(input)
  const keys = Reflect.ownKeys(descriptors)
  const member = descriptors[expected.memberName]
  if (keys.length !== SINGLE_KEY || keys.at(FIRST_ARRAY_INDEX) !== expected.memberName || !isDataDescriptor(member)) {
    return
  }
  return member.value
}

const effectResultFromObject = (input: object): Readonly<{ tag: 'Success' | 'Failure'; value: unknown }> | undefined => {
  const success = resultMember(input, SUCCESS_RESULT_PROTOTYPE, { memberName: 'success', tag: 'Success' })
  if (typeof success !== 'undefined') {
    return { tag: 'Success', value: success }
  }
  const failure = resultMember(input, FAILURE_RESULT_PROTOTYPE, { memberName: 'failure', tag: 'Failure' })
  if (typeof failure !== 'undefined') {
    return { tag: 'Failure', value: failure }
  }
  return
}

const effectResultValue = (
  input: unknown,
): Result.Result<Readonly<{ tag: 'Success' | 'Failure'; value: unknown }>, ItemIconFailure> => {
  const parsed = Result.try({
    catch: () => INVALID_ITEM_ICON,
    try: () => {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        return
      }
      return effectResultFromObject(input)
    },
  })
  if (Result.isFailure(parsed) || typeof parsed.success === 'undefined') {
    return Result.fail(INVALID_ITEM_ICON)
  }
  return Result.succeed(parsed.success)
}

const iconFailureResult = (input: unknown): Result.Result<ItemIcon, ItemIconFailure> => {
  const failure = dataRecord(input, ['_tag'], ['_tag'])
  if (Result.isFailure(failure)) {
    return Result.fail(failure.failure)
  }
  if (failure.success['_tag'] === 'ItemIconUnavailable' && Object.keys(failure.success).length === SINGLE_KEY) {
    return Result.fail(ITEM_ICON_UNAVAILABLE)
  }
  return Result.fail(INVALID_ITEM_ICON)
}

const resolverResult = (input: unknown): Result.Result<ItemIcon, ItemIconFailure> => {
  const parsed = effectResultValue(input)
  if (Result.isFailure(parsed)) {
    return Result.fail(parsed.failure)
  }
  const result = parsed.success
  if (result.tag === 'Failure') {
    return iconFailureResult(result.value)
  }
  return decodeIcon(result.value)
}

const invokeItemIconResolver = (
  itemType: ItemType,
  resolver: ItemIconResolverCallback,
): Result.Result<unknown, ItemIconFailure> => Result.try({
    catch: () => ITEM_ICON_UNAVAILABLE,
    try: () => resolver(itemType),
  })

export const resolveItemIcon = (
  input: unknown,
  resolver?: ItemIconResolverCallback,
): Result.Result<ItemIcon, ItemIconFailure> => {
  const itemType = itemTypeFromId(input)
  if (typeof itemType === 'undefined') {
    return Result.fail({ _tag: 'InvalidItemId' })
  }
  if (typeof resolver === 'undefined') {
    return Result.fail(ITEM_ICON_UNAVAILABLE)
  }
  const called = invokeItemIconResolver(itemType, resolver)
  if (Result.isFailure(called)) {
    return Result.fail(called.failure)
  }
  return resolverResult(called.success)
}

export const itemIconView = (itemId: unknown, resolver?: ItemIconResolver): ItemIconView => ({
  result: resolveItemIcon(itemId, resolver),
})
