import { Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  decodeTradeSnapshot,
  TradeSnapshotSchema,
  type TradeSnapshot,
} from '../src/domain/trade-snapshot.js'

const VALID_OFFER = {
  available: true,
  id: 'farmer-offer-1',
  input: { count: 4, item: 'minecraft:wheat' },
  output: { count: 1, item: 'minecraft:emerald' },
  uses: 2,
  maxUses: 7,
}

const VALID_RAW_SNAPSHOT = {
  actor: 'player-1',
  villager: 'villager-1',
  profession: 'farmer',
  offers: [VALID_OFFER],
  status: 'Choose a trade',
}

const REQUIRED_TOP_LEVEL_FIELDS = ['actor', 'villager', 'profession', 'offers', 'status'] as const

const omitKey = (value: object, key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([candidate]) => candidate !== key))

const withOffer = (offer: unknown): unknown => ({
  ...VALID_RAW_SNAPSHOT,
  offers: [offer],
})

const expectSchemaFailure = (result: ReturnType<typeof decodeTradeSnapshot>): void => {
  expect(Result.isFailure(result)).toBe(true)
  if (Result.isFailure(result)) {
    const failure: Schema.SchemaError = result.failure
    expect(Schema.isSchemaError(failure)).toBe(true)
  }
}

const NULL_REQUIRED_VALUE_CASES: ReadonlyArray<Readonly<{ label: string; input: unknown }>> = [
  { label: 'actor', input: { ...VALID_RAW_SNAPSHOT, actor: null } },
  { label: 'villager', input: { ...VALID_RAW_SNAPSHOT, villager: null } },
  { label: 'profession', input: { ...VALID_RAW_SNAPSHOT, profession: null } },
  { label: 'offers', input: { ...VALID_RAW_SNAPSHOT, offers: null } },
  { label: 'status', input: { ...VALID_RAW_SNAPSHOT, status: null } },
  { label: 'offer', input: withOffer(null) },
  { label: 'offer.available', input: withOffer({ ...VALID_OFFER, available: null }) },
  { label: 'offer.id', input: withOffer({ ...VALID_OFFER, id: null }) },
  { label: 'offer.input', input: withOffer({ ...VALID_OFFER, input: null }) },
  {
    label: 'offer.input.count',
    input: withOffer({ ...VALID_OFFER, input: { ...VALID_OFFER.input, count: null } }),
  },
  {
    label: 'offer.input.item',
    input: withOffer({ ...VALID_OFFER, input: { ...VALID_OFFER.input, item: null } }),
  },
  { label: 'offer.output', input: withOffer({ ...VALID_OFFER, output: null }) },
  {
    label: 'offer.output.count',
    input: withOffer({ ...VALID_OFFER, output: { ...VALID_OFFER.output, count: null } }),
  },
  {
    label: 'offer.output.item',
    input: withOffer({ ...VALID_OFFER, output: { ...VALID_OFFER.output, item: null } }),
  },
  { label: 'offer.uses', input: withOffer({ ...VALID_OFFER, uses: null }) },
  { label: 'offer.maxUses', input: withOffer({ ...VALID_OFFER, maxUses: null }) },
]

const EXTRA_KEY_CASES: ReadonlyArray<Readonly<{ label: string; input: unknown }>> = [
  { label: 'top-level', input: { ...VALID_RAW_SNAPSHOT, unexpected: true } },
  { label: 'offer', input: withOffer({ ...VALID_OFFER, unexpected: true }) },
  {
    label: 'offer.input',
    input: withOffer({ ...VALID_OFFER, input: { ...VALID_OFFER.input, unexpected: true } }),
  },
  {
    label: 'offer.output',
    input: withOffer({ ...VALID_OFFER, output: { ...VALID_OFFER.output, unexpected: true } }),
  },
]

describe('TradeSnapshot schema', () => {
  it('decodes the valid local fixture through the schema and public decoder', () => {
    const schemaResult = Schema.decodeUnknownResult(TradeSnapshotSchema)(VALID_RAW_SNAPSHOT)
    const decoderResult = decodeTradeSnapshot(VALID_RAW_SNAPSHOT)

    expect(Result.isSuccess(schemaResult)).toBe(true)
    expect(Result.isSuccess(decoderResult)).toBe(true)
    if (Result.isSuccess(schemaResult) && Result.isSuccess(decoderResult)) {
      const schemaSnapshot: TradeSnapshot = schemaResult.success
      const decodedSnapshot: TradeSnapshot = decoderResult.success
      expect(schemaSnapshot).toStrictEqual(VALID_RAW_SNAPSHOT)
      expect(decodedSnapshot).toStrictEqual(schemaSnapshot)
    }
  })

  it.each(REQUIRED_TOP_LEVEL_FIELDS)('rejects a missing top-level %s field', (field) => {
    expectSchemaFailure(decodeTradeSnapshot(omitKey(VALID_RAW_SNAPSHOT, field)))
  })

  it('rejects a missing offer available field', () => {
    expectSchemaFailure(decodeTradeSnapshot(withOffer(omitKey(VALID_OFFER, 'available'))))
  })

  it.each(NULL_REQUIRED_VALUE_CASES)('rejects null for required field $label', ({ input }) => {
    expectSchemaFailure(decodeTradeSnapshot(input))
  })

  it.each(EXTRA_KEY_CASES)('rejects an extra key at $label', ({ input }) => {
    expectSchemaFailure(decodeTradeSnapshot(input))
  })

  it('rejects an unknown profession', () => {
    expectSchemaFailure(decodeTradeSnapshot({ ...VALID_RAW_SNAPSHOT, profession: 'librarian' }))
  })
})
