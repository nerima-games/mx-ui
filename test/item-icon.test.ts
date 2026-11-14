import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { resolveItemIcon } from '../src/domain/item-icon'

const ICON_URL = 'https://assets.example/stone.png'
const INVALID_ITEM_ICON = Result.fail({ _tag: 'InvalidItemIcon' })

const atlasFields = {
  kind: 'atlas',
  url: 'https://assets.example/atlas.png',
  x: 24,
  y: 32,
  width: 8,
  height: 8,
  atlasWidth: 32,
  atlasHeight: 40,
}

const throwingPrototypeProxy = (target: object): object =>
  new Proxy(target, {
    getPrototypeOf: () => {
      throw new Error('host value must not be trusted')
    },
  })

describe('item icon host boundary', () => {
  it('accepts a null-prototype icon record and an http(s)-origin blob URL', () => {
    const nullPrototypeIcon = Object.assign(Object.create(null), { kind: 'url', url: ICON_URL })
    expect(resolveItemIcon('stone', () => Result.succeed(nullPrototypeIcon))).toStrictEqual(
      Result.succeed({ kind: 'url', url: ICON_URL }),
    )

    const blobUrl = 'blob:https://assets.example/0b6c'
    expect(resolveItemIcon('stone', () => Result.succeed({ kind: 'url', url: blobUrl }))).toStrictEqual(
      Result.succeed({ kind: 'url', url: blobUrl }),
    )
  })

  it.each([
    { label: 'a bare URL string', icon: ICON_URL },
    { label: 'an array', icon: [ICON_URL] },
    { label: 'a record with a custom prototype', icon: Object.assign(Object.create({}), { kind: 'url', url: ICON_URL }) },
    { label: 'an unknown field', icon: { kind: 'url', url: ICON_URL, label: 'Stone' } },
    { label: 'a symbol-keyed field', icon: { kind: 'url', url: ICON_URL, [Symbol('extra')]: true } },
    { label: 'atlas geometry on a url icon', icon: { kind: 'url', url: ICON_URL, x: 0 } },
    { label: 'an unknown icon kind', icon: { kind: 'sprite', url: ICON_URL } },
    {
      label: 'an atlas icon without a y offset',
      icon: { kind: 'atlas', url: atlasFields.url, x: 24, width: 8, height: 8, atlasWidth: 32, atlasHeight: 40 },
    },
    { label: 'an atlas icon with an undefined y offset', icon: { ...atlasFields, y: undefined } },
    { label: 'a non-numeric atlas offset', icon: { ...atlasFields, x: '24' } },
    { label: 'a negative atlas offset', icon: { ...atlasFields, y: -1 } },
    { label: 'an atlas rectangle past the atlas edge', icon: { ...atlasFields, y: 33 } },
    { label: 'a non-string URL', icon: { kind: 'url', url: 42 } },
    { label: 'an empty URL', icon: { kind: 'url', url: '' } },
    { label: 'a URL with surrounding whitespace', icon: { kind: 'url', url: ` ${ICON_URL}` } },
    { label: 'a URL longer than 2048 characters', icon: { kind: 'url', url: `https://assets.example/${'a'.repeat(2048)}` } },
    {
      label: 'a URL whose percent-encoded form exceeds 2048 characters',
      icon: { kind: 'url', url: `https://assets.example/${'é'.repeat(1000)}` },
    },
    { label: 'a blob URL without a parsable origin', icon: { kind: 'url', url: 'blob:not a url' } },
    { label: 'a blob URL with a file origin', icon: { kind: 'url', url: 'blob:file:///tmp/icon.png' } },
    {
      label: 'a blob URL whose origin carries credentials',
      icon: { kind: 'url', url: 'blob:https://user:pass@assets.example/icon.png' },
    },
    { label: 'an icon whose prototype lookup throws', icon: throwingPrototypeProxy({ kind: 'url', url: ICON_URL }) },
  ])('rejects $label as an invalid icon', ({ icon }) => {
    expect(resolveItemIcon('stone', () => Result.succeed(icon))).toStrictEqual(INVALID_ITEM_ICON)
  })

  it.each([
    { label: 'an unwrapped icon record', value: { kind: 'url', url: ICON_URL } },
    { label: 'a bare URL string', value: ICON_URL },
    { label: 'a Result with an extra own field', value: Object.assign(Result.succeed({ kind: 'url', url: ICON_URL }), { extra: true }) },
    { label: 'a Result whose prototype lookup throws', value: throwingPrototypeProxy(Result.succeed({ kind: 'url', url: ICON_URL })) },
    { label: 'a failure carrying a non-record', value: Result.fail('broken') },
    { label: 'a failure with an unknown tag', value: Result.fail({ _tag: 'IconServerDown' }) },
  ])('rejects $label returned by the host resolver', ({ value }) => {
    expect(resolveItemIcon('stone', () => value)).toStrictEqual(INVALID_ITEM_ICON)
  })

  it('keeps a host-reported unavailable icon distinct from a malformed one', () => {
    expect(resolveItemIcon('stone', () => Result.fail({ _tag: 'ItemIconUnavailable' }))).toStrictEqual(
      Result.fail({ _tag: 'ItemIconUnavailable' }),
    )
  })
})
