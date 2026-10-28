import type { IntentPayload } from '@nerima-games/mc-sim'

type TradeVillagerIntent = Extract<IntentPayload, { readonly _tag: 'TradeVillager' }>

export type TradeProfession = 'farmer' | 'toolsmith'

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

type TradeSnapshot = {
  readonly actor: TradeVillagerIntent['actor']
  readonly villager: TradeVillagerIntent['villager']
  readonly profession: TradeProfession
  readonly offers: ReadonlyArray<TradeOfferSnapshot>
  readonly status: string
}

type TradeOfferView = {
  readonly id: TradeVillagerIntent['offerId']
  readonly label: string
  readonly disabled: boolean
}

type TradeViewModel = {
  readonly actor: TradeVillagerIntent['actor']
  readonly villager: TradeVillagerIntent['villager']
  readonly professionLabel: string
  readonly offers: ReadonlyArray<TradeOfferView>
  readonly status: string
}

export type TradeViewIntent =
  | TradeVillagerIntent
  | Readonly<{
      _tag: 'CloseTradeUi'
    }>

export type TradeViewActions = {
  readonly onIntent: (intent: TradeViewIntent) => void
}

const projectOffer = (offer: TradeOfferSnapshot): TradeOfferView =>
  Object.freeze({
    disabled: !offer.available,
    id: offer.id,
    label: `${String(offer.input.count)} ${offer.input.item} -> ${String(offer.output.count)} ${offer.output.item} (${String(offer.uses)}/${String(offer.maxUses)})`,
  })

const professionLabel = (profession: TradeProfession): string => {
  if (profession === 'farmer') {
    return 'Farmer'
  }
  return 'Toolsmith'
}

export const tradeViewModel = (snapshot: TradeSnapshot): TradeViewModel =>
  Object.freeze({
    actor: snapshot.actor,
    offers: Object.freeze(snapshot.offers.map(projectOffer)),
    professionLabel: professionLabel(snapshot.profession),
    status: snapshot.status,
    villager: snapshot.villager,
  })
