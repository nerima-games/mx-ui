import { DEFAULT_UI_LANGUAGE, type UiMessageValues, translateUiMessage } from './ui-language.js'
import type { TradeProfession, TradeSnapshot } from './trade-snapshot.js'
import type { IntentPayload } from '@nerima-games/mc-sim'

type TradeVillagerIntent = Extract<IntentPayload, { readonly _tag: 'TradeVillager' }>
type TradeOfferSnapshot = TradeSnapshot['offers'][number]

type TradeOfferView = {
  readonly id: TradeVillagerIntent['offerId']
  readonly label: string
  readonly labelMessage: UiMessageValues
  readonly disabled: boolean
}

type TradeViewModel = {
  readonly actor: TradeVillagerIntent['actor']
  readonly villager: TradeVillagerIntent['villager']
  readonly profession: TradeProfession
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

const offerMessage = (offer: TradeOfferSnapshot): UiMessageValues => ({
  input: offer.input.item,
  inputCount: offer.input.count,
  maxUses: offer.maxUses,
  output: offer.output.item,
  outputCount: offer.output.count,
  uses: offer.uses,
})

const projectOffer = (offer: TradeOfferSnapshot): TradeOfferView => {
  const labelMessage = offerMessage(offer)
  return Object.freeze({
    disabled: !offer.available,
    id: offer.id,
    label: translateUiMessage(DEFAULT_UI_LANGUAGE, 'trade.offer', labelMessage),
    labelMessage,
  })
}

const professionLabel = (profession: TradeProfession): string => {
  if (profession === 'farmer') {
    return translateUiMessage(DEFAULT_UI_LANGUAGE, 'trade.profession.farmer')
  }
  return translateUiMessage(DEFAULT_UI_LANGUAGE, 'trade.profession.toolsmith')
}

export const tradeViewModel = (snapshot: TradeSnapshot): TradeViewModel =>
  Object.freeze({
    actor: snapshot.actor,
    offers: Object.freeze(snapshot.offers.map(projectOffer)),
    profession: snapshot.profession,
    professionLabel: professionLabel(snapshot.profession),
    status: snapshot.status,
    villager: snapshot.villager,
  })
