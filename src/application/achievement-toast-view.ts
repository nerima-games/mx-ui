import type { DomElement, DomElementFactory } from './dom-surface.js'
import {
  attributeCell,
  textCell,
  writeAttribute,
  writeHidden,
  writeText,
} from './dom-write.js'
import type { AchievementToast } from '../domain/achievement-toast.js'
import { declarePalette } from './palette-css.js'

export type AchievementToastView = Readonly<{
  render: (toast?: AchievementToast) => void
  root: DomElement
}>

const createToastRoot = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'achievement-toast')
  declarePalette(root)
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'polite')
  root.setAttribute('aria-atomic', 'true')
  root.setAttribute('hidden', '')
  parent.appendChild(root)
  return root
}

const createToastIcon = (factory: DomElementFactory, root: DomElement) => {
  const icon = factory.createElement('span')
  icon.setAttribute('data-mx-ui', 'achievement-toast-icon')
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = '✦'
  root.appendChild(icon)
  return attributeCell(icon, 'data-icon')
}

const createToastTitle = (factory: DomElementFactory, root: DomElement) => {
  const title = factory.createElement('span')
  title.setAttribute('data-mx-ui', 'achievement-toast-title')
  root.appendChild(title)
  return textCell(title)
}

const createToastRenderer = (
  root: DomElement,
  iconName: ReturnType<typeof attributeCell>,
  titleText: ReturnType<typeof textCell>,
): AchievementToastView['render'] => {
  const hidden = attributeCell(root, 'hidden')
  hidden.previous = ''

  return (toast: AchievementToast | undefined): void => {
    writeHidden(hidden, typeof toast === 'undefined')
    if (typeof toast !== 'undefined') {
      writeAttribute(iconName, toast.icon)
      writeText(titleText, toast.title)
    }
  }
}

export const createAchievementToastView = (
  factory: DomElementFactory,
  parent: DomElement,
): AchievementToastView => {
  const root = createToastRoot(factory, parent)
  const iconName = createToastIcon(factory, root)
  const titleText = createToastTitle(factory, root)

  return {
    render: createToastRenderer(root, iconName, titleText),
    root,
  }
}
