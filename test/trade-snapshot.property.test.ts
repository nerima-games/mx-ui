import { Result, Schema } from 'effect'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  decodeTradeSnapshot,
  TradeSnapshotSchema,
  type TradeSnapshot,
} from '../src/domain/trade-snapshot.js'

const tradeSnapshotWithoutOffersArbitrary = fc.record({
  actor: fc.uuid().map((id) => `player-${id}`),
  profession: fc.constantFrom('farmer', 'toolsmith'),
  status: fc.string({ minLength: 1 }),
  villager: fc.uuid().map((id) => `villager-${id}`),
}).map(({ actor, profession, status, villager }) => ({
  actor,
  offers: [],
  profession,
  status,
  villager,
}))

describe('TradeSnapshot properties', () => {
  it('accepts zero offers for generated valid ids and required fields', () => {
    fc.assert(
      fc.property(tradeSnapshotWithoutOffersArbitrary, (input) => {
        const schemaResult = Schema.decodeUnknownResult(TradeSnapshotSchema)(input)
        const decoderResult = decodeTradeSnapshot(input)

        expect(Result.isSuccess(schemaResult)).toBe(true)
        expect(Result.isSuccess(decoderResult)).toBe(true)
        if (Result.isSuccess(schemaResult) && Result.isSuccess(decoderResult)) {
          const schemaSnapshot: TradeSnapshot = schemaResult.success
          const decodedSnapshot: TradeSnapshot = decoderResult.success
          expect(schemaSnapshot).toStrictEqual(input)
          expect(decodedSnapshot).toStrictEqual(schemaSnapshot)
        }
      }),
      { numRuns: 200 },
    )
  })
})
