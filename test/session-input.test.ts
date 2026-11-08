// @vitest-environment jsdom

import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSessionInput } from '../apps/browser-harness/session-input.js'
import { makeUiMount } from '../src/application/ui-mount.js'

afterEach(() => document.body.replaceChildren())

describe('session arrow-key focus routing', () => {
  it('leaves arrows in editable controls and routes them from other focused elements', async () => {
    const root = document.createElement('main')
    const remapRoot = document.createElement('section')
    const remapStatus = document.createElement('div')
    const actionOutput = document.createElement('pre')
    const editable = document.createElement('input')
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    const contentEditable = document.createElement('div')
    const contentEditableChild = document.createElement('span')
    contentEditable.setAttribute('contenteditable', 'true')
    contentEditable.append(contentEditableChild)
    const button = document.createElement('button')
    root.append(editable, textarea, select, contentEditable, button)
    document.body.append(root, remapRoot, remapStatus, actionOutput)

    const input = await createSessionInput({
      actionOutput,
      remapRoot,
      remapStatus,
      root,
      runPromise: Effect.runPromise,
    })
    const runtime = makeUiMount({ root })
    const moveFocus = vi.spyOn(runtime, 'moveFocus')
    input.connect(runtime)

    for (const target of [editable, textarea, select, contentEditableChild]) {
      target.focus()
      target.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        code: 'ArrowLeft',
        key: 'ArrowLeft',
      }))
    }
    expect(moveFocus).not.toHaveBeenCalled()

    button.focus()
    button.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      code: 'ArrowRight',
      key: 'ArrowRight',
    }))
    expect(moveFocus).toHaveBeenCalledExactlyOnceWith('right')
    input.dispose()
  })
})
