import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
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
    { label: 'an unknown item type', args: ['not_a_kernel_item', 'en'] },
    { label: 'an unsupported language', args: ['stone', 'fr'] },
  ])('the default resolver reports $label as unavailable', ({ args }) => {
    expect(Reflect.apply(defaultItemDisplayNameResolver, undefined, args)).toStrictEqual(UNAVAILABLE)
  })
})
