import { describe, expect, it } from 'vitest'
import { InputAction, KeyCode } from '@nerima-games/mc-kernel/domain/settings'
import { createOnboardingView } from '../src/application/onboarding-view.js'
import {
  onboardingViewModel,
  type OnboardingIntent,
} from '../src/domain/onboarding-view-model.js'
import { fakeDocument, fakeElement } from './fake-dom.js'

const QUICK_CONTROLS = [
  { action: InputAction('Move'), keys: KeyCode('W') },
  { action: InputAction('Jump'), keys: KeyCode('Space') },
]

describe('onboardingViewModel', () => {
  it('shows Quick Controls only on the first run before dismissal', () => {
    expect(
      onboardingViewModel({
        firstRun: true,
        quickControlsDismissed: false,
        quickControls: QUICK_CONTROLS,
      }).quickControlsVisible,
    ).toBe(true)
    expect(
      onboardingViewModel({
        firstRun: false,
        quickControlsDismissed: false,
        quickControls: QUICK_CONTROLS,
      }).quickControlsVisible,
    ).toBe(false)
    expect(
      onboardingViewModel({
        firstRun: true,
        quickControlsDismissed: true,
        quickControls: QUICK_CONTROLS,
      }).quickControlsVisible,
    ).toBe(false)
  })

  it('projects a frozen copy of host-provided Quick Controls', () => {
    const model = onboardingViewModel({
      firstRun: true,
      quickControlsDismissed: false,
      quickControls: QUICK_CONTROLS,
    })

    expect(model.quickControls).toStrictEqual(QUICK_CONTROLS)
    expect(model.quickControls).not.toBe(QUICK_CONTROLS)
    expect(Object.isFrozen(model)).toBe(true)
    expect(Object.isFrozen(model.quickControls)).toBe(true)
    expect(model.quickControls.every(Object.isFrozen)).toBe(true)
    expect(Object.isFrozen(QUICK_CONTROLS)).toBe(false)
  })
})

describe('createOnboardingView', () => {
  it('builds a labeled region with native buttons and forwards typed host intents', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const intents: Array<OnboardingIntent> = []
    const view = createOnboardingView(factory, host, {
      onIntent: (intent) => intents.push(intent),
    })
    const root = fakeElement(view.root)

    view.render(
      onboardingViewModel({
        firstRun: true,
        quickControlsDismissed: false,
        quickControls: QUICK_CONTROLS,
      }),
    )

    expect(root.attributes.get('role')).toBe('region')
    expect(root.attributes.get('aria-label')).toBe('Quick Controls onboarding')
    expect(root.attributes.has('hidden')).toBe(false)
    expect(root.findAll('data-onboarding-control', 'true')).toHaveLength(QUICK_CONTROLS.length)

    const move = root.find('data-onboarding-control-action', 'Move')
    expect(move?.children[0]?.textContent).toBe('Move: ')
    expect(move?.children[1]?.tagName).toBe('kbd')
    expect(move?.children[1]?.textContent).toBe('W')

    const howToPlay = root.find('data-onboarding-action', 'OpenHowToPlay')
    const dismiss = root.find('data-onboarding-action', 'PersistQuickControlsDismissal')
    expect(howToPlay?.tagName).toBe('button')
    expect(howToPlay?.attributes.get('type')).toBe('button')
    expect(howToPlay?.attributes.get('aria-label')).toBe('How to Play')
    expect(dismiss?.tagName).toBe('button')
    expect(dismiss?.attributes.get('type')).toBe('button')
    expect(dismiss?.attributes.get('aria-label')).toBe('Dismiss Quick Controls')

    howToPlay?.dispatch('click')
    dismiss?.dispatch('click')
    expect(intents).toStrictEqual([
      { _tag: 'OpenHowToPlay' },
      { _tag: 'PersistQuickControlsDismissal' },
    ])
  })

  it('hides the hint when the host reports it is not a first run or it was dismissed', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createOnboardingView(factory, host, { onIntent: () => undefined })
    const root = fakeElement(view.root)

    view.render(
      onboardingViewModel({
        firstRun: true,
        quickControlsDismissed: false,
        quickControls: QUICK_CONTROLS,
      }),
    )
    expect(root.attributes.has('hidden')).toBe(false)

    view.render(
      onboardingViewModel({
        firstRun: false,
        quickControlsDismissed: false,
        quickControls: QUICK_CONTROLS,
      }),
    )
    expect(root.attributes.has('hidden')).toBe(true)

    view.render(
      onboardingViewModel({
        firstRun: true,
        quickControlsDismissed: true,
        quickControls: QUICK_CONTROLS,
      }),
    )
    expect(root.attributes.has('hidden')).toBe(true)

    view.render(
      onboardingViewModel({
        firstRun: true,
        quickControlsDismissed: false,
        quickControls: QUICK_CONTROLS.slice(0, 1),
      }),
    )
    expect(root.findAll('data-onboarding-control', 'true')).toHaveLength(QUICK_CONTROLS.length)
    expect(root.find('data-onboarding-control-action', 'Jump')?.attributes.has('hidden')).toBe(true)
  })
})
