import {
  bossHealthBarViewModel,
  dragonDefeatRewardNotification,
  portalEyeProgressViewModel,
  strongholdLocatorViewModel,
  type BossHealthSnapshot,
  type DragonDefeatRewardSnapshot,
  type StrongholdLocatorSnapshot,
} from '../../src/domain/end-hud'
import type { DomElement, DomElementFactory } from '../../src/application/dom-surface'
import type { ScenarioContext, ScenarioDefinition, ScenarioMount } from './scenario-types'

type InspectorRow = {
  readonly id: string
  readonly feature: string
  readonly scenario: string
  readonly input: string
  readonly derived: string
  readonly accessibleResult: string
}

type BossCase = {
  readonly id: string
  readonly scenario: string
  readonly snapshot: BossHealthSnapshot
}

const bossCases: ReadonlyArray<BossCase> = [
  {
    id: 'boss-zero',
    scenario: 'Zero',
    snapshot: { current: 0, max: 100, name: 'Ender Dragon', phase: 'circling' },
  },
  {
    id: 'boss-full',
    scenario: 'Maximum',
    snapshot: { current: 100, max: 100, name: 'Ender Dragon', phase: 'charging' },
  },
  {
    id: 'boss-over-max',
    scenario: 'Over maximum',
    snapshot: { current: 150, max: 100, name: 'Ender Dragon', phase: 'charging' },
  },
  {
    id: 'boss-nan-current',
    scenario: 'NaN current',
    snapshot: { current: Number.NaN, max: 100, name: 'Ender Dragon', phase: 'circling' },
  },
  {
    id: 'boss-nan-max',
    scenario: 'NaN maximum',
    snapshot: { current: 50, max: Number.NaN, name: 'Ender Dragon', phase: 'circling' },
  },
]

const bossRows: ReadonlyArray<InspectorRow> = bossCases.map(({ id, scenario, snapshot }) => {
  const view = bossHealthBarViewModel(snapshot)
  return {
    accessibleResult: view.accessibleLabel,
    derived: `current=${view.current}; max=${view.max}; progress=${view.progressPercent}%; hidden=${String(view.hidden)}`,
    feature: 'Boss health',
    id,
    input: `current=${String(snapshot.current)}; max=${String(snapshot.max)}; phase=${snapshot.phase}`,
    scenario,
  }
})

type LocatorCase = {
  readonly id: string
  readonly scenario: string
  readonly snapshot: StrongholdLocatorSnapshot
  readonly input: string
}

const locatorCases: ReadonlyArray<LocatorCase> = [
  {
    id: 'locator-origin',
    scenario: 'Origin',
    snapshot: { distanceBlocks: 0, relativeBearingDegrees: 0, status: 'tracking' },
    input: 'bearing=0°; distance=0 blocks',
  },
  {
    id: 'locator-wrapped',
    scenario: 'Wrapped bearing',
    snapshot: { distanceBlocks: 128.2, relativeBearingDegrees: 405, status: 'tracking' },
    input: 'bearing=405°; distance=128.2 blocks',
  },
  {
    id: 'locator-behind',
    scenario: 'Behind',
    snapshot: { distanceBlocks: 1, relativeBearingDegrees: 180, status: 'tracking' },
    input: 'bearing=180°; distance=1 blocks',
  },
  {
    id: 'locator-nan-bearing',
    scenario: 'NaN bearing',
    snapshot: { distanceBlocks: 20, relativeBearingDegrees: Number.NaN, status: 'tracking' },
    input: 'bearing=NaN°; distance=20 blocks',
  },
  {
    id: 'locator-nan-distance',
    scenario: 'NaN distance',
    snapshot: { distanceBlocks: Number.NaN, relativeBearingDegrees: 0, status: 'tracking' },
    input: 'bearing=0°; distance=NaN blocks',
  },
]

const locatorRows: ReadonlyArray<InspectorRow> = locatorCases.map(({ id, scenario, snapshot, input }) => {
  const view = strongholdLocatorViewModel(snapshot)
  const derived = view.status === 'tracking'
    ? `status=tracking; bearing=${view.relativeBearingDegrees}°; distance=${view.distanceBlocks} blocks`
    : `status=${view.status}`
  return {
    accessibleResult: view.accessibleLabel,
    derived,
    feature: 'Stronghold locator',
    id,
    input,
    scenario,
  }
})

const eyeCases: ReadonlyArray<{ readonly id: string; readonly scenario: string; readonly inserted: number }> = [
  { id: 'eyes-zero', scenario: 'Zero', inserted: 0 },
  { id: 'eyes-half', scenario: 'Half', inserted: 6 },
  { id: 'eyes-full', scenario: 'Maximum', inserted: 12 },
  { id: 'eyes-over-max', scenario: 'Over maximum', inserted: 15 },
  { id: 'eyes-nan', scenario: 'NaN', inserted: Number.NaN },
]

const eyeRows: ReadonlyArray<InspectorRow> = eyeCases.map(({ id, scenario, inserted }) => {
  const view = portalEyeProgressViewModel(inserted)
  return {
    accessibleResult: view.accessibleLabel,
    derived: `inserted=${view.inserted}/${view.total}; progress=${view.progressPercent}%; complete=${String(view.complete)}`,
    feature: 'Portal eyes',
    id,
    input: `inserted=${String(inserted)}`,
    scenario,
  }
})

type RewardCase = {
  readonly id: string
  readonly scenario: string
  readonly input: string
  readonly snapshot: DragonDefeatRewardSnapshot
}

const rewardCases: ReadonlyArray<RewardCase> = [
  {
    id: 'reward-zero',
    scenario: 'Zero XP',
    input: 'eventId=encounter-zero; experiencePoints=0',
    snapshot: { eventId: 'encounter-zero', experiencePoints: 0 },
  },
  {
    id: 'reward-ordinary',
    scenario: 'Typical XP',
    input: 'eventId=encounter-42; experiencePoints=12000',
    snapshot: { eventId: 'encounter-42', experiencePoints: 12_000 },
  },
  {
    id: 'reward-max',
    scenario: 'Maximum XP',
    input: 'eventId=encounter-max; experiencePoints=9007199254740991',
    snapshot: { eventId: 'encounter-max', experiencePoints: Number.MAX_SAFE_INTEGER },
  },
  {
    id: 'reward-over-max',
    scenario: 'Over maximum',
    input: 'eventId=encounter-over-max; experiencePoints=9007199254740992',
    snapshot: { eventId: 'encounter-over-max', experiencePoints: Number.MAX_SAFE_INTEGER + 1 },
  },
  {
    id: 'reward-nan',
    scenario: 'NaN XP',
    input: 'eventId=encounter-nan; experiencePoints=NaN',
    snapshot: { eventId: 'encounter-nan', experiencePoints: Number.NaN },
  },
  {
    id: 'reward-empty-id',
    scenario: 'Blank event id',
    input: "eventId='   '; experiencePoints=12",
    snapshot: { eventId: '   ', experiencePoints: 12 },
  },
]

const rewardRows: ReadonlyArray<InspectorRow> = rewardCases.map(({ id, scenario, input, snapshot }) => {
  const view = dragonDefeatRewardNotification(snapshot)
  return {
    accessibleResult: view?.accessibleLabel ?? 'No defeat reward notification.',
    derived: view === undefined
      ? 'notification=none; presentationKey=none; experiencePoints=none'
      : `presentationKey=${view.presentationKey}; experiencePoints=${view.experiencePoints}`,
    feature: 'Defeat reward',
    id,
    input,
    scenario,
  }
})

const inspectorRows: ReadonlyArray<InspectorRow> = [
  ...bossRows,
  ...locatorRows,
  ...eyeRows,
  ...rewardRows,
]

const noTime = (): void => undefined

const makeCell = (factory: DomElementFactory, tag: string, text: string): DomElement => {
  const cell = factory.createElement(tag)
  cell.textContent = text
  return cell
}

const mountInspector = (context: ScenarioContext): ScenarioMount => {
  const root = context.factory.createElement('section')
  root.setAttribute('data-end-hud-inspector', '')

  const mobileStyles = context.factory.createElement('style')
  mobileStyles.textContent = `
    @media (max-width: 600px) {
      [data-end-hud-inspector] {
        box-sizing: border-box;
        max-width: 100%;
        min-width: 0;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        -webkit-overflow-scrolling: touch;
      }

      [data-end-hud-inspector] table {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        table-layout: fixed;
      }

      [data-end-hud-inspector] caption {
        max-width: 100%;
        overflow-wrap: anywhere;
        white-space: normal;
      }

      [data-end-hud-inspector] th,
      [data-end-hud-inspector] td {
        white-space: nowrap;
      }
    }
  `
  root.appendChild(mobileStyles)

  const note = context.factory.createElement('p')
  note.setAttribute('role', 'note')
  note.textContent = 'Browser debug harness output only; this is not an in-game screen.'
  root.appendChild(note)

  const table = context.factory.createElement('table')
  const caption = makeCell(
    context.factory,
    'caption',
    'End HUD derived data inspector (read-only)',
  )
  table.appendChild(caption)

  const head = context.factory.createElement('thead')
  const headingRow = context.factory.createElement('tr')
  for (const heading of ['Feature', 'Case', 'Input', 'Derived state', 'Accessible result']) {
    const header = makeCell(context.factory, 'th', heading)
    header.setAttribute('scope', 'col')
    headingRow.appendChild(header)
  }
  head.appendChild(headingRow)
  table.appendChild(head)

  const body = context.factory.createElement('tbody')
  for (const inspectorRow of inspectorRows) {
    const row = context.factory.createElement('tr')
    row.setAttribute('data-case', inspectorRow.id)
    for (const value of [
      inspectorRow.feature,
      inspectorRow.scenario,
      inspectorRow.input,
      inspectorRow.derived,
      inspectorRow.accessibleResult,
    ]) {
      row.appendChild(makeCell(context.factory, 'td', value))
    }
    body.appendChild(row)
  }
  table.appendChild(body)
  root.appendChild(table)
  context.host.appendChild(root)

  return { dispose: noTime, root, setTime: noTime, viewModel: () => inspectorRows }
}

// Attach to the existing HUD screen because each registered screen needs a default scenario.
export const END_HUD_INSPECTOR_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  {
    id: 'end-hud-inspector',
    isDefault: false,
    mount: mountInspector,
    screen: 'hud',
    surface: 'Read-only debug data',
    title: 'End HUD inspector (read-only)',
  },
]
