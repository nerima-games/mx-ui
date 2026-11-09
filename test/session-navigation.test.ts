import { describe, expect, it } from 'vitest'
import { Result } from 'effect'
import type { CreateWorldRequest } from '../src/domain/main-menu'
import {
  createSessionHref,
  createUniqueSessionId,
  sessionHref,
  type SessionIdAllocationFailure,
} from '../src/domain/session-navigation'
import { asUiMessageText, asWorldSeedValue, asWorldTypeId } from './helpers/ui3-brand-values'

// Mirrors mc-compose's `readSessionId` contract exactly (that module stayed
// in mc-compose — see this file's header) so the generator here and the
// parser there cannot silently drift apart.
const SESSION_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u
const MAX_SESSION_ID_LENGTH = 128

const allocatedSessionId = (result: Result.Result<string, SessionIdAllocationFailure>): string => {
  if (Result.isSuccess(result)) {
    return result.success
  }
  expect.fail(`Session id allocation failed after ${result.failure.attempts} attempts`)
}

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
    const request: CreateWorldRequest = {
      mode: 'survival',
      name: asUiMessageText('鉱山 & Plains / 100%?'),
      seed: { kind: 'fixed', value: asWorldSeedValue(73) },
      difficulty: 'hard',
      worldType: asWorldTypeId('standard'),
    }
    const href = createSessionHref('world-123', request)
    const parsed = new URLSearchParams(new URL(href, 'https://example.test').search)

    expect(parsed.get('session')).toBe('world-123')
    expect(parsed.get('create')).toBe('1')
    expect(parsed.get('name')).toBe(request.name)
    expect(parsed.get('mode')).toBe('survival')
    expect(parsed.get('difficulty')).toBe('hard')
    expect(parsed.get('worldType')).toBe('standard')
    expect(parsed.get('seedKind')).toBe('fixed')
    expect(parsed.get('seed')).toBe('73')
  })

  it('carries all options and a random seed without inventing a numeric seed', () => {
    const request: CreateWorldRequest = {
      mode: 'creative',
      name: asUiMessageText('Flat World'),
      seed: { kind: 'random' },
      difficulty: 'peaceful',
      worldType: asWorldTypeId('flat-like-host-option'),
    }
    const href = createSessionHref('id', request)
    const parsed = new URLSearchParams(new URL(href, 'https://example.test').search)

    expect(parsed.get('mode')).toBe('creative')
    expect(parsed.get('difficulty')).toBe('peaceful')
    expect(parsed.get('worldType')).toBe('flat-like-host-option')
    expect(parsed.get('seedKind')).toBe('random')
    expect(parsed.has('seed')).toBe(false)
  })

  it('omits a world type when the host has not selected one', () => {
    const request: CreateWorldRequest = {
      mode: 'survival',
      name: asUiMessageText('Untyped world'),
      seed: { kind: 'random' },
      difficulty: 'normal',
    }
    const parsed = new URLSearchParams(new URL(createSessionHref('new-world', request), 'https://example.test').search)

    expect(parsed.get('session')).toBe('new-world')
    expect(parsed.has('worldType')).toBe(false)
  })
})

describe('createUniqueSessionId', () => {
  it('slugifies the world name and appends the generated id', () => {
    expect(allocatedSessionId(createUniqueSessionId('Cave Base!!', [], () => 'fixed-id'))).toBe(
      'cave-base-fixed-id',
    )
  })

  it('retries past a collision until it finds a free id', () => {
    const ids = ['try-1', 'try-2', 'try-3']
    let call = 0
    const randomId = (): string => {
      const next = ids[call] ?? 'exhausted'
      call += 1
      return next
    }

    expect(
      allocatedSessionId(createUniqueSessionId('World', ['world-try-1', 'world-try-2'], randomId)),
    ).toBe('world-try-3')
  })

  it('falls back to "world" for a name with no ASCII letters or digits', () => {
    expect(allocatedSessionId(createUniqueSessionId('!!!', [], () => 'x'))).toBe('world-x')
  })

  it('returns a typed failure once every attempt collides', () => {
    const result = createUniqueSessionId('World', ['world-dup'], () => 'dup')

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toEqual({ _tag: 'SessionIdAllocationFailure', attempts: 32 })
    }
  })

  it('fails after exactly 32 attempts without requesting a 33rd candidate', () => {
    // This generator collides for the first 32 calls, then produces a fresh
    // id on the 33rd. An attempt cap that is off by one (`<=` in place of
    // `<`) would reach that 33rd call and succeed.
    const ATTEMPTS_BEFORE_GIVING_UP = 32
    let call = 0
    const randomId = (): string => {
      call += 1
      return call <= ATTEMPTS_BEFORE_GIVING_UP ? 'dup' : 'fresh'
    }

    const result = createUniqueSessionId('World', ['world-dup'], randomId)

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure.attempts).toBe(ATTEMPTS_BEFORE_GIVING_UP)
    }
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
      const id = allocatedSessionId(createUniqueSessionId(name, []))

      expect(id).toMatch(SESSION_ID_PATTERN)
      expect(id.length).toBeLessThanOrEqual(MAX_SESSION_ID_LENGTH)
    }
  })
})
