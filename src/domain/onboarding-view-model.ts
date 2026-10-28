import type { InputAction, KeyCode } from '@nerima-games/mc-kernel/domain/settings'

export type QuickControlHint = {
  readonly action: InputAction
  readonly keys: KeyCode
}

export type OnboardingInput = {
  readonly firstRun: boolean
  readonly quickControlsDismissed: boolean
  readonly quickControls: ReadonlyArray<QuickControlHint>
}

export type OnboardingViewModel = {
  readonly quickControlsVisible: boolean
  readonly quickControls: ReadonlyArray<QuickControlHint>
}

export type OnboardingIntent =
  | { readonly _tag: 'PersistQuickControlsDismissal' }
  | { readonly _tag: 'OpenHowToPlay' }



export const onboardingViewModel = (input: OnboardingInput): OnboardingViewModel =>
  Object.freeze({
    quickControls: Object.freeze(
      input.quickControls.map((hint) => Object.freeze({ action: hint.action, keys: hint.keys })),
    ),
    quickControlsVisible: input.firstRun && !input.quickControlsDismissed,
  })
