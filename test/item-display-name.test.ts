import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { isItemDisplayNameResult, itemDisplayNameValue } from '../src/application/item-display-name'
import { defaultItemDisplayNameResolver, resolveItemDisplayName } from '../src/domain/item-display-name'

const UNAVAILABLE = Result.fail({ _tag: 'ItemDisplayNameUnavailable' })

describe('item display-name host boundary', () => {
  it.each([
    { label: 'a bare string', value: 'Host Stone' },
    { label: 'a plain success-shaped record', value: { success: 'Host Stone' } },
    {
      label: 'a Result whose prototype lookup throws',
      value: new Proxy(Result.succeed('Host Stone'), {
        getPrototypeOf: () => {
          throw new Error('host value must not be trusted')
        },
      }),
    },
  ])('treats $label from a host resolver as unavailable', ({ value }) => {
    const resolved = Reflect.apply(resolveItemDisplayName, undefined, ['stone', 'en', () => value])
    expect(resolved).toStrictEqual(UNAVAILABLE)
  })

  it.each([
    { label: 'a tagged success', result: Result.succeed('Host Stone') },
    { label: 'a structured-clone success', result: { success: 'Host Stone' } },
    { label: 'a recognized failure', result: Result.fail({ _tag: 'ItemDisplayNameUnavailable' as const }) },
  ])('accepts $label item display-name results', ({ result }) => {
    expect(isItemDisplayNameResult(result)).toBe(true)
  })

  it.each([
    { label: 'a non-object result', result: null },
    { label: 'a non-string success', result: { success: 7 } },
    { label: 'a clone with extra keys', result: { success: 'Host Stone', extra: true } },
    { label: 'an unknown failure tag', result: { _tag: 'Failure', failure: { _tag: 'UnexpectedFailure' } } },
    { label: 'a missing failure record', result: { _tag: 'Failure', failure: null } },
  ])('rejects $label item display-name results', ({ result }) => {
    expect(isItemDisplayNameResult(result)).toBe(false)
  })

  it('does not use a failure value as an item display name', () => {
    const failure = Result.fail({ _tag: 'ItemDisplayNameUnavailable' as const })

    expect(isItemDisplayNameResult(failure)).toBe(true)
    expect(itemDisplayNameValue({
      itemId: 'stone',
      itemDisplayName: { language: 'en', result: failure },
    }, 'en')).toStrictEqual({ key: 'item.unknown' })
  })

  it.each([
    { label: 'an unknown item type', args: ['not_a_kernel_item', 'en'] },
    { label: 'an unsupported language', args: ['stone', 'fr'] },
  ])('the default resolver reports $label as unavailable', ({ args }) => {
    expect(Reflect.apply(defaultItemDisplayNameResolver, undefined, args)).toStrictEqual(UNAVAILABLE)
  })

})
