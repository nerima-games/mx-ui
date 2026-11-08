import { Result } from 'effect'
import type { ItemDisplayNameOptions } from '../../src/domain/item-display-name.js'
import type { UiLanguage } from '../../src/domain/ui-language.js'

export const fakeItemDisplayNameOptions = (language: UiLanguage = 'en'): ItemDisplayNameOptions => ({
  language,
  resolver: (itemType, itemLanguage) => Result.succeed(`${itemLanguage}:${itemType}`),
})
