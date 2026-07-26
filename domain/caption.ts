/**
 * Sound captions.
 *
 * ---------------------------------------------------------------------------
 * The rule that is easy to get backwards
 * ---------------------------------------------------------------------------
 *
 * plan.md §3.6: 「字幕イベントはオーディオゲート(ブラウザの自動再生制限)より**前**に
 * 発火する(参照実装の確定挙動: 音が出せない状態でも字幕は出る)」.
 *
 * A browser will not play audio until the user has interacted with the page. The
 * obvious implementation — emit the caption where the sound is played — means a
 * deaf player sees nothing at all until they happen to click, and sees nothing
 * ever if they have muted the game. That is the opposite of what a caption is
 * for.
 *
 * mc-audio therefore emits captions BEFORE consulting the gate, and mx-ui
 * subscribes to that stream. The consequence for this file is a negative one:
 * `audioUnlocked` appears in `CaptionSettings` and is NOT read by
 * `receiveCaption`. It is there so that the omission is visible and testable
 * rather than merely absent — see `test/caption.test.ts`.
 *
 * `captionsEnabled` DOES gate, because that is a player's explicit choice.
 *
 * ---------------------------------------------------------------------------
 * Why the queue is time-free
 * ---------------------------------------------------------------------------
 *
 * Captions expire, and expiry needs a clock — which plan.md §4.3 says must be
 * injected, never read from a global (`Date.now()` is banned repository-wide and
 * enforced by `pnpm check:deps`). Rather than take a clock dependency here, the
 * queue is bounded by COUNT and the caller supplies the monotonic timestamp it
 * already has. A caption's lifetime is then a subtraction, and this module never
 * asks what time it is.
 */

export type CaptionEvent = {
  /** The sound cue that produced it, e.g. `entity.creeper.primed`. */
  readonly cueId: string
  /** Human-readable text, already localised by whoever owns the strings. */
  readonly text: string
  /**
   * Where the sound came from relative to the listener, for the directional
   * arrow. `undefined` for a non-positional sound such as music.
   */
  readonly direction: 'left' | 'right' | 'ahead' | 'behind' | undefined
  /** Monotonic seconds, supplied by the caller. Never read from a global. */
  readonly atSecs: number
}

export type CaptionSettings = {
  /** The player's explicit choice. This one DOES gate. */
  readonly captionsEnabled: boolean
  /**
   * Whether the browser's autoplay gate has been satisfied.
   *
   * DELIBERATELY UNUSED by `receiveCaption`. See the note at the top of this
   * file: a caption that waits for audio is a caption that never appears for the
   * player who needs it most.
   */
  readonly audioUnlocked: boolean
}

/**
 * How many captions are on screen at once.
 *
 * Four, because a caption list that grows without bound becomes a wall of text
 * during combat and stops being readable, which is the same as not being there.
 */
export const MAX_VISIBLE_CAPTIONS = 4

/** How long a caption stays up, in seconds. */
export const CAPTION_LIFETIME_SECS = 3

export type CaptionQueue = {
  /** Newest first. */
  readonly visible: ReadonlyArray<CaptionEvent>
}

export const emptyCaptionQueue: CaptionQueue = { visible: [] }

/**
 * Accept a caption event.
 *
 * Repeating the same cue refreshes the existing entry rather than stacking a
 * second copy: eight footsteps in a second are one fact, not eight.
 */
export const receiveCaption = (
  queue: CaptionQueue,
  event: CaptionEvent,
  settings: CaptionSettings,
): CaptionQueue => {
  if (!settings.captionsEnabled) {
    return queue
  }

  const withoutDuplicate = queue.visible.filter((existing) => existing.cueId !== event.cueId)
  return { visible: [event, ...withoutDuplicate].slice(0, MAX_VISIBLE_CAPTIONS) }
}

/**
 * Drop captions older than `CAPTION_LIFETIME_SECS`.
 *
 * `nowSecs` is a parameter, not a reading. That is what lets a scenario test
 * fast-forward a caption's lifetime without waiting three real seconds, and it
 * is the same discipline plan.md §5.1-3 asks of the whole simulation.
 */
export const expireCaptions = (
  queue: CaptionQueue,
  nowSecs: number,
  lifetimeSecs: number = CAPTION_LIFETIME_SECS,
): CaptionQueue => {
  const visible = queue.visible.filter((event) => nowSecs - event.atSecs < lifetimeSecs)
  return visible.length === queue.visible.length ? queue : { visible }
}

export type CaptionLineView = {
  readonly text: string
  readonly arrow: '←' | '→' | '↑' | '↓' | undefined
  /** 0–1; the DOM layer turns this into an opacity. */
  readonly freshness: number
}

const ARROWS = {
  left: '←',
  right: '→',
  ahead: '↑',
  behind: '↓',
} as const

/**
 * Project the queue for rendering.
 *
 * `freshness` fades a caption out as it ages. Note that the fade is a
 * PRESENTATION property and must be suppressed under reduced motion — see
 * `domain/accessibility.ts`; the DOM layer is responsible for asking.
 */
export const captionLines = (
  queue: CaptionQueue,
  nowSecs: number,
  lifetimeSecs: number = CAPTION_LIFETIME_SECS,
): ReadonlyArray<CaptionLineView> =>
  queue.visible.map((event) => ({
    text: event.text,
    arrow: event.direction === undefined ? undefined : ARROWS[event.direction],
    freshness:
      lifetimeSecs <= 0
        ? 0
        : Math.min(Math.max(1 - (nowSecs - event.atSecs) / lifetimeSecs, 0), 1),
  }))
