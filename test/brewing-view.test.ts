import { Result, Schema } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import {
  BREWING_TIME_SECS,
  BrewingStateSchema,
  itemStack as makeItemStack,
  type BrewingState,
} from '@nerima-games/mc-sim'
import { brewingViewModel } from '../src/domain/brewing-view-model.js'
import { createBrewingView } from '../src/application/brewing-view.js'
import { fakeDocument, fakeElement } from './fake-dom.js'

const snapshot = (input: unknown): BrewingState =>
  Schema.decodeUnknownSync(BrewingStateSchema)(input)

const testItemStack = (
  item: Parameters<typeof makeItemStack>[0],
  count: Parameters<typeof makeItemStack>[1],
) => {
  const result = makeItemStack(item, count)
  if (Result.isSuccess(result)) {
    return result.success
  }
  expect.fail(`mc-sim itemStack failed: ${JSON.stringify(result.failure)}`)
}

describe('createBrewingView', () => {
  it('keeps controls in visual order, disables unsupported actions, and exposes a native close intent', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const onIntent = vi.fn()
    const view = createBrewingView(factory, host, { onIntent })
    const root = fakeElement(view.root)
    const model = brewingViewModel(
      snapshot({
        bottles: [undefined, undefined, undefined],
        ingredient: undefined,
        fuel: undefined,
        fuelCharges: 0,
        brewProgressSecs: 0,
      }),
    )

    view.render(model)

    const controls = root.findAll('data-mx-ui', 'brewing-control')
    expect(controls.map((control) => control.attributes.get('data-brewing-operation'))).toStrictEqual([
      'insert-selected-item',
      'collect-bottle',
      'drink-potion',
      'close',
    ])
    expect(controls.map((control) => control.textContent)).toStrictEqual([
      'Insert selected item',
      'Collect bottle',
      'Drink potion',
      'Close',
    ])
    expect(controls.map((control) => control.attributes.get('disabled') === '')).toStrictEqual([
      true,
      true,
      true,
      false,
    ])
    expect(controls.map((control) => control.attributes.get('aria-disabled'))).toStrictEqual([
      'true',
      'true',
      'true',
      undefined,
    ])
    expect(controls.every((control) => control.attributes.get('type') === 'button')).toBe(true)
    expect(controls.every((control) => control.attributes.get('tabindex') === undefined)).toBe(true)
    expect([
      root.find('data-brewing-reason', 'insert-selected-item')?.textContent,
      root.find('data-brewing-reason', 'collect-bottle')?.textContent,
      root.find('data-brewing-reason', 'drink-potion')?.textContent,
    ]).toStrictEqual([
      model.operations.insertSelectedItem.reason,
      model.operations.collectBottle.reason,
      model.operations.drinkPotion.reason,
    ])
    expect(controls[0]?.attributes.get('aria-label')).toContain(
      model.operations.insertSelectedItem.reason,
    )

    controls[0]?.dispatch('click')
    controls[1]?.dispatch('click')
    controls[2]?.dispatch('click')
    controls[3]?.dispatch('click')
    expect(onIntent).toHaveBeenCalledExactlyOnceWith({ _tag: 'Close' })
  })

  it('renders snapshot summary, remaining time, and a polite status region', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createBrewingView(factory, host, { onIntent: vi.fn() })
    const root = fakeElement(view.root)
    const waterBottle = testItemStack('water_bottle', 1)
    const ingredient = testItemStack('nether_wart', 2)
    const fuel = testItemStack('blaze_powder', 3)
    view.render(
      brewingViewModel(
        snapshot({
          bottles: [waterBottle, undefined, undefined],
          ingredient,
          fuel,
          fuelCharges: 3,
          brewProgressSecs: BREWING_TIME_SECS / 2,
        }),
      ),
    )

    expect(root.find('data-mx-ui', 'brewing-summary')?.textContent).toBe(
      'Fuel: 3 charges (blaze_powder × 3) | Bottle 1: water_bottle × 1 | Bottle 2: Empty | Bottle 3: Empty | Ingredient: nether_wart × 2',
    )
    expect(root.find('data-mx-ui', 'brewing-progress')?.textContent).toBe(
      `Brewing: ${(BREWING_TIME_SECS / 2).toFixed(1)}s remaining`,
    )
    const status = root.find('data-mx-ui', 'brewing-status')
    expect(status?.attributes.get('role')).toBe('status')
    expect(status?.attributes.get('aria-live')).toBe('polite')
    expect(status?.attributes.get('aria-atomic')).toBe('true')
    expect(status?.textContent).toBe(
      `Brewing in progress, ${(BREWING_TIME_SECS / 2).toFixed(1)} seconds remaining`,
    )
  })
})
