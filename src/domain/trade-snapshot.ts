import { type Brand, type Result, Schema, SchemaParser } from 'effect'
import type { IntentPayload } from '@nerima-games/mc-sim'

type TradeVillagerIntent = Extract<IntentPayload, { readonly _tag: 'TradeVillager' }>

const schemaArray = Schema.Array
const schemaLiterals = Schema.Literals
const schemaStruct = Schema.Struct

const EntityIdSchema = Schema.NonEmptyString.pipe(Schema.brand('EntityId'))
const TradeProfessionSchema = schemaLiterals(['farmer', 'toolsmith'])
const TradeOfferIdSchema = Schema.NonEmptyString.pipe(Schema.brand('TradeOfferId'))
const TradeStatusSchema = Schema.String.pipe(Schema.brand('TradeStatus'))

const TradeOfferSnapshotSchema = schemaStruct({
  available: Schema.Boolean,
  id: TradeOfferIdSchema,
  input: schemaStruct({
    count: Schema.Number,
    item: Schema.String,
  }),
  maxUses: Schema.Number,
  output: schemaStruct({
    count: Schema.Number,
    item: Schema.String,
  }),
  uses: Schema.Number,
})

export type TradeProfession = 'farmer' | 'toolsmith'
type TradeStatus = string & Brand.Brand<'TradeStatus'>

type TradeOfferSnapshot = {
  readonly available: boolean
  readonly id: TradeVillagerIntent['offerId']
  readonly input: {
    readonly count: number
    readonly item: string
  }
  readonly output: {
    readonly count: number
    readonly item: string
  }
  readonly uses: number
  readonly maxUses: number
}

export type TradeSnapshot = Readonly<{
  readonly actor: TradeVillagerIntent['actor']
  readonly villager: TradeVillagerIntent['villager']
  readonly profession: TradeProfession
  readonly offers: ReadonlyArray<TradeOfferSnapshot>
  readonly status: TradeStatus
}> & Brand.Brand<'TradeSnapshot'>

const TradeSnapshotSchemaImpl: Schema.Codec<TradeSnapshot, unknown, never, never> = schemaStruct({
  actor: EntityIdSchema,
  offers: schemaArray(TradeOfferSnapshotSchema),
  profession: TradeProfessionSchema,
  status: TradeStatusSchema,
  villager: EntityIdSchema,
}).pipe(Schema.brand('TradeSnapshot'))

const decodeStrictTradeSnapshot = SchemaParser.decodeUnknownEffect(TradeSnapshotSchemaImpl)

export const TradeSnapshotSchema: Schema.Codec<TradeSnapshot, unknown, never, never> =
  Schema.declareConstructor<TradeSnapshot, unknown>()(
    [],
    () => (input, _ast, options) =>
      decodeStrictTradeSnapshot(input, { ...options, onExcessProperty: 'error' }),
  )

const decodeTradeSnapshotImpl: (input: unknown) => Result.Result<TradeSnapshot, Schema.SchemaError> =
  (input) => Schema.decodeUnknownResult(TradeSnapshotSchema)(input)

export const decodeTradeSnapshot: typeof decodeTradeSnapshotImpl = decodeTradeSnapshotImpl
