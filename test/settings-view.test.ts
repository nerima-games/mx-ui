import { DEFAULT_SETTINGS } from '@nerima-games/mc-sim'
import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { createSettingsView } from '../src/application/settings-view'
import { settingsViewModel } from '../src/domain/settings-view-model'
import { fakeDocument, fakeElement } from './fake-dom'
import { TEST_BINDABLE_ACTIONS, TEST_DEFAULT_BINDINGS } from './fixtures/settings-input'

const SNAPSHOT = {
  ...DEFAULT_SETTINGS,
  difficulty: 'hard' as const,
  fovDegrees: 92,
  graphicsPreset: 'high' as const,
  graphicsQuality: 'high' as const,
  keyBindings: { ...DEFAULT_SETTINGS.keyBindings, moveForward: 'KeyW' },
  masterVolume: 0.8,
  mouseSensitivity: 1,
  reducedMotion: 'reduced' as const,
  sfxVolume: 1,
  uiScale: 1.25,
}

const model = () => {
  const result = settingsViewModel(SNAPSHOT, TEST_DEFAULT_BINDINGS, TEST_BINDABLE_ACTIONS)
  if (Result.isSuccess(result)) {
    return result.success
  }
  throw new Error('Expected a valid Settings snapshot')
}

describe('createSettingsView', () => {
  it('projects numeric and binding controls from the settings model', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createSettingsView(factory, host)
    const root = fakeElement(view.root)
    view.render(model())

    expect(root.find('data-settings-field', 'mouseSensitivity')?.value).toBe('1')
    expect(root.find('data-settings-field-output', 'mouseSensitivity')?.textContent).toBe('1×')
    expect(root.find('data-settings-field', 'masterVolume')?.value).toBe('0.8')
    expect(root.find('data-settings-field-output', 'masterVolume')?.textContent).toBe('80%')
    expect(root.find('data-settings-field', 'sfxVolume')?.value).toBe('1')
    expect(root.find('data-settings-field', 'fovDegrees')?.value).toBe('92')
    expect(root.find('data-settings-field', 'fovDegrees')?.attributes.get('min')).toBe('30')
    expect(root.find('data-settings-field', 'fovDegrees')?.attributes.get('max')).toBe('110')
    expect(root.find('data-settings-field', 'uiScale')?.value).toBe('1.25')
    expect(root.find('data-settings-field', 'uiScale')?.attributes.get('min')).toBe('0.75')
    expect(root.find('data-settings-field', 'uiScale')?.attributes.get('max')).toBe('1.5')

    const bindingButtons = root.findAll('data-interaction-target', 'settings-binding')
    expect(bindingButtons).toHaveLength(21)
    expect(root.find('data-binding-action', 'moveForward')?.textContent).toBe('KeyW')
    expect(root.find('data-binding-action', 'attack')?.textContent).toBe(TEST_DEFAULT_BINDINGS.attack)
    expect(root.find('data-binding-action', 'moveForward')?.attributes.get('aria-label')).toBe(
      'Change Move forward key (currently KeyW)',
    )
    expect(root.find('data-binding-action', 'escape')).toBeUndefined()
  })

  it('projects accessibility controls and the selected choices', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createSettingsView(factory, host)
    const root = fakeElement(view.root)
    view.render(model())

    expect(root.find('data-settings-field', 'audioEnabled')?.attributes.get('aria-checked')).toBe('true')
    expect(root.find('data-settings-field', 'captionsEnabled')?.attributes.get('aria-checked')).toBe(
      String(DEFAULT_SETTINGS.captionsEnabled),
    )
    expect(root.find('data-setting-value', 'hard')?.attributes.get('aria-pressed')).toBe('true')
    expect(root.find('data-setting-value', 'high')?.attributes.get('aria-pressed')).toBe('true')
    expect(root.find('data-setting-value', 'reduced')?.attributes.get('aria-pressed')).toBe('true')
    expect(root.find('data-setting-value', 'off')?.attributes.get('aria-pressed')).toBe('true')
  })

  it('announces the action and current binding on key buttons', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createSettingsView(factory, host)
    const viewModel = model()
    const root = fakeElement(view.root)

    view.render(viewModel)
    expect(root.find('data-binding-action', 'moveForward')?.attributes.get('aria-label')).toBe(
      'Change Move forward key (currently KeyW)',
    )

    view.render({
      ...viewModel,
      bindingRows: viewModel.bindingRows.map((row) =>
        row.action === 'moveForward' ? { ...row, code: undefined } : row,
      ),
    })
    expect(root.find('data-binding-action', 'moveForward')?.attributes.get('aria-label')).toBe(
      'Change Move forward key (currently Unbound)',
    )
  })

  it('uses an unrecognized host action as its accessible label', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createSettingsView(factory, host)
    const viewModel = model()
    const root = fakeElement(view.root)

    view.render({
      ...viewModel,
      bindingRows: [...viewModel.bindingRows, { action: 'moddedAction', code: undefined }],
    })

    expect(root.find('data-binding-action', 'moddedAction')?.attributes.get('aria-label')).toBe(
      'Change moddedAction key (currently Unbound)',
    )
  })

  it('re-renders without redundant writes when the model is unchanged', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createSettingsView(factory, host)
    const viewModel = model()
    view.render(viewModel)

    const before = factory.mark()
    view.render(viewModel)

    expect(factory.since(before)).toStrictEqual([])
  })

  it('attaches no event listener anywhere in its tree', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createSettingsView(factory, host)
    const root = fakeElement(view.root)

    view.render(model())

    expect(root.listenersInTree()).toStrictEqual([])
  })
})
