/** Caption UI projection against mc-audio's owner supplied visibility policy. */
import * as fc from 'fast-check'
import { MonotonicTimeSecs } from '@nerima-games/mc-kernel'
import {
  CAPTION_DISPLAY_SECS,
  CAPTION_REASONS,
  MAX_VISIBLE_CAPTIONS,
  visibleCaptions,
  type CaptionEvent,
} from '@nerima-games/mc-audio'
import { describe, expect, it } from 'vitest'
import { createCaptionView } from '../src/application/caption-view'
import { captionLines } from '../src/domain/caption'
import { fakeDocument, fakeElement, writeNames, type FakeElement } from './fake-dom'

const captionTime = (seconds: number): CaptionEvent['atSecs'] =>
  // @ts-expect-error mc-audio 0.3.0 uses the kernel 0.8 time brand; mx-ui exposes kernel 0.12.
  MonotonicTimeSecs(seconds)

const event = (
  cueId: string,
  text: string,
  atSecs: number,
  pan?: number,
  reason: CaptionEvent['reason'] = 'audible',
): CaptionEvent => ({
  cueId,
  text,
  atSecs: captionTime(atSecs),
  reason,
  ...(typeof pan === 'undefined' ? {} : { pan }),
})

const mount = () => {
  const factory = fakeDocument()
  const parent = fakeElement(factory.createElement('div'))
  const view = createCaptionView(factory, parent, 'reduced')
  return { factory, view, root: fakeElement(view.root) }
}

const visibleText = (root: FakeElement): ReadonlyArray<string> =>
  root
    .findAll('data-mx-ui', 'caption-line')
    .filter((line) => !line.attributes.has('hidden'))
    .map((line) => line.find('data-mx-ui', 'caption-text')?.textContent ?? '')

describe('caption lines project mc-audio visibility', () => {
  it('preserves the owner order and maps pan and remaining display time', () => {
    const events = [
      event('step-old', 'Footsteps', 0),
      event('jump', 'Jump', 0.75, 0.5),
      event('step-new', 'Footsteps', 1, -0.5),
      event('future', 'Future', 1.5),
    ]
    const now = captionTime(1.25)
    const ownerVisible = visibleCaptions(events, now)
    const lines = captionLines(events, now)

    expect(lines.map((line) => line.text)).toStrictEqual(ownerVisible.map((caption) => caption.text))
    expect(lines.map((line) => line.text)).toStrictEqual(['Jump', 'Footsteps'])
    expect(lines.map((line) => line.arrow)).toStrictEqual(['→', '←'])
    expect(lines.map((line) => line.freshness)).toStrictEqual([
      1 - 0.5 / CAPTION_DISPLAY_SECS,
      1 - 0.25 / CAPTION_DISPLAY_SECS,
    ])
  })

  it('leaves expiry, future timestamps, and the visible cap to mc-audio', () => {
    const atBoundary = event('expired', 'Expired', 0)
    const current = event('current', 'Current', 0.1)
    const future = event('future', 'Future', 3)
    const boundaryNow = captionTime(CAPTION_DISPLAY_SECS)
    const boundaryEvents = [atBoundary, current, future]

    expect(captionLines(boundaryEvents, boundaryNow).map((line) => line.text)).toStrictEqual(
      visibleCaptions(boundaryEvents, boundaryNow).map((caption) => caption.text),
    )
    expect(captionLines(boundaryEvents, boundaryNow).map((line) => line.text)).toStrictEqual([
      'Current',
    ])

    const events = Array.from({ length: MAX_VISIBLE_CAPTIONS + 3 }, (_value, index) =>
      event(`cue-${String(index)}`, `line-${String(index)}`, index / 10),
    )
    const now = captionTime(1)
    const ownerVisible = visibleCaptions(events, now)

    expect(captionLines(events, now).map((line) => line.text)).toStrictEqual(
      ownerVisible.map((caption) => caption.text),
    )
    expect(ownerVisible).toHaveLength(MAX_VISIBLE_CAPTIONS)
  })

  it('renders only projected owner lines and clears rows when none are visible', () => {
    const { factory, view, root } = mount()
    const events = [
      event('first', 'First', 0),
      event('second', 'Second', 1),
    ]
    const now = captionTime(1.5)
    const lines = captionLines(events, now)

    view.render(lines)
    expect(visibleText(root)).toStrictEqual(['First', 'Second'])
    expect(root.findAll('data-mx-ui', 'caption-line')).toHaveLength(MAX_VISIBLE_CAPTIONS)

    const before = factory.mark()
    view.render(lines)
    expect(writeNames(factory.since(before))).toStrictEqual([])

    view.render(captionLines([], now))
    expect(visibleText(root)).toStrictEqual([])
  })
})

describe('mc-audio caption owner property contract', () => {
  it('checks the expiry boundary and just-outside samples against mc-audio', () => {
    const nowSecs = 10
    const expiryBoundary = nowSecs - CAPTION_DISPLAY_SECS
    const events = [
      event('inside', 'just-inside', expiryBoundary + 0.001),
      event('at-boundary', 'at-boundary', expiryBoundary),
      event('outside', 'just-outside', expiryBoundary - 0.001),
      event('future', 'future', nowSecs + 0.001),
    ]
    const now = captionTime(nowSecs)
    const ownerVisible = visibleCaptions(events, now)

    expect(ownerVisible.map((caption) => caption.text)).toStrictEqual(['just-inside'])
    expect(captionLines(events, now).map((line) => line.text)).toStrictEqual(
      ownerVisible.map((caption) => caption.text),
    )
  })

  it('projects generated event lists exactly from owner visibility', () => {
    const eventLists = fc.array(
      fc.record({
        cueId: fc.string({ maxLength: 12 }),
        text: fc.string({ maxLength: 16 }),
        atSecs: fc.double({ min: 0, max: 20, noNaN: true }),
        pan: fc.option(fc.double({ min: -1, max: 1, noNaN: true }), { nil: undefined }),
        reason: fc.constantFrom(...CAPTION_REASONS),
      }),
      { maxLength: 12 },
    )
    const fixedExpirySamples = [
      {
        cueId: 'just-inside',
        text: 'just-inside',
        ageSecs: CAPTION_DISPLAY_SECS - 0.001,
        visible: true,
      },
      { cueId: 'at-boundary', text: 'at-boundary', ageSecs: CAPTION_DISPLAY_SECS, visible: false },
      {
        cueId: 'just-outside',
        text: 'just-outside',
        ageSecs: CAPTION_DISPLAY_SECS + 0.001,
        visible: false,
      },
      { cueId: 'future', text: 'future', ageSecs: -0.001, visible: false },
    ] as const

    fc.assert(
      fc.property(
        eventLists,
        fc.double({ min: 0, max: 20, noNaN: true }),
        fc.constant(fixedExpirySamples),
        (rawEvents, nowSecs, expirySamples) => {
          const fixedNowSecs = 10
          const fixedEvents = expirySamples.map(({ cueId, text, ageSecs }) =>
            event(cueId, text, fixedNowSecs - ageSecs),
          )
          const fixedNow = captionTime(fixedNowSecs)
          const fixedOwnerVisible = visibleCaptions(fixedEvents, fixedNow)

          expect(fixedOwnerVisible.map((caption) => caption.text)).toStrictEqual(
            expirySamples.filter(({ visible }) => visible).map(({ text }) => text),
          )
          expect(captionLines(fixedEvents, fixedNow).map((line) => line.text)).toStrictEqual(
            fixedOwnerVisible.map((caption) => caption.text),
          )

          const events = rawEvents.map(({ cueId, text, atSecs, pan, reason }) =>
            event(cueId, text, atSecs, pan, reason),
          )
          const now = captionTime(nowSecs)
          const ownerVisible = visibleCaptions(events, now)
          const expectedLines = ownerVisible.map((caption) => ({
            arrow:
              typeof caption.pan === 'undefined' || caption.pan === 0
                ? undefined
                : caption.pan < 0
                  ? '←'
                  : '→',
            freshness: Math.max(
              0,
              Math.min(
                1,
                1 - (nowSecs - caption.atSecs) / CAPTION_DISPLAY_SECS,
              ),
            ),
            text: caption.text,
          }))

          expect(captionLines(events, now)).toStrictEqual(expectedLines)
          expect(ownerVisible.length).toBeLessThanOrEqual(MAX_VISIBLE_CAPTIONS)
        },
      ),
      { numRuns: 100 },
    )
  })
})
