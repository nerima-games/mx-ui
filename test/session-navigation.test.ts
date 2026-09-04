import { describe, expect, it } from 'vitest'
import type { CreateWorldRequest } from '../src/domain/main-menu'
import { createSessionHref, createUniqueSessionId, sessionHref } from '../src/domain/session-navigation'

// Mirrors mc-compose's `readSessionId` contract exactly (that module stayed
// in mc-compose — see this file's header) so the generator here and the
// parser there cannot silently drift apart.
const SESSION_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u
const MAX_SESSION_ID_LENGTH = 128

describe('sessionHref', () => {
  it('encodes reserved characters when constructing the load-world link', () => {
    expect(sessionHref('World / One')).toBe('/?session=World%20%2F%20One')
  })

  it('round-trips a plain id unchanged', () => {
    expect(sessionHref('primary')).toBe('/?session=primary')
  })
})

describe('createSessionHref', () => {
  it('round-trips Unicode and reserved characters in creation metadata', () => {
    const request: CreateWorldRequest = { mode: 'survival', name: '鉱山 & Plains / 100%?' }
    const href = createSessionHref('world-123', request)
    const parsed = new URLSearchParams(new URL(href, 'https://example.test').search)

    expect(parsed.get('session')).toBe('world-123')
    expect(parsed.get('create')).toBe('1')
    expect(parsed.get('name')).toBe(request.name)
    expect(parsed.get('mode')).toBe('survival')
  })

  it('carries the creative mode through unchanged', () => {
    const href = createSessionHref('id', { mode: 'creative', name: 'Flat World' })
    const parsed = new URLSearchParams(new URL(href, 'https://example.test').search)

    expect(parsed.get('mode')).toBe('creative')
  })
})

describe('createUniqueSessionId', () => {
  it('slugifies the world name and appends the generated id', () => {
    expect(createUniqueSessionId('Cave Base!!', [], () => 'fixed-id')).toBe('cave-base-fixed-id')
  })

  it('retries past a collision until it finds a free id', () => {
    const ids = ['try-1', 'try-2', 'try-3']
    let call = 0
    const randomId = (): string => {
      const next = ids[call] ?? 'exhausted'
      call += 1
      return next
    }

    expect(createUniqueSessionId('World', ['world-try-1', 'world-try-2'], randomId)).toBe('world-try-3')
  })

  it('falls back to "world" for a name with no ASCII letters or digits', () => {
    expect(createUniqueSessionId('!!!', [], () => 'x')).toBe('world-x')
  })

  it('throws once every attempt collides, rather than looping forever', () => {
    expect(() => createUniqueSessionId('World', ['world-dup'], () => 'dup')).toThrow(
      'Could not allocate a unique session id',
    )
  })

  it('gives up after exactly 32 attempts, not 33', () => {
    // The always-colliding randomId above cannot tell "gives up after 32
    // attempts" from "gives up after 33" — it never emits a fresh id at all.
    // This generator collides for the first 32 calls, then produces a fresh
    // id on the 33rd. An attempt cap that is off by one (`<=` in place of
    // `<`) would reach that 33rd call and succeed where it must throw.
    const ATTEMPTS_BEFORE_GIVING_UP = 32
    let call = 0
    const randomId = (): string => {
      call += 1
      return call <= ATTEMPTS_BEFORE_GIVING_UP ? 'dup' : 'fresh'
    }

    expect(() => createUniqueSessionId('World', ['world-dup'], randomId)).toThrow(
      'Could not allocate a unique session id',
    )
    expect(call).toBe(ATTEMPTS_BEFORE_GIVING_UP)
  })

  it('SECOND ANGLE — property: every generated id satisfies the readSessionId contract mc-compose kept', () => {
    // Rather than one more example matching the happy path above, this checks
    // the cross-repository invariant the split in this file's header depends
    // on: whatever this generator produces, the parser left behind in
    // mc-compose must still accept it. Includes empty, whitespace-only,
    // very long, leading-hyphen, and non-Latin names.
    const worldNames = [
      'My World',
      '鉱山 & Plains / 100%?',
      '',
      '   ',
      'A'.repeat(200),
      '-leading-hyphen',
      '你好世界',
      'Tab\tName',
      '!!!only punctuation!!!',
    ]

    for (const name of worldNames) {
      const id = createUniqueSessionId(name, [])

      expect(id).toMatch(SESSION_ID_PATTERN)
      expect(id.length).toBeLessThanOrEqual(MAX_SESSION_ID_LENGTH)
    }
  })
})
