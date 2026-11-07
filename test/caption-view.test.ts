import { describe, expect, it } from 'vitest'
import { createCaptionView } from '../src/application/caption-view'
import { fakeDocument, fakeElement } from './fake-dom'

describe('caption view text layout', () => {
  it('wraps and retains a long caption in the text node', () => {
    // Catches captions with no break points overflowing narrow screens.
    const factory = fakeDocument()
    const parent = fakeElement(factory.createElement('div'))
    const view = createCaptionView(factory, parent, 'reduced')
    const text = 'x'.repeat(180)

    view.render([{ arrow: undefined, freshness: 1, text }])

    const rendered = fakeElement(view.root).find('data-mx-ui', 'caption-text')
    expect(rendered?.style.properties.get('overflow-wrap')).toBe('anywhere')
    expect(rendered?.textContent).toBe(text)
  })
})
