/**
 * The numeric report: `pnpm preview --stats`.
 *
 * A dev application, not shipped API.
 *
 * ---------------------------------------------------------------------------
 * Why a picture is not enough
 * ---------------------------------------------------------------------------
 *
 * A row of hearts is unfalsifiable: every derivation produces something that
 * looks like a health bar. The claims `domain/` makes are exact — 「19 health is
 * nine full hearts and one half」, 「a caption's lifetime is three seconds」, 「a
 * conflict is reported, never silently resolved」 — and each one is either true
 * or false of the code as written.
 *
 * Every number below is MEASURED at run time from the shipped modules. Nothing
 * is a recorded expectation, so this report cannot go stale: fix the behaviour
 * and the finding disappears by itself.
 *
 * Not a test. `pnpm verify` does not run this. When a finding here is confirmed
 * it should become an assertion in `test/view-model.test.ts`, where it fails
 * loudly instead of waiting to be read.
 */
import {
  animationDurationMs,
  applyColorVisionMatrix,
  colorVisionAttribute,
  colorVisionMatrixValues,
  COLOR_VISION_FILTER_COLOR_SPACE,
  COLOR_VISION_FILTER_TARGET,
  COLOR_VISION_MODES,
  rebind,
  REBIND_CLEAR_KEYS,
  resolveMotionPreference,
  unboundActions,
  colorVisionMatrix,
  type MotionSetting,
} from '../../src/domain/accessibility'
import {
  captionLines,
  CAPTION_LIFETIME_SECS,
  emptyCaptionQueue,
  expireCaptions,
  MAX_VISIBLE_CAPTIONS,
  receiveCaption,
  type CaptionQueue,
} from '../../src/domain/caption'
import {
  hudViewModel,
  iconRow,
  spawnSnapshot,
  DEFAULT_MAX_HEALTH_POINTS,
  HOTBAR_SLOT_COUNT,
  type VitalsSnapshot,
} from '../../src/domain/hud-view-model'
import {
  emptyInventorySnapshot,
  INVENTORY_MAIN_SLOT_COUNT,
  INVENTORY_SLOT_COUNT,
  inventoryViewModel,
  regionOf,
} from '../../src/domain/inventory-view-model'
import { itemStack } from '@nerima-games/mc-sim'
import { escapePressed, openScreen, type ModalStack } from '../../src/domain/modal-stack'
import { COLLAPSE_SEPARATION, hex, surveyPalette } from '../../src/domain/palette'
import { DEFAULT_BINDINGS, PREVIEW_ACTIONS, SAMPLE_CAPTIONS, SAMPLE_HOTBAR } from './state'

const pad = (text: string, width: number): string =>
  text.length >= width ? text : text + ' '.repeat(width - text.length)

const padNumber = (value: number | string, width: number): string => {
  const text = String(value)
  return text.length >= width ? text : ' '.repeat(width - text.length) + text
}

const yesNo = (value: boolean): string => (value ? 'yes' : 'no')

const snapshotWith = (overrides: Partial<VitalsSnapshot>): VitalsSnapshot => ({
  ...spawnSnapshot,
  hotbar: SAMPLE_HOTBAR,
  ...overrides,
})

const iconSummary = (points: number): string => {
  const row = iconRow(points, DEFAULT_MAX_HEALTH_POINTS)
  return row.map((icon) => (icon === 'full' ? '#' : icon === 'half' ? '/' : '.')).join('')
}

// ---------------------------------------------------------------------------
// Caption timing
// ---------------------------------------------------------------------------

type CaptionProbe = {
  readonly atSecs: number
  readonly visible: number
  readonly freshness: ReadonlyArray<string>
}

const probeCaptionLifetime = (): ReadonlyArray<CaptionProbe> => {
  const settings = { captionsEnabled: true, audioUnlocked: false }
  let queue: CaptionQueue = emptyCaptionQueue
  const [first, second] = SAMPLE_CAPTIONS
  if (first === undefined || second === undefined) {
    return []
  }

  queue = receiveCaption(queue, { ...first, atSecs: 0 }, settings)
  queue = receiveCaption(queue, { ...second, atSecs: 1 }, settings)

  return [0, 1, 2, 2.9, 3, 3.5, 4, 5].map((atSecs) => {
    const expired = expireCaptions(queue, atSecs)
    return {
      atSecs,
      visible: expired.visible.length,
      freshness: captionLines(expired, atSecs).map((line) => line.freshness.toFixed(2)),
    }
  })
}

const probeOverflow = (): { readonly emitted: number; readonly kept: number; readonly dropped: string } => {
  const settings = { captionsEnabled: true, audioUnlocked: false }
  let queue: CaptionQueue = emptyCaptionQueue
  SAMPLE_CAPTIONS.forEach((sample, index) => {
    queue = receiveCaption(queue, { ...sample, atSecs: index }, settings)
  })
  const keptIds = new Set(queue.visible.map((event) => event.cueId))
  const dropped = SAMPLE_CAPTIONS.filter((sample) => !keptIds.has(sample.cueId)).map((sample) => sample.cueId)
  return { emitted: SAMPLE_CAPTIONS.length, kept: queue.visible.length, dropped: dropped.join(', ') }
}

// ---------------------------------------------------------------------------
// Colour vision
// ---------------------------------------------------------------------------

/**
 * The palette table is `surveyPalette()` and nothing else.
 *
 * The preview used to compute this itself over colours it had invented. It now
 * prints the SAME derivation `test/view-model.test.ts` asserts, which is the
 * only arrangement in which a clean table here and a green suite there mean the
 * same thing.
 */
const paletteLines = (): ReadonlyArray<string> => {
  const survey = surveyPalette()

  const tokenRows = survey.tokens.map(
    (token) =>
      `    ${pad(token.name, 20)}${pad(hex(token.color), 10)}${pad(token.role, 6)}` +
      `worst ${pad(`${token.worstContrast.toFixed(2)}:1`, 9)}floor ${pad(`${token.floor.toFixed(1)}:1`, 8)}` +
      `${token.meetsFloor ? '' : '  BELOW FLOOR'}${token.boundIsExact ? '' : '  BOUND NOT EXACT'}`,
  )

  const pairRows = survey.pairs.flatMap((reading) => [
    `    ${reading.pair.left.name} / ${reading.pair.right.name}  —  ${reading.pair.why}`,
    `      also carried by: ${reading.pair.alsoDistinguishedBy.join(', ')}${
      reading.hueOnly
        ? `   (separated by CHROMA, not luminance — so "${reading.pair.alsoDistinguishedBy.join('/')}" carries most of it)`
        : ''
    }`,
    ...reading.perMode.map(
      (mode) =>
        `      ${pad(mode.mode, 14)}${pad(hex(mode.left), 10)}${pad(hex(mode.right), 10)}` +
        `apart ${padNumber(mode.separation.toFixed(0), 4)}   contrast ${mode.contrast.toFixed(2)}:1` +
        `${mode.separation < COLLAPSE_SEPARATION ? '   COLLAPSED' : ''}`,
    ),
  ])

  return [
    '  the palette (domain/palette.ts), measured — not the preview’s own colours any more',
    '',
    '  legibility, against the HUD scrim over the WORST world pixel there is:',
    ...tokenRows,
    `    tokens below their floor: ${
      survey.tokensBelowFloor.length === 0 ? 'none' : survey.tokensBelowFloor.join(', ')
    }`,
    '',
    '  pairs that must stay distinguishable, as SIMULATED (not corrected — the',
    '  daltonisation filter is canvas-only, so these colours are never corrected):',
    ...pairRows,
    '',
    `    collapse threshold: ${String(COLLAPSE_SEPARATION)} of 442 (the sRGB cube diagonal)`,
    `    collapsed pairs: ${survey.collapsedPairs.length === 0 ? 'none' : survey.collapsedPairs.join(', ')}`,
    `    pairs carried by hue alone: ${
      survey.pairsWithoutRedundancy.length === 0 ? 'none' : survey.pairsWithoutRedundancy.join(', ')
    }`,
    `    undeclared near-collisions across ALL token pairs: ${
      survey.undeclaredNearCollisions.length === 0
        ? 'none'
        : survey.undeclaredNearCollisions
            .map((entry) => `${entry.left}/${entry.right} (${entry.separation.toFixed(0)})`)
            .join(', ')
    }`,
    '    NOTE: the table SIMULATES a deficiency; the matrices above CORRECT one. Different transforms.',
  ]
}

/**
 * The inventory and crafting projection, which used to be gap G2.
 *
 * What is printed is deliberately the UNKNOWNS as much as the slots: the point
 * of this derivation is that it refuses to answer questions mc-sim owns, and a
 * report that only showed the grid would hide the refusal.
 */
const inventoryLines = (): ReadonlyArray<string> => {
  const model = inventoryViewModel({
    ...emptyInventorySnapshot,
    inventory: {
      slots: Array.from({ length: INVENTORY_SLOT_COUNT }, (_, index) =>
        index === 0 ? itemStack('diamond_pickaxe', 1) : index === 11 ? itemStack('cobblestone', 64) : undefined,
      ),
    },
    durabilityBySlot: new Map([[0, 0.82]]),
    crafting: { gridWidth: 2, grid: Array.from({ length: 4 }), result: undefined },
  })

  const describe = (id: 'hotbar' | 'main' | 'armour' | 'offhand' | 'crafting-grid'): string => {
    const region = regionOf(model, id)
    if (region === undefined) {
      return `  ${pad(id, 16)}(absent)`
    }
    return region.kind === 'slots'
      ? `  ${pad(id, 16)}${padNumber(region.slots.length, 3)} slots, ${String(region.columns)} wide, ${String(region.slots.filter((slot) => !slot.empty).length)} occupied`
      : `  ${pad(id, 16)}UNKNOWN — ${region.why}`
  }

  return [
    `  layout is mx-ui’s: ${String(INVENTORY_SLOT_COUNT)} flat slots from mc-sim become 9 + ${String(INVENTORY_MAIN_SLOT_COUNT)}`,
    describe('hotbar'),
    describe('main'),
    describe('armour'),
    describe('offhand'),
    describe('crafting-grid'),
    `  crafting result   ${model.crafting.kind}   (mc-sim owns recipe matching — "unknown" is NOT "no-match")`,
    `  merge targets     ${model.mergeTargets.kind}   (mc-sim owns stacking — this repo has no canStack)`,
    '  every slot above is projected by the SAME slotView() the hotbar uses (DN-UI-7c)',
  ]
}

// ---------------------------------------------------------------------------
// Modal stack
// ---------------------------------------------------------------------------

const probeEscapeSequence = (): ReadonlyArray<string> => {
  let stack: ModalStack = openScreen(openScreen([], 'pause'), 'settings')
  const lines: Array<string> = [`  start: [${stack.join(', ')}]`]

  for (let press = 1; press <= 3; press += 1) {
    const { stack: nextStack, action, closed } = escapePressed(stack)
    stack = nextStack
    lines.push(
      `  escape ${String(press)}: action ${action}, closed ${String(closed)}, stack [${stack.join(', ')}]`,
    )
  }

  const duplicate = openScreen(openScreen(['inventory'], 'chat'), 'inventory')
  lines.push(`  open inventory twice: [${duplicate.join(', ')}]  (raised, not pushed)`)
  return lines
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

type Finding = {
  readonly title: string
  readonly detail: ReadonlyArray<string>
}

const collectFindings = (): ReadonlyArray<Finding> => {
  const findings: Array<Finding> = []

  // 1. Durability survives an emptied slot.
  const emptied = hudViewModel(
    snapshotWith({
      hotbar: [{ itemId: undefined, count: 0, durability: 0.5 }, ...SAMPLE_HOTBAR.slice(1)],
    }),
  )
  const [ghost] = emptied.hotbar
  if (ghost !== undefined && ghost.empty && ghost.durabilityPercent !== undefined) {
    findings.push({
      title: 'an empty hotbar slot still reports a durability percentage',
      detail: [
        `{ itemId: undefined, count: 0, durability: 0.5 } becomes { empty: true, itemId: undefined,`,
        `  countLabel: undefined, durabilityPercent: ${String(ghost.durabilityPercent)} }.`,
        'The `empty` guard clears itemId and countLabel and does not clear durabilityPercent',
        '(domain/hud-view-model.ts:105-124). A DOM layer that draws the bar when the field is',
        'present — the obvious way to write it — draws a durability bar under an empty slot.',
        'Reachable in play: a tool that breaks leaves count 0 with a durability still attached.',
      ],
    })
  }

  // 2. NaN defeats the clamp.
  const nanHealth = hudViewModel(snapshotWith({ healthPoints: Number.NaN }))
  const allEmpty = nanHealth.hearts.every((icon) => icon === 'empty')
  if (allEmpty && !nanHealth.dead) {
    findings.push({
      title: 'NaN health draws an empty heart row and reports dead: false',
      detail: [
        'iconRow clamps with Math.min/Math.max, which pass NaN through, so every comparison',
        'against it is false and every icon comes out empty. `dead` is a separate expression',
        '(Math.floor(healthPoints) <= 0) and NaN <= 0 is false — so the row says the player has no',
        'health and the flag says they are alive.',
        'The module clamps rather than rejects specifically because 「the snapshot comes from another',
        'repository across a version boundary」 (domain/hud-view-model.ts:78-90). NaN is exactly that',
        'class of input, and it is the one the clamp does not stop.',
      ],
    })
  }

  // 3. The same NaN hole, one field along.
  const nanSlot = hudViewModel(snapshotWith({ selectedHotbarIndex: Number.NaN }))
  if (!nanSlot.hotbar.some((slot) => slot.selected)) {
    findings.push({
      title: 'a NaN selectedHotbarIndex leaves NO slot selected',
      detail: [
        'selectedHotbarIndex is clamped 「rather than trusted」 because a wrapping scroll wheel or an',
        'old save can deliver 9 or -1, and 「none of them should make the HUD disappear」',
        '(domain/hud-view-model.ts:126-136). A NaN goes straight through the same clamp and no slot',
        'compares equal to it, so the selection highlight vanishes entirely.',
        'Same root cause as the finding above: clamp() is not NaN-safe, and three fields depend on it.',
      ],
    })
  }

  // 4. Rounding the XP bar to full before the level ticks.
  const nearlyLevelled = hudViewModel(snapshotWith({ experienceLevel: 7, experienceProgress: 0.999 }))
  if (nearlyLevelled.experiencePercent === 100 && nearlyLevelled.experienceLevelLabel === '7') {
    findings.push({
      title: 'the XP bar reads 100% one level early',
      detail: [
        'experienceProgress 0.999 at level 7 becomes { experienceLevelLabel: "7", experiencePercent: 100 }.',
        'Math.round takes anything above 0.995 to a full bar, so the player sees a filled bar and no',
        'level-up, which reads as a stuck HUD. Math.floor would show 99 and never lie in this',
        'direction; the cost is that a genuine 100% shows as 99 for one frame.',
        'Minor, and worth a decision rather than a default.',
      ],
    })
  }

  // 5. The daltonisation matrices, which used to be missing outright, are now
  //    carried over.
  if (colorVisionMatrix('protanopia') === undefined) {
    findings.push({
      title: 'the colour-vision setting has nothing in this repository to act on',
      detail: [
        'domain/accessibility.ts carries over the SWITCH — colorVisionAttribute() and',
        'COLOR_VISION_FILTER_TARGET = "canvas" — but not the feColorMatrix daltonisation itself.',
        'A data attribute with no filter behind it corrects nothing.',
      ],
    })
  }

  // 6. The palette's own guarantee, measured. Everything `surveyPalette`
  //    reports is a defect by construction, so any non-empty list is a finding
  //    rather than a note — and it disappears from this report the moment the
  //    palette is fixed, which is what separates a finding from a gap.
  const palette = surveyPalette()
  const paletteFaults = [
    ...palette.tokensBelowFloor.map((name) => `${name} does not clear its contrast floor`),
    ...palette.collapsedPairs.map((name) => `${name} collapses under a colour-vision mode`),
    ...palette.pairsWithoutRedundancy.map((name) => `${name} is carried by hue alone`),
    ...palette.undeclaredNearCollisions.map(
      (entry) => `${entry.left} and ${entry.right} are ${entry.separation.toFixed(0)} apart and undeclared`,
    ),
  ]
  if (paletteFaults.length > 0) {
    findings.push({
      title: 'the palette does not keep the guarantee domain/palette.ts states',
      detail: [
        ...paletteFaults,
        'The same survey is asserted by test/view-model.test.ts, describe "the palette keeps its',
        'guarantee", so this finding and a red suite are the same event seen twice.',
      ],
    })
  }

  return findings
}

/**
 * Gaps, as distinct from findings.
 *
 * A FINDING above is measured: the code is asked, and the entry only appears
 * when the answer is still wrong. A GAP is the absence of something, which
 * cannot be measured by running what is there. Keeping them in separate lists
 * is what lets the header above stay literally true — every number in this
 * report is measured — while still printing the two things a reader needs to
 * know.
 *
 * Both are pinned by tests, named below, so closing one shows up as a failing
 * assertion rather than as this paragraph quietly going stale.
 */
type Gap = {
  readonly title: string
  readonly pinnedBy: string
  readonly detail: ReadonlyArray<string>
}

const KNOWN_GAPS: ReadonlyArray<Gap> = [
  {
    title: 'the recipe half of crafting has no owner, and nothing tells mx-ui where the keyboard went',
    pinnedBy:
      'test/view-model.test.ts — "inventory and crafting project state without interpreting it"; ' +
      'test/hud-view.test.ts — "REGRESSION: making a slot focusable did not add a listener or a ' +
      'way to move focus"',
    detail: [
      'What USED to be here were two gaps: mx-ui defined no colours at all, and inventory/crafting',
      'had no derivation. Both closed. A third — "the palette has no consumer" — closed too. So did',
      'a fourth, which survived the third: THREE GUARDED TOKENS REACHED NO ELEMENT even after every',
      'token became a custom property, because declaring `--mx-ui-focus-ring` on a root is not the',
      'same as a screen drawing a focus ring. FOCUS_RING is now the hotbar’s (a roving-tabindex',
      'focus ring, DN-UI-13i) and STATUS_OK / STATUS_BUSY are now the autosave indicator’s',
      '(DN-UI-13h) — which was the uncomfortable one, because status ok / status alert is THE pair',
      'this survey found collapsed in the reference and the component that shows it did not exist.',
      'test/palette-css.test.ts now asserts that set is EMPTY.',
      '',
      'What is left is two separate things, kept in one entry because neither is fixable inside',
      'this repository today.',
      '',
      '  1. MC-SIM HAS NO RECIPE MODEL. The crafting SCREEN exists and projects what it is given,',
      '     but "does this grid make anything" has no answer to project: there is no Recipe in',
      '     mc-sim’s api-lock.md, so CraftingSnapshot.result is undefined in practice and the view',
      '     model reports `unknown`. That is the correct behaviour, not a placeholder — but the',
      '     screen cannot show a real crafting result until mc-sim owns one. Recipe matching is',
      '     mc-sim’s by plan.md §2.3-1 and inventing it here is what this repository must not do.',
      '',
      '  2. NOBODY TELLS MX-UI WHERE THE KEYBOARD WENT. The ring, the tokens and the tab stop are',
      '     all real, and native Tab agrees with the ring by construction because the hotbar is ONE',
      '     roving stop drawn on the same slot. But until the input owner calls setKeyboardFocus,',
      '     mx-ui does not KNOW focus moved — knowing would need addEventListener, which is',
      '     deliberately absent from application/dom-surface.ts (DN-UI-4, DN-UI-13c). A focus ring',
      '     is a rendering concern and it is built; a focus MOVE is an input one and it is',
      '     mc-render’s (plan.md §2.3-2). Note also what NO test in this repository can see: the',
      '     guarantee assumes guarded content stays ON the scrim, and containment in the element',
      '     that carries the scrim background is not the same as containment in its rendered pixels',
      '     — that is a browser question, and it is why completion criteria 3 and 4 are separate.',
    ],
  },
]

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export const buildStatsReport = (): ReadonlyArray<string> => {
  const lifetime = probeCaptionLifetime()
  const overflow = probeOverflow()
  const findings = collectFindings()

  const motionRows: ReadonlyArray<string> = (
    ['system', 'full', 'reduced'] as ReadonlyArray<MotionSetting>
  ).flatMap((setting) =>
    [false, true].map((systemPrefers) => {
      const resolved = resolveMotionPreference(setting, systemPrefers)
      return `  ${pad(setting, 10)}OS reduced ${pad(yesNo(systemPrefers), 6)}-> ${pad(resolved, 9)}300ms animation becomes ${String(animationDurationMs(300, resolved))}ms`
    }),
  )

  const conflict = rebind(DEFAULT_BINDINGS, 'jump', 'KeyW')
  const cleared = rebind(DEFAULT_BINDINGS, 'jump', 'Escape')
  const idempotent = rebind(DEFAULT_BINDINGS, 'jump', 'Space')
  const bound = rebind(DEFAULT_BINDINGS, 'drop', 'KeyQ')

  const lines: Array<string> = [
    'mx-ui screens — numeric report',
    'every number below is measured at run time from domain/; nothing is recorded.',
    '',
    '1. iconRow: points -> icons  (max 20, so 10 icons)',
    ...[20, 19, 11, 10, 1, 0, -3, 40].map(
      (points) => `  ${padNumber(points, 4)} points  ${iconSummary(points)}   ${pad(`(# full, / half, . empty)`, 26)}`,
    ),
    `  NaN points  ${iconSummary(Number.NaN)}   dead flag: ${String(hudViewModel(snapshotWith({ healthPoints: Number.NaN })).dead)}`,
    '',
    '2. hotbar view model',
    `  HOTBAR_SLOT_COUNT = ${String(HOTBAR_SLOT_COUNT)}`,
    ...hudViewModel(snapshotWith({ selectedHotbarIndex: 1 })).hotbar.map(
      (slot) =>
        `  slot ${String(slot.index + 1)}  ${pad(slot.itemId ?? '(none)', 16)}${pad(`count ${slot.countLabel ?? '-'}`, 12)}${pad(`durability ${slot.durabilityPercent === undefined ? '-' : `${String(slot.durabilityPercent)}%`}`, 18)}${slot.empty ? 'empty' : ''}${slot.selected ? '  <- selected' : ''}`,
    ),
    `  index 9 (past the end): ${String(hudViewModel(snapshotWith({ selectedHotbarIndex: 9 })).hotbar.findIndex((slot) => slot.selected))} selected`,
    `  index -1:               ${String(hudViewModel(snapshotWith({ selectedHotbarIndex: -1 })).hotbar.findIndex((slot) => slot.selected))} selected`,
    `  index NaN:              ${String(hudViewModel(snapshotWith({ selectedHotbarIndex: Number.NaN })).hotbar.findIndex((slot) => slot.selected))} selected`,
    '',
    `3. captions  (lifetime ${String(CAPTION_LIFETIME_SECS)}s, at most ${String(MAX_VISIBLE_CAPTIONS)} visible)`,
    '  two captions, emitted at t=0 and t=1',
    ...lifetime.map(
      (probe) =>
        `  t = ${pad(probe.atSecs.toFixed(2), 6)}visible ${String(probe.visible)}   freshness ${probe.freshness.join(' ')}`,
    ),
    `  ${String(overflow.emitted)} distinct cues emitted -> ${String(overflow.kept)} kept; dropped: ${overflow.dropped}`,
    '  captionsEnabled false -> the queue is returned unchanged (the player’s choice gates)',
    '  audioUnlocked is never read (plan.md §3.6: captions fire before the audio gate)',
    '',
    '4. motion',
    ...motionRows,
    '',
    '5. colour vision',
    ...COLOR_VISION_MODES.map(
      (mode) => `  ${pad(mode, 14)}body attribute: ${colorVisionAttribute(mode) ?? '(removed)'}`,
    ),
    '',
    `  the CORRECTION (daltonisation), applied to ${COLOR_VISION_FILTER_TARGET} in ${COLOR_VISION_FILTER_COLOR_SPACE}:`,
    ...COLOR_VISION_MODES.map(
      (mode) => `    ${pad(mode, 14)}${colorVisionMatrixValues(mode) ?? '(no filter — "off" installs none)'}`,
    ),
    '    every row sums to 1, so greys pass through unchanged. measured:',
    ...COLOR_VISION_MODES.flatMap((mode) => {
      const matrix = colorVisionMatrix(mode)
      if (matrix === undefined) {
        return []
      }
      const [r, g, b] = applyColorVisionMatrix([0.5, 0.5, 0.5], matrix)
      const grey = `mid grey -> ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`
      if (mode === 'tritanopia') {
        // The blue-deficient case redistributes differently; claiming the
        // red/green-into-blue story here would be the preview describing a
        // transform it is not looking at.
        return [`    ${pad(mode, 14)}${grey}`]
      }
      const red = applyColorVisionMatrix([1, 0, 0], matrix)
      const green = applyColorVisionMatrix([0, 1, 0], matrix)
      return [
        `    ${pad(mode, 14)}${grey}   ` +
          `red’s blue ${red[2].toFixed(3)} vs green’s ${green[2].toFixed(3)} — the pair separates on the channel that survives`,
      ]
    }),
    '',
    ...paletteLines(),
    '',
    '6. key rebinding',
    `  clear keys: ${[...REBIND_CLEAR_KEYS].join(', ')}`,
    `  jump -> KeyW (already moveForward): ${conflict.kind}${conflict.kind === 'conflict' ? ` held by ${conflict.heldBy}` : ''}`,
    `  jump -> Escape:                     ${cleared.kind}`,
    `  jump -> Space (what it already is): ${idempotent.kind}`,
    `  drop -> KeyQ:                       ${bound.kind}`,
    `  unbound actions: ${unboundActions(DEFAULT_BINDINGS, PREVIEW_ACTIONS).join(', ')}`,
    '',
    '7. the modal stack and the one Escape handler',
    ...probeEscapeSequence(),
    '',
    '8. inventory and crafting',
    ...inventoryLines(),
    '',
    `findings: ${String(findings.length)}  (measured — an entry appears only while the behaviour is still wrong)`,
  ]

  findings.forEach((finding, index) => {
    lines.push('')
    lines.push(`  F${String(index + 1)}. ${finding.title}`)
    for (const detail of finding.detail) {
      lines.push(`      ${detail}`)
    }
  })

  if (findings.length === 0) {
    lines.push('  none. every finding this report used to carry is now an assertion in')
    lines.push('  test/view-model.test.ts, where it fails loudly instead of waiting to be read.')
  }

  lines.push('')
  lines.push(`gaps: ${String(KNOWN_GAPS.length)}  (absences — not measurable by running what is here, so each names its pinning test)`)

  KNOWN_GAPS.forEach((gap, index) => {
    lines.push('')
    lines.push(`  G${String(index + 1)}. ${gap.title}`)
    for (const detail of gap.detail) {
      lines.push(`      ${detail}`)
    }
    lines.push(`      pinned by: ${gap.pinnedBy}`)
  })

  lines.push('')
  return lines
}
