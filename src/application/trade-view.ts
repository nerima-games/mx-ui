import {
  type AttributeCell,
  type TextCell,
  attributeCell,
  textCell,
  writeAttribute,
  writeHidden,
  writeText,
} from './dom-write.js'
import type { DomElement, DomElementFactory, DomInteractiveElement } from './dom-surface.js'
import {
  type TradeViewActions,
  type TradeViewIntent,
  tradeViewModel,
} from '../domain/trade-view-model.js'

type TradeViewModel = ReturnType<typeof tradeViewModel>

export type TradeView = {
  readonly root: DomElement
  readonly render: (model: TradeViewModel) => void
}

type TradeOfferElement = {
  readonly button: DomInteractiveElement
  readonly label: TextCell
  readonly disabled: AttributeCell
  readonly hidden: AttributeCell
  intent: TradeViewIntent | null
}

const createTradeRoot = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'trade')
  parent.appendChild(root)
  return root
}

const createProfessionHeading = (factory: DomElementFactory, root: DomElement): TextCell => {
  const heading = factory.createElement('h2')
  heading.setAttribute('data-mx-ui', 'trade-profession')
  root.appendChild(heading)
  return textCell(heading)
}

const createOfferList = (factory: DomElementFactory, root: DomElement): DomElement => {
  const offers = factory.createElement('div')
  offers.setAttribute('data-mx-ui', 'trade-offers')
  root.appendChild(offers)
  return offers
}

const createTradeStatus = (factory: DomElementFactory, root: DomElement): TextCell => {
  const status = factory.createElement('p')
  status.setAttribute('data-mx-ui', 'trade-status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.setAttribute('aria-atomic', 'true')
  root.appendChild(status)
  return textCell(status)
}

const createCloseButton = (
  factory: DomElementFactory,
  actions: TradeViewActions,
): DomInteractiveElement => {
  const close = factory.createElement('button')
  close.setAttribute('type', 'button')
  close.setAttribute('data-mx-ui', 'trade-close')
  close.textContent = 'Close'
  close.addEventListener('click', () => {
    actions.onIntent({ _tag: 'CloseTradeUi' })
  })
  return close
}

const createTradeOfferElement = (
  factory: DomElementFactory,
  actions: TradeViewActions,
): TradeOfferElement => {
  const button = factory.createElement('button')
  button.setAttribute('type', 'button')
  button.setAttribute('data-mx-ui', 'trade-offer')

  const element: TradeOfferElement = {
    button,
    disabled: attributeCell(button, 'disabled'),
    hidden: attributeCell(button, 'hidden'),
    intent: null,
    label: textCell(button),
  }
  button.addEventListener('click', () => {
    if (element.intent !== null) {
      actions.onIntent(element.intent)
    }
  })
  return element
}

const hideTradeOffer = (element: TradeOfferElement): void => {
  element.intent = null
  writeText(element.label, '')
  writeAttribute(element.disabled)
  writeHidden(element.hidden, true)
}

const renderTradeOffer = (
  element: TradeOfferElement,
  model: TradeViewModel,
  offer: TradeViewModel['offers'][number],
): void => {
  writeText(element.label, offer.label)
  writeHidden(element.hidden, false)

  if (offer.disabled) {
    element.intent = null
    writeAttribute(element.disabled, '')
    return
  }

  element.intent = {
    _tag: 'TradeVillager',
    actor: model.actor,
    offerId: offer.id,
    villager: model.villager,
  }
  writeAttribute(element.disabled)
}

const updateTradeOffer = (element: TradeOfferElement, model: TradeViewModel, index: number): void => {
  const offer = model.offers[index]
  if (typeof offer === 'undefined') {
    hideTradeOffer(element)
    return
  }
  renderTradeOffer(element, model, offer)
}

export const createTradeView = (
  factory: DomElementFactory,
  parent: DomElement,
  actions: TradeViewActions,
): TradeView => {
  const root = createTradeRoot(factory, parent)
  const profession = createProfessionHeading(factory, root)
  const offerList = createOfferList(factory, root)
  const status = createTradeStatus(factory, root)
  const close = createCloseButton(factory, actions)
  root.appendChild(close)

  const offers: Array<TradeOfferElement> = []

  return {
    render: (model: TradeViewModel): void => {
      writeText(profession, model.professionLabel)
      writeText(status, model.status)

      while (offers.length < model.offers.length) {
        const element = createTradeOfferElement(factory, actions)
        offerList.appendChild(element.button)
        offers.push(element)
      }

      for (const [index, element] of offers.entries()) {
        updateTradeOffer(element, model, index)
      }
    },
    root,
  }
}
