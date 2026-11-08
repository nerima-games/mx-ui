import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  GAME_FONT_FAMILY,
  GAME_FONT_STACK,
  GAME_FONT_STYLESHEET_EXPORT,
} from '../src/application/game-font'

describe('bundled game font', () => {
  it('ships a Japanese-capable font, its license, and the stylesheet path for UI roots', async () => {
    const font = await readFile(new URL('../assets/PixelMplus12-Regular.ttf', import.meta.url))
    const license = await readFile(new URL('../assets/MPLUS-FONT-LICENSE.txt', import.meta.url), 'utf8')
    const stylesheet = await readFile(new URL('../assets/game-font.css', import.meta.url), 'utf8')

    expect(font.byteLength).toBeGreaterThan(0)
    expect(license).toContain('M+ FONTS PROJECT')
    expect(license).toContain('Unlimited permission is granted')
    expect(stylesheet).toContain(`font-family: "${GAME_FONT_FAMILY}"`)
    expect(stylesheet).toContain('url("./PixelMplus12-Regular.ttf")')
    expect(stylesheet).toContain('[data-mx-ui]')
    expect(GAME_FONT_STACK).toBe('"PixelMplus12", ui-monospace, monospace')
    expect(GAME_FONT_STYLESHEET_EXPORT).toBe('@nerima-games/mx-ui/assets/game-font.css')
  })
})
