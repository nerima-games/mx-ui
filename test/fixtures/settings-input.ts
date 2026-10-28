import type { SettingsKeyInputPolicy } from '../../src/application/settings-view'
import { KeyCode } from '@nerima-games/mc-kernel/domain/settings'

export const TEST_BINDABLE_ACTIONS = [
  'moveForward',
  'moveBackward',
  'moveLeft',
  'moveRight',
  'jump',
  'sneak',
  'sprint',
  'openInventory',
  'openChat',
  'attack',
  'use',
  'pickBlock',
  'hotbarSlot1',
  'hotbarSlot2',
  'hotbarSlot3',
  'hotbarSlot4',
  'hotbarSlot5',
  'hotbarSlot6',
  'hotbarSlot7',
  'hotbarSlot8',
  'hotbarSlot9',
] as const

type TestAction = (typeof TEST_BINDABLE_ACTIONS)[number]

export const TEST_DEFAULT_BINDINGS: Readonly<Record<TestAction, KeyCode>> = {
  attack: KeyCode('MouseLeft'),
  hotbarSlot1: KeyCode('Digit1'),
  hotbarSlot2: KeyCode('Digit2'),
  hotbarSlot3: KeyCode('Digit3'),
  hotbarSlot4: KeyCode('Digit4'),
  hotbarSlot5: KeyCode('Digit5'),
  hotbarSlot6: KeyCode('Digit6'),
  hotbarSlot7: KeyCode('Digit7'),
  hotbarSlot8: KeyCode('Digit8'),
  hotbarSlot9: KeyCode('Digit9'),
  jump: KeyCode('Space'),
  moveBackward: KeyCode('KeyS'),
  moveForward: KeyCode('KeyW'),
  moveLeft: KeyCode('KeyA'),
  moveRight: KeyCode('KeyD'),
  openChat: KeyCode('KeyT'),
  openInventory: KeyCode('KeyE'),
  pickBlock: KeyCode('MouseMiddle'),
  sneak: KeyCode('ShiftLeft'),
  sprint: KeyCode('ControlLeft'),
  use: KeyCode('MouseRight'),
}

export const TEST_SETTINGS_INPUT_POLICY: SettingsKeyInputPolicy<TestAction> = {
  bindableActions: TEST_BINDABLE_ACTIONS,
  validateKeyCode: (_action, code) => {
    if (code === 'Escape') {
      return 'escape-is-not-bindable'
    }
    if (code === 'Tab') {
      return 'key-reserved-by-user-agent'
    }
    if (code.length === 0) {
      return 'invalid-key'
    }
    return undefined
  },
}
