/**
 * The main menu's session links — the half of mc-compose's
 * `apps/web/session-navigation.ts` this repository owns.
 *
 * The Wave 1 lowering appendix sends that whole file to mx-ui, but
 * `docs/responsibility.md`'s non-scope table and mc-compose's
 * `docs/e2e-triage.md` already commit to a narrower boundary: "stage の全順序表
 * ・Layer 配線・セッションライフサイクル（タイトル⇄ゲーム）" stays in mc-compose.
 * Deciding whether a URL loads an existing session or starts creation IS that
 * lifecycle decision — the exact distinction mc-compose's e2e-triage draws
 * between the demoted `main-menu.e2e.ts` rows that include a "Title → InGame"
 * transition (stay in compose) and the rows that only move where the menu
 * itself is (moved here, into `domain/main-menu.ts`). `readSessionRoute` /
 * `readSessionId` therefore did NOT move and are not in this file.
 *
 * What DID move is the other direction: the hrefs the main menu's own
 * controls build (the `load-world` row, the `new-world` confirm button).
 * Constructing a link is a menu concern in the same sense
 * `domain/main-menu.ts`'s `worldNameLabel` and `cycleGameMode` are — a pure
 * derivation of what the menu should show or send — and `createUniqueSessionId`
 * travels with them because building the "confirm new world" link needs an id
 * to put in it.
 */
import type { CreateWorldRequest } from './main-menu.js'

const SESSION_ID_ATTEMPTS = 32
const SESSION_ID_SLUG_MAX_LENGTH = 40
const SLUG_START = 0
const ZERO_LENGTH = 0
const ATTEMPT_START = 0
const ATTEMPT_STEP = 1

const sessionNameSlug = (name: string): string => {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(SLUG_START, SESSION_ID_SLUG_MAX_LENGTH)
  if (slug.length > ZERO_LENGTH) {
    return slug
  }
  return 'world'
}

/** The `load-world` row's target. */
export const sessionHref = (sessionId: string): string => `/?session=${encodeURIComponent(sessionId)}`

/** The `new-world` confirm button's target. `request` is not normalised here — mc-compose's `readSessionRoute` does that on the parsing side. */
export const createSessionHref = (sessionId: string, request: CreateWorldRequest): string => {
  const parameters = new URLSearchParams({
    create: '1',
    mode: request.mode,
    name: request.name,
    session: sessionId,
  })
  return `/?${parameters.toString()}`
}

/**
 * A fresh session id for a newly confirmed world.
 *
 * `existingIds` and the attempt cap exist for the reason mc-compose's original
 * version did: a collision is possible, not likely, and the cap turns
 * "possible" into "bounded" rather than an infinite loop.
 *
 * The generated id (a ≤40-char slug, a hyphen, a 36-char UUID) stays
 * comfortably under mc-compose's `readSessionId` 128-character ceiling and its
 * `^[a-z0-9][a-z0-9-]*$` pattern — `test/session-navigation.test.ts` asserts
 * this across a spread of world names, so the two repositories' independently
 * held constants cannot silently drift apart.
 */
export const createUniqueSessionId = (
  worldName: string,
  existingIds: Iterable<string>,
  randomId: () => string = () => crypto.randomUUID(),
): string => {
  const existing = new Set(existingIds)
  const prefix = sessionNameSlug(worldName)
  for (let attempt = ATTEMPT_START; attempt < SESSION_ID_ATTEMPTS; attempt += ATTEMPT_STEP) {
    const candidate = `${prefix}-${randomId()}`
    if (!existing.has(candidate)) {
      return candidate
    }
  }
  throw new Error('Could not allocate a unique session id')
}
