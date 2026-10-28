import { AchievementIdSchema, EntityIdSchema, SimulationTickSchema } from '@nerima-games/mc-kernel'
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { createAchievementToastView } from '../src/application/achievement-toast-view'
import {
  AchievementToastIconSchema,
  AchievementToastTitleSchema,
  type AchievementToast,
} from '../src/domain/achievement-toast'
import { fakeDocument, fakeElement, writeNames } from './fake-dom'

const toast: AchievementToast = {
  achievement: Schema.decodeUnknownSync(AchievementIdSchema)('minecraft:story/mine_stone'),
  icon: Schema.decodeUnknownSync(AchievementToastIconSchema)('minecraft:wooden_pickaxe'),
  player: Schema.decodeUnknownSync(EntityIdSchema)('player:one'),
  tick: Schema.decodeUnknownSync(SimulationTickSchema)(7),
  title: Schema.decodeUnknownSync(AchievementToastTitleSchema)('Stone Age'),
}

const mount = () => {
  const factory = fakeDocument()
  const parent = fakeElement(factory.createElement('div'))
  const view = createAchievementToastView(factory, parent)
  return { factory, parent, view, root: fakeElement(view.root) }
}

describe('achievement toast view', () => {
  it('starts hidden and exposes a polite live region', () => {
    const { root } = mount()

    expect(root.attributes.get('data-mx-ui')).toBe('achievement-toast')
    expect(root.attributes.get('hidden')).toBe('')
    expect(root.attributes.get('role')).toBe('status')
    expect(root.attributes.get('aria-live')).toBe('polite')
    expect(root.attributes.get('aria-atomic')).toBe('true')
  })

  it('shows the title and icon token, and hides again when cleared', () => {
    const { view, root } = mount()
    const icon = root.find('data-mx-ui', 'achievement-toast-icon')
    const title = root.find('data-mx-ui', 'achievement-toast-title')

    view.render(toast)

    expect(root.attributes.has('hidden')).toBe(false)
    expect(icon?.attributes.get('data-icon')).toBe('minecraft:wooden_pickaxe')
    expect(icon?.attributes.get('aria-hidden')).toBe('true')
    expect(icon?.textContent).toBe('✦')
    expect(title?.textContent).toBe('Stone Age')

    view.render(undefined)

    expect(root.attributes.get('hidden')).toBe('')
    expect(title?.textContent).toBe('Stone Age')
  })

  it('does not write DOM mutations when the toast is unchanged', () => {
    const { factory, view } = mount()

    view.render(toast)
    const mark = factory.mark()
    view.render(toast)

    expect(writeNames(factory.since(mark))).toStrictEqual([])
  })
})
