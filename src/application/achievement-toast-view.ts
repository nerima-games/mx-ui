import {
  attributeCell,
  textCell,
  writeAttribute,
  writeHidden,
  writeText,
} from './dom-write.js'
import type { DomElement, DomElementFactory } from './dom-surface.js'
import { declarePalette } from './palette-css.js'
import type { AchievementToast } from '../domain/achievement-toast.js'

export type AchievementToastView = Readonly<{
  render: (toast: AchievementToast | undefined) => void
  root: DomElement
}>

export const createAchievementToastView = (
  factory: DomElementFactory,
  parent: DomElement,
): AchievementToastView => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'achievement-toast')
  declarePalette(root)
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'polite')
  root.setAttribute('aria-atomic', 'true')
  root.setAttribute('hidden', '')
  parent.appendChild(root)

  const icon = factory.createElement('span')
  icon.setAttribute('data-mx-ui', 'achievement-toast-icon')
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = '✦'
  root.appendChild(icon)

  const title = factory.createElement('span')
  title.setAttribute('data-mx-ui', 'achievement-toast-title')
  root.appendChild(title)

  const hidden = attributeCell(root, 'hidden')
  hidden.previous = ''
  const iconName = attributeCell(icon, 'data-icon')
  const titleText = textCell(title)

  return {
    render: (toast: AchievementToast | undefined): void => {
      writeHidden(hidden, typeof toast === 'undefined')
      if (typeof toast !== 'undefined') {
        writeAttribute(iconName, toast.icon)
        writeText(titleText, toast.title)
      }
    },
    root,
  }
}
