import { Result } from 'effect'
import type { ItemType } from '@nerima-games/mc-kernel'
import type { ItemDisplayNameOptions } from '../src/domain/item-display-name'
import type { UiLanguage } from '../src/domain/ui-language'

export const browserItemDisplayNameOptions = (
  language: UiLanguage = 'en',
): ItemDisplayNameOptions => ({
  language,
  resolver: (itemType: ItemType) => Result.succeed(itemType.replaceAll('_', ' ')),
})
