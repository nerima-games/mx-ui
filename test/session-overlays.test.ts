// @vitest-environment jsdom

import { Result } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSessionOverlays } from '../src/application/session-overlays'

const activeOverlays = new Set<ReturnType<typeof createSessionOverlays>>()

afterEach(() => {
  activeOverlays.forEach((overlays) => overlays.destroy())
  activeOverlays.clear()
  document.body.replaceChildren()
})

const mountOverlays = (
  parent: HTMLElement,
  options: Parameters<typeof createSessionOverlays>[2] = {},
): ReturnType<typeof createSessionOverlays> => {
  const overlays = createSessionOverlays(document, parent, options)
  activeOverlays.add(overlays)
  return overlays
}

describe('session overlays', () => {
  it('keeps scrolling in the settings view within the safe-area dialog', () => {
    const parent = document.createElement('main')
    document.body.appendChild(parent)
    const overlays = mountOverlays(parent)
    const settingsScroller = overlays.settingsDialog.querySelector<HTMLElement>(':scope > section')

    expect(overlays.settingsDialog.style.getPropertyValue('overflow-y')).toBe('hidden')
    expect(settingsScroller?.style.getPropertyValue('overflow-y')).toBe('auto')
    expect(settingsScroller?.style.getPropertyValue('flex')).toBe('1 1 auto')
    expect(settingsScroller?.style.getPropertyValue('min-height')).toBe('0px')
    expect(settingsScroller?.style.getPropertyValue('max-height')).toBe('none')

    overlays.openSettings()
    expect(overlays.settingsDialog.style.getPropertyValue('display')).toBe('flex')
  })

  it('uses legacy settings to initialize the complete settings view', () => {
    const parent = document.createElement('main')
    document.body.appendChild(parent)
    const overlays = mountOverlays(parent, {
      initialSettings: {
        fieldOfView: 91,
        masterVolume: 0.4,
        mouseSensitivity: 1.5,
        renderDistance: 8,
      },
    })

    expect(overlays.settingsDialog.querySelector<HTMLInputElement>('[data-setting="fieldOfView"]')?.value).toBe(
      '91',
    )
    expect(overlays.settingsDialog.querySelector<HTMLInputElement>('[data-setting="masterVolume"]')?.value).toBe(
      '0.4',
    )
    expect(overlays.settingsDialog.querySelector<HTMLInputElement>('[data-setting="mouseSensitivity"]')?.value).toBe(
      '1.5',
    )
    expect(overlays.settingsDialog.querySelector<HTMLInputElement>('[data-setting="renderDistance"]')?.value).toBe(
      '8',
    )
  })

  it('applies a language choice locally when no host language coordinator is supplied', () => {
    const parent = document.createElement('main')
    document.body.appendChild(parent)
    const onLanguageChange = vi.fn()
    const overlays = mountOverlays(parent, {
      callbacks: { onLanguageChange },
    })
    overlays.openSettings()

    overlays.settingsDialog.querySelector<HTMLButtonElement>(
      '[data-settings-field="language"][data-setting-value="ja"]',
    )?.click()

    expect(onLanguageChange).toHaveBeenCalledExactlyOnceWith('ja')
    expect(
      overlays.settingsDialog
        .querySelector('[data-settings-field="language"][data-setting-value="ja"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true')
    expect(overlays.settingsDialog.getAttribute('aria-label')).toBe('設定')
  })

  it('keeps the selected language when the host rejects a language change', () => {
    const parent = document.createElement('main')
    document.body.appendChild(parent)
    const onLanguageChange = vi.fn()
    const rejectLanguageChange = vi.fn(() => Result.fail({ _tag: 'UnsupportedUiLanguage' as const }))
    const overlays = mountOverlays(parent, {
      callbacks: { onLanguageChange },
      onLanguageChange: rejectLanguageChange,
    })
    overlays.openSettings()

    overlays.settingsDialog.querySelector<HTMLButtonElement>(
      '[data-settings-field="language"][data-setting-value="ja"]',
    )?.click()

    expect(rejectLanguageChange).toHaveBeenCalledExactlyOnceWith('ja')
    expect(onLanguageChange).not.toHaveBeenCalled()
    expect(
      overlays.settingsDialog
        .querySelector('[data-settings-field="language"][data-setting-value="en"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      overlays.settingsDialog
        .querySelector('[data-settings-field="language"][data-setting-value="ja"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('false')
    expect(overlays.settingsDialog.getAttribute('aria-label')).toBe('Settings')
  })

  it('reports valid graphics and difficulty choices to the host', () => {
    const parent = document.createElement('main')
    document.body.appendChild(parent)
    const onSettingsChange = vi.fn()
    const overlays = mountOverlays(parent, { callbacks: { onSettingsChange } })
    overlays.openSettings()

    overlays.settingsDialog.querySelector<HTMLButtonElement>(
      '[data-settings-field="graphicsPreset"][data-setting-value="high"]',
    )?.click()
    overlays.settingsDialog.querySelector<HTMLButtonElement>(
      '[data-settings-field="difficulty"][data-setting-value="hard"]',
    )?.click()

    expect(onSettingsChange).toHaveBeenCalledTimes(2)
    expect(onSettingsChange).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ graphicsPreset: 'high', graphicsQuality: 'high' }),
    )
    expect(onSettingsChange).toHaveBeenNthCalledWith(2, expect.objectContaining({ difficulty: 'hard' }))
    expect(
      overlays.settingsDialog
        .querySelector('[data-settings-field="graphicsPreset"][data-setting-value="high"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      overlays.settingsDialog
        .querySelector('[data-settings-field="difficulty"][data-setting-value="hard"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('applies legacy host settings after the overlay is mounted', () => {
    const parent = document.createElement('main')
    document.body.appendChild(parent)
    const overlays = mountOverlays(parent)

    const result = overlays.updateSettings({
      fieldOfView: 91,
      masterVolume: 0.4,
      mouseSensitivity: 1.5,
      renderDistance: 8,
    })

    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.success).toMatchObject({
        fovDegrees: 91,
        masterVolume: 0.4,
        mouseSensitivity: 1.5,
        renderDistance: 8,
      })
    }
    expect(overlays.settingsDialog.querySelector<HTMLInputElement>('[data-setting="fieldOfView"]')?.value).toBe('91')
    expect(overlays.settingsDialog.querySelector<HTMLInputElement>('[data-setting="masterVolume"]')?.value).toBe('0.4')
    expect(overlays.settingsDialog.querySelector<HTMLInputElement>('[data-setting="mouseSensitivity"]')?.value).toBe('1.5')
    expect(overlays.settingsDialog.querySelector<HTMLInputElement>('[data-setting="renderDistance"]')?.value).toBe('8')
  })

  it('rejects an invalid host snapshot without replacing the displayed settings', () => {
    const parent = document.createElement('main')
    document.body.appendChild(parent)
    const onSettingsChange = vi.fn()
    const overlays = mountOverlays(parent, { callbacks: { onSettingsChange } })
    const renderDistance = overlays.settingsDialog.querySelector<HTMLInputElement>('[data-setting="renderDistance"]')
    const displayedRenderDistance = renderDistance?.value

    expect(overlays.updateSettingsSnapshot({ renderDistance: -1 }, 'en')).toEqual(
      Result.fail({ _tag: 'InvalidSettingsSnapshot' }),
    )
    expect(displayedRenderDistance).toBeDefined()
    expect(renderDistance?.value).toBe(displayedRenderDistance)
    expect(onSettingsChange).not.toHaveBeenCalled()
  })

  it('does not restore focus to a host control removed while settings were open', () => {
    const parent = document.createElement('main')
    document.body.appendChild(parent)
    const trigger = document.createElement('button')
    parent.appendChild(trigger)
    trigger.focus()
    const restoreFocus = vi.spyOn(trigger, 'focus')
    const overlays = mountOverlays(parent)
    overlays.openSettings()
    expect(overlays.settingsDialog.hidden).toBe(false)

    trigger.remove()
    overlays.closeSettings()
    overlays.closeSettings()

    expect(overlays.settingsDialog.hidden).toBe(true)
    expect(restoreFocus).not.toHaveBeenCalled()
  })

  it('does not restore the non-focusable body after settings close', () => {
    const parent = document.createElement('main')
    document.body.appendChild(parent)
    const overlays = mountOverlays(parent)
    const restoreBodyFocus = vi.spyOn(document.body, 'focus')

    expect(document.body.hasAttribute('tabindex')).toBe(false)
    expect(document.activeElement).toBe(document.body)
    overlays.openSettings()
    expect(document.activeElement).toBe(
      overlays.settingsDialog.querySelector('[data-settings-field="mouseSensitivity"]'),
    )

    overlays.closeSettings()

    expect(overlays.settingsDialog.hidden).toBe(true)
    expect(restoreBodyFocus).not.toHaveBeenCalled()
  })
})
