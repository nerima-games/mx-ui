# 公開 API

## 1. mx-ui には stage 登録とは別に mount 面が要る

Registering a stage does not display the UI; the mc-compose host must:

1. Provide the DOM root where the UI will render.
2. Choose which screen to display based on the session state.

この mount 面は `makeUiMount` として実装済みである。`mc-compose` の browser session が要求する
`name` / `start` / `stop` と構造互換であり、循環依存を作らずにそのまま runtime module として渡せる。

## 2. `StageRegistration` 契約

```typescript
interface StageRegistration {
  readonly id: StageId
  readonly after?: ReadonlyArray<StageId>   // 順序制約の宣言のみ。全順序は compose が解決
  readonly run: (dt: DeltaTimeSecs) => Effect.Effect<void, never, FrameServices>
}

interface GameModule<ROut, E, RIn, RRegister = never> {
  readonly layers: Layer.Layer<ROut, E, RIn>          // 提供するサービス群
  readonly frameStages: Effect.Effect<ReadonlyArray<StageRegistration>, never, RRegister>
}
```

mx-ui は `GameModule` と `StageRegistration` を mc-kernel から直接 import する。上の型は契約の関連部分を示している。

### 2-1. 全順序は mc-compose だけが解決する

**モジュールは `after` 制約を宣言するだけで、それ以外は何も言わない。**

`after` は「その stage が存在すること」への依存ではない。ある stage を名指ししてもエッジが生まれるだけで、
import も依存も発生しない。だから `after: [StageId('sim:physics')]` は「mc-sim の物理の後で走らせてほしい」を
mc-sim の stage モジュールを import せずに表現できる。

The following tests pin this contract from both sides:

- `test/stage-registration.test.ts`: `REGRESSION: a registration carries constraints and nothing else — no priority, no index`
  This test checks that each registration has exactly the `['after', 'id', 'run']` keys.
  There is **no place to declare a priority or index**.
- `test/public-api.test.ts`: `REGRESSION: exports nothing that would let a consumer resolve a total stage order`
  This test checks that the package exports none of `sortStages`, `stageOrder`, `totalOrder`, `framePipeline`, or `runFrame`.
  The package does not expose a tool for resolving the total order.

## 3. 標準 stage 順序と、mx-ui が埋める枠

```
input
  → simulation (physics → interactions → entities → fluids → redstone → time/weather)
  → camera-mirror
  → chunk-sync
  → render
  → post-fx
  → hud-sync
```

| 枠 | 埋める人 |
| --- | --- |
| `input` | `mc-render`（実行時入力サービス） |
| `simulation` の physics / entities / time | `mc-sim` |
| `simulation` の interactions / fluids | `mx-gameplay` |
| `simulation` の redstone | `mx-redstone` |
| `camera-mirror` / `chunk-sync` / `render` / `post-fx` | `mc-render` |
| **`hud-sync`** | **`mx-ui`** |

**そして、この骨格自体は誰も宣言しない。** これは mc-compose が所有する全順序の形であって、
どの体験モジュールも全順序を宣言しない。

### 3-1. Why mx-ui does not declare an ordering constraint after mc-render

1. **mc-render is not a parent in the runtime dependency graph** ([architecture.md](./architecture.md) §6). mx-ui imports only focus-navigation types from mc-render.
2. **mc-compose owns global ordering.** A module does not see the other modules, so it cannot determine its absolute position correctly.

mx-ui 自身の正しさが要求しているのは「HUD が**このフレームの**シミュレーションを反映すること」だけで、
それは `after: [StageId('sim:physics')]` が既に言っている。
`stages/stage-ids.ts` のコメントがこの区別をそのまま書いており、
`test/stage-registration.test.ts` verifies that this module registers no `after` edge with a `render:` prefix. Although [plan.md](../plan.md) §4.2 places `hud-sync` after `post-fx`, mc-compose owns that global ordering.

## 4. `GameModule` を実装した（`uiModule`）

mx-ui はフレーム契約を通じてサービスを公開しない。UI の mount 面は別にあり、`layers` は空である。

stage の状態には per-mount の `Ref` が必要なので、`makeUiStages` は状態を作成して stage 配列を返す Effect である。

```typescript
export const makeUiStages: Effect.Effect<ReadonlyArray<StageRegistration>>

export const uiModule: GameModule<never, never, never> = {
  layers: Layer.empty,
  frameStages: makeUiStages,
}
```

`UiFrameState.selectedHotbarSlot` は `SelectedHotbarSlot` 型である。`SelectedHotbarSlotSchema` は値を 0〜8 の整数に制限し、`makeUiFrameState` は初期値をこの schema で decode する。type と schema は `src/stages/registration.ts` から root barrel に export される。

現在の `uiModule` は `RIn` と `RRegister` がともに `never` で、frame stage に外部 service は不要である。
将来 stage が service を要求する場合、その要求は `frameStages` の `RRegister` に現れる。mx-ui はその service を `layers` で提供しない。

### 4-1. mount 面

`makeUiMount` receives a host-owned DOM root and initially renders the HUD, inventory, and main menu into an mx-ui-owned child container.

```typescript
export type UiMountedViews = {
  readonly root: HTMLElement
  readonly hud: HudView
  readonly inventory: InventoryView
  readonly mainMenu: MainMenuView
  readonly overlays: SessionOverlays
  readonly achievementToast: AchievementToastView
}

export type UiMountOptions = {
  readonly root: HTMLElement
  readonly motion?: MotionPreference
  readonly initialLanguage?: UiLanguage
  readonly menuCallbacks?: MainMenuCallbacks
  readonly initialSettings?: UiSettings
  readonly settingsCallbacks?: UiSettingsCallbacks
  readonly initialDebugSnapshot?: DebugHudSnapshot
  readonly onInventoryActivate?: (target: InventoryInteractionTarget) => void
  readonly onInventoryAction?: (action: InventoryAction) => void
}

export type UiMount = {
  readonly name: string
  readonly start: Effect.Effect<
    typeof uiModule,
    UiMountError | Schema.SchemaError,
    DomainEventBus | Scope.Scope
  >
  readonly stop: Effect.Effect<void, UiMountError | Schema.SchemaError>
  readonly current: () => UiMountedViews | undefined
  readonly updateDebug: (snapshot: DebugHudSnapshot) => void
  readonly updateSettings: (settings: UiSettings) => void
  readonly updateLanguage: (language: unknown) => Result.Result<UiLanguage, UiLanguageFailure>
  readonly openSettings: () => void
  readonly closeSettings: () => void
  readonly openInventory: (model?: InventoryViewModel) => void
  readonly closeInventory: () => void
  readonly updateInventory: (model: InventoryViewModel) => void
  readonly moveInventoryFocus: (direction: InventoryNavigationDirection) => boolean
  readonly moveFocus: (direction: InventoryNavigationDirection) => boolean
  readonly activateInventoryFocus: (kind?: 'click' | 'shift-click') => boolean
  readonly dragInventorySlot: (source: InventoryDragTarget, target: InventoryDragTarget) => boolean
  readonly updateInventoryActionState: (state: InventoryActionState) => void
}

export const makeUiMount: (options: UiMountOptions) => UiMount

export class UiMountError {
  readonly _tag: 'UiMountError'
  readonly name: 'UiMountError'
  readonly message: string
  readonly cause: unknown
  constructor(message: string, options?: ErrorOptions)
}
```

`makeUiMount` accepts options and returns a mount handle.
The host passes a real `HTMLElement` as the root; mx-ui uses the structural `DomElementFactory` and `DomElement` types for children it creates inside that root.

`current()` returns the mounted view handles, or `undefined` before mount.
The returned handle contains `root`, `hud`, `inventory`, `mainMenu`, `overlays`, and `achievementToast`.
Failures from `start` and `stop` are returned through Effect's error channel as `UiMountError | Schema.SchemaError`; `start` requires `DomainEventBus | Scope.Scope`.
`UiMountError` is a tagged value with `_tag`, `name`, `message`, and `cause`; it does not extend native `Error`.

The mount has these design constraints:

1. **`HTMLElement` を要求する。** global `document` は参照せず、渡された root の `ownerDocument` だけを使う。
2. **`start` は再入可能。** 既存 mount を解体してから作り直し、途中失敗時は作成済み DOM と listener をロールバックする。
3. **`stop` は冪等。** mx-ui が作った子コンテナだけを外し、ホストに元からある子要素は保持する。
4. **画面更新口は view handle と typed snapshot。** HUD / inventory / main menu は `current()` の view handle、
   F1 デバッグ HUD と設定値は `updateDebug` / `updateSettings` をホストが駆動する。
5. **The mount adapter routes key events.** F1 toggles the debug HUD, and F10 toggles settings.
   Escape closes the visible settings screen and delegates to the inventory only when settings are closed.
   Listeners attach to the root's `ownerDocument` and are removed on remount, stop, and initialization failure.
6. **設定変更は typed callback でホストへ返す。** mouse sensitivity、render distance、field of view、master volume の
   所有権はホスト側にあり、mx-ui は入力と通知だけを担う。
7. **Gamepad and arrow-key input crosses the host boundary.** mx-ui does not own the Gamepad API or key-code conversion.
   mc-render converts arrow-key codes to `FocusNavigationDirection`, which the host passes to `moveFocus`.
   `focusTargetForElement` resolves a DOM element to mc-render's `FocusTarget` (`{ group, index }`). Pass it to mc-render as the `FocusTargetForElement` resolver, then route arrow-key directions to `UiMount.moveFocus`.
   Within the inventory, `moveFocus` handles region columns, skips unknown regions, and moves to the crafting output.
   Use `moveInventoryFocus` and `activateInventoryFocus` for semantic inventory commands such as gamepad actions.
   The browser owns Tab. The DOM tab order contains a close button when the view receives `onClose`, followed by the current roving grid tab stop; arrow keys move within the grid.
   mx-ui does not capture Tab or override native Enter and Space behavior for buttons and inputs.

## 5. `index.ts` の主な可視 export

`index.ts` exports symbols from `application/`, `domain/`, and `stages/`.
This section classifies the contract surface and major visible exports; see `src/index.ts` and the built declarations for the complete implementation list.

- **Contract** APIs are consumed by mc-compose; changing them is a breaking change ([versioning.md](./versioning.md) §5).
- **Internal (visible)** APIs are exported only for this repository's previews and tests; changing them is **not** a breaking change.

### `stages/registration.ts`

| export | 種別 | 分類 |
| --- | --- | --- |
| `uiStages` | `(state) => ReadonlyArray<StageRegistration>` | **契約** |
| `makeUiStages` | `Effect<ReadonlyArray<StageRegistration>>` | **契約** |
| `makeUiFrameState` | `Effect<UiFrameState>` | **契約**（呼び出しごとに独立した state を作る） |
| `SelectedHotbarSlot` | type | **契約** |
| `SelectedHotbarSlotSchema` | schema（0〜8 を検証） | **契約** |
| `UiFrameState` | type | 内部(可視) |
| `DEFAULT_CAPTION_SETTINGS` | `CaptionSettings` | 内部(可視) |

### `stages/stage-ids.ts`

| export | 種別 | 分類 |
| --- | --- | --- |
| `UI_STAGE_IDS` | `{ hudSync, overlaySync }` | **契約** |
| `UPSTREAM_STAGE_IDS` | `{ simPhysics }` | **契約** |
| `EXPERIENCE_MODULE_STAGE_PREFIXES` | `readonly string[]` | 内部(可視)（回帰テスト用） |
| `OWN_STAGE_PREFIX` | `'ui:'` | 内部(可視)（回帰テスト用） |

### Kernel-owned stage vocabulary

`src/stages/registration.ts` は `StageId`、`DeltaTimeSecs`、`GameModule`、`StageRegistration` を
mc-kernel から import する。mx-ui の root barrel はこれらを再 export しないため、利用側も型の owner である
`@nerima-games/mc-kernel` から import する。`test/public-api.test.ts` が再 export されないことを検査する。

### `domain/hud-view-model.ts` (all exports are internal (visible))

| export | 種別 |
| --- | --- |
| `HEALTH_POINTS_PER_HEART` / `DEFAULT_MAX_HEALTH_POINTS` / `DEFAULT_MAX_HUNGER_POINTS` / `HOTBAR_SLOT_COUNT` | 定数 |
| `IconState` / `HotbarSlotSnapshot` / `VitalsSnapshot` / `SlotView` / `SlotViewOptions` / `HudViewModel` / `HudViewModelOptions` | type |
| `iconRow` / `hudViewModel` / `slotView` / `hotbarSlotIndex` | 純粋関数 |
| `spawnSnapshot` | プレビュー・テスト用のリテラル |

`hotbarSlotIndex` re-exports mc-sim's `clampHotbarIndex`, so the HUD selection and keyboard focus use the same rule. `slotView` converts inventory and hotbar slots to the same view type.

### `domain/inventory-view-model.ts` (all exports are internal (visible))

| export | 種別 |
| --- | --- |
| `INVENTORY_SLOT_COUNT` (imported from and re-exported by mc-sim) / `INVENTORY_MAIN_COLUMNS` / `INVENTORY_MAIN_ROWS` / `INVENTORY_MAIN_SLOT_COUNT` | constants |
| `CraftingSnapshot` / `CraftingResultSnapshot` / `InventorySnapshot` | type |
| `RegionId` / `SlotRegion` / `CraftingOutcomeView` / `MergeTargets` / `InventoryViewModel` | type |
| `inventoryViewModel` / `slotSnapshotOf` / `regionOf` | 純粋関数 |
| `emptyInventorySnapshot` | プレビュー・テスト用のリテラル |

`Inventory`, `Slot`, and `ItemStack` are imported directly from mc-sim and are not re-exported from this barrel.
mx-ui publishes the types and functions that project state for display.

### `domain/palette.ts` (all exports are internal (visible))

| export | 種別 |
| --- | --- |
| `SCRIM` / `SCRIM_ALPHA` / `SURFACE` / `SURFACE_RAISED` / `METER_TRACK` / `SLOT_FILL` / `SLOT_FILL_ALPHA` | 面のトークン |
| `INK` / `INK_MUTED` / `INK_FAINT` | インク |
| `HEART` / `SHANK` / `ICON_EMPTY` / `XP_FILL` / `XP_FILL_HIGHLIGHT` / `XP_LEVEL` / `SLOT_BORDER` / `SLOT_SELECTED` | HUD |
| `STATUS_OK` / `STATUS_BUSY` / `STATUS_ALERT` / `DURABILITY_HIGH` / `DURABILITY_LOW` / `FOCUS_RING` / `FOCUS_RING_SHADOW` | 状態とフォーカス |
| `Rgb` / `TokenRole` / `GuardedToken` / `Distinguisher` / `CriticalPair` / `TokenReading` / `PairReading` / `PaletteSurvey` | type |
| `GUARDED_TOKENS` / `CRITICAL_PAIRS` / `KNOWN_NEAR_COLLISIONS` / `COLLAPSE_SEPARATION` / `TEXT_CONTRAST_MIN` / `UI_CONTRAST_MIN` | 保証の宣言 |
| `hex` / `cssColor` / `relativeLuminance` / `contrastRatio` / `separation` / `simulateColorVision` / `compositeOver` / `worstCaseContrastOnScrim` / `surveyPalette` | 純粋関数 |
| `SCRIM_OVER_DARKEST_WORLD` / `SCRIM_OVER_BRIGHTEST_WORLD` | 合成の両端 |

**このモジュールはスタイルシートではない。** 値と、値を検査する算術だけである。
`document` を触らないので、palette math は Node environment でテストできる。`simulateColorVision` は補正の効果を予測し、`domain/accessibility.ts` の `colorVisionMatrix` は DOM に適用する補正行列を作る。

### 5-2. UI4 host-facing presentation APIs

These APIs define how mc-compose persists settings and projects them into the UI.
mc-sim continues to own persisted settings and game state.

| API | Input and result | Host responsibility |
| --- | --- | --- |
| `UiLanguage` / `UI_LANGUAGES` / `UiLanguageSchema` | `'en' \| 'ja'` | Store the selected language. Item names come from the host's resolver; the UI dictionary does not contain them. |
| `decodeUiLanguage(input)` | `unknown` → `Result<UiLanguage, UiLanguageFailure>` | Decode persisted input and return an unsupported-language failure instead of silently choosing the default. |
| `UiMountOptions.initialLanguage` / `UiMount.updateLanguage(input)` | Initial value and runtime update; updates validate `unknown` and return `Result` | Pass locale changes while the mount is active. |
| `ItemDisplayNameResolver` / `ItemDisplayNameOptions` | `(ItemType, UiLanguage) => Result<string, ItemDisplayNameResolverFailure>`; options carry the active language and resolver | Pass the callback to item-bearing view-model factories. `ItemType` is imported from `@nerima-games/mc-kernel`. |
| `resolveItemDisplayName(itemId, language, resolver?)` | `unknown` snapshot value → `Result<ItemDisplayName, ItemDisplayNameFailure>` | Validate the item type before calling the resolver. A leading `minecraft:` namespace is removed. Invalid IDs, missing resolvers, resolver failures, empty names, and names containing `minecraft:` return typed failures. |
| `hudViewModel(vitals, hotbarSlots, selection)` | `selection` is a number or `HudViewModelOptions` with `selectedHotbarSlot` and optional `itemDisplayNameOptions` | Pass the active selection and host resolver in the options object to localize hotbar item text and labels. |
| `inventoryViewModel` / `chestStorageViewModel` / `furnaceViewModel` / `anvilViewModel` / `enchantingTableViewModel` | Optional `ItemDisplayNameOptions` | Pass the same resolver and language used for the screen. Views show the resolved name in slot text, hover titles, and accessible labels; a failed lookup displays localized “Unknown item” / “不明なアイテム”. |
| `slotView(slot, index, selection)` | `selection` is a number or `SlotViewOptions` with `selectedIndex` and optional `itemDisplayNameOptions` | Project one slot using the selected index and host resolver. |
| `applyUiLanguage(root, input)` | Localized DOM subtree and `unknown` | Update text and aria attributes within a subtree when using an independent view. |
| `GAME_FONT_FAMILY` / `GAME_FONT_STACK` / `GAME_FONT_STYLESHEET_EXPORT` | Bundled font name and package export path | Load `@nerima-games/mx-ui/assets/game-font.css` on screens that need it. |
| `UI_SCALE_MIN` / `UI_SCALE_MAX` / `applyUiScale(style, input)` | `0.75` to `1.5`; out-of-range and non-numeric values return a typed failure | Apply mc-sim's `uiScale` setting to the mx-ui root style and handle the returned `Result`; invalid values leave the existing style unchanged. |
| `ColorVisionMode` / `createColorVisionFilterController(root, target)` | `off` / `protanopia` / `deuteranopia` / `tritanopia`; controller provides `apply(mode: unknown)` / `dispose()` | Pass the UI root and render canvas. Check the `Result` from `apply`. The controller creates instance-specific SVG definitions inside the root and applies the filter only to the canvas. `off` and `dispose()` restore the original attribute and inline filter. |
| `MotionSetting` / `MotionPreference` / `createMotionPreferenceController(query, initialSetting, onChange)` | Settings `system` / `full` / `reduced` → effective preference `full` / `reduced` | Pass `matchMedia('(prefers-reduced-motion: reduce)')`. The callback runs immediately and on OS changes while `system` is selected; apply its value with each active view's `setMotion`. Check the returned `Result` and call the controller's `dispose()` when the screen closes. |
| `focusTargetForElement(target)` / `UiMount.moveFocus(direction)` | mx-ui resolves a DOM target to mc-render's `FocusTarget`; the direction uses the `InventoryNavigationDirection` alias of `FocusNavigationDirection` | Pass the resolver to mc-render and route its arrow-key intent back to the mount. |
| `bossHealthBarViewModel(snapshot, language?)` / `strongholdLocatorViewModel(snapshot, language?)` / `portalEyeProgressViewModel(inserted, language?)` | End HUD view models in the selected language; defaults to `'en'` | Pass the `UiLanguage` used for display. An empty boss name returns a localized default. |
| `dragonDefeatRewardNotification(snapshot, language?)` | `UiLanguage`, defaulting to `'en'` | Returns the Ender Dragon reward title, XP text, and aria label in the selected language. |
| `SettingsViewActions.onClose?` / station `*ViewActions.onClose?` | `() => void` | Supplying the callback adds a native close button and connects it to the host's screen transition. |

`UI_MESSAGES` and `ACHIEVEMENT_TITLES` store English and Japanese text for each entry.
`UI_TRANSLATION_KEY_COUNT` reports the combined key count, and tests check that both languages cover every entry.
`UiMountOptions` accepts `initialLanguage`; decode persisted values with `decodeUiLanguage` before passing them. After mount, `updateLanguage` switches localized dictionary text and aria attributes. After a successful language update, rebuild every language-dependent view model and render or update those views. Pass the new language in `ItemDisplayNameOptions` when rebuilding item-bearing models. `applyUiLanguage` does not rerun the host's item-name resolver.

The item-name resolver receives a validated kernel `ItemType` without a `minecraft:` prefix and the requested `UiLanguage`. The view model retains the resolver's typed result. If the snapshot ID is invalid, the resolver is absent, or name resolution fails, the visible slot uses the localized unknown-item label and never prints the ID. Hosts provide this callback because the name catalog belongs to the host's kernel data.

```typescript
const itemNames: ItemDisplayNameOptions = { language, resolver: resolveHostItemName }
const model = inventoryViewModel(snapshot, itemNames)
view.render(model)

const languageChange = mount.updateLanguage(nextLanguage)
if (Result.isSuccess(languageChange)) {
  const nextNames: ItemDisplayNameOptions = { language: languageChange.success, resolver: resolveHostItemName }
  mount.updateInventory(inventoryViewModel(snapshot, nextNames))
}
```

`GAME_FONT_STYLESHEET_EXPORT` is the CSS package export path; importing the root API does not load the CSS or font file.
The stylesheet uses `PixelMplus12-Regular.ttf`, distributed with its license in `assets/MPLUS-FONT-LICENSE.txt`.
Product names are outside the UI dictionary.

`SettingsViewActions.onSliderChange` returns `uiScale` and its number to the host.
`onChoiceChange` returns the selected `reducedMotion` or `colorVisionCorrection` value, which the host persists through mc-sim's Settings schema.
Language is held by the host through `initialLanguage` and `updateLanguage`, not in mc-sim Settings.

Keyboard focus uses mc-render-owned `FocusTarget` and `FocusNavigationDirection` types.
`focusTargetForElement` resolves a DOM element to mc-render's `FocusTarget`. Pass it to mc-render as the `FocusTargetForElement` resolver, then route arrow-key directions to `UiMount.moveFocus`.
The user agent owns Tab; mx-ui does not capture Tab, Enter, Space, or arrow keys in its keydown listener.
mc-render converts arrow-key codes, while mx-ui and the host UI boundary own DOM focus membership and `.focus()`.
Inventory, container, furnace, anvil, enchanting, and settings controls use native buttons and inputs; the host connects each view's `*ViewActions` callbacks.

Chest slots belong to one `chest-storage-slots` focus group arranged in nine columns, with the slot count matching the open container.
Arrow-key navigation crosses between the chest, player main inventory, and hotbar groups.
The browser handles Tab movement between a close button (when the view receives `onClose`) and the current roving tab stop.
While the anvil name input is active, the host leaves arrow keys to the browser for caret movement.
The host's topmost overlay handler dispatches Escape once to close the active screen; it also owns focus restoration.

`applyUiScale` uses CSS `zoom`.
MDN marks this property as Baseline 2024 and notes that older browsers may not support it: [MDN `zoom`](https://developer.mozilla.org/en-US/docs/Web/CSS/zoom).

### `application/**` (DOM layer; includes both **provisional contract** and **internal (visible)** APIs)

`application/` turns `domain/` projections into DOM elements. It imports `domain/`, with no reverse dependency; `test/dom-surface.test.ts` pins this boundary.

| モジュール | export | 種別 | 分類 |
| --- | --- | --- | --- |
| `application/dom-surface.ts` | `DomNode` / `DomStyle` / `DomElement` / `DomElementFactory` / `DomAttributeTarget` | type | **Provisional contract** (structural DOM boundary used to create child elements inside the host-provided root) |
| `application/hud-view.ts` | `createHudView` / `HudView`（`render` / `setMotion` / `setKeyboardFocus`）/ `EXPERIENCE_TRANSITION_MS` | 関数 + type + 定数 | **契約(暫定)** |
| `application/caption-view.ts` | `createCaptionView` / `CaptionView` | 関数 + type | **契約(暫定)** |
| `application/inventory-view.ts` | `createInventoryView` / `InventoryView` | 関数 + type | **契約(暫定)** |
| `application/save-indicator.ts` | `createSaveIndicator` / `SaveIndicator` / `SAVE_MESSAGES` / `SAVE_STATUS_GLYPH` / `SAVE_STATUS_LABEL` | 関数 + type + 定数 | **契約(暫定)** |
| `application/accessibility-dom.ts` | `COLOR_VISION_ATTRIBUTE` / `ColorVisionCell` / `colorVisionCell` / `applyColorVision` / `createMotionPreferenceController` | constants + type + functions | **Provisional contract** |
| `application/color-vision-filters.ts` | `ColorVisionFilterFailure` / `ColorVisionFilterController` / `createColorVisionFilterController` | type + functions | **Provisional contract** (creates SVG filters inside the root and applies them only to the specified canvas) |
| `application/ui-scale.ts` | `UI_SCALE_PROPERTY` / `applyUiScale` | constants + functions | **Provisional contract** |
| `application/game-font.ts` | `GAME_FONT_FAMILY` / `GAME_FONT_STACK` / `GAME_FONT_STYLESHEET_EXPORT` | constants | **Provisional contract** |
| `application/palette-css.ts` | `PALETTE_PROPERTY_PREFIX` / `PALETTE_PROPERTY` / `PALETTE_SOURCE` / `PALETTE_VALUE` / `PALETTE_VAR` / `PALETTE_TOKEN_NAMES` / `PaletteTokenName` / `declarePalette` | 定数 + type + 関数 | 内部(可視) |
| `application/dom-write.ts` | `TextCell` / `StyleCell` / `PercentCell` / `AttributeCell` と各 `*Cell` / `write*` / `clearStyle` | type + 関数 | 内部(可視) |
| `application/slot-element.ts` | `SlotElement` / `SlotButtonView` / `createSlotElement` / `updateSlotElement` / `setSlotButtonView` / `setSlotHidden` / `hideSlotElementAtMount` / `setSlotTabStop` / `setSlotKeyboardFocus` / `DURABILITY_LOW_PERCENT` / `SLOT_TARGET_MIN_SIZE` / `FOCUS_RING_WIDTH` / `FOCUS_RING_SHADOW_WIDTH` | type + functions + constants | Internal (visible) |
| `application/icon-element.ts` | `IconKind` / `IconElement` / `createIconElement` / `updateIconElement` / `retireIconElement` | type + 関数 | 内部(可視) |

### Achievement toast

This API consists of the payload schema and event projection in `src/domain/achievement-toast.ts`, the DOM view in `src/application/achievement-toast-view.ts`, and the event-bus subscription in `src/application/achievement-toast-subscriber.ts`. Each module's exports are included in the root barrel at `src/index.ts`. APIs not yet consumed by mc-compose are **provisional contracts**; the subscriber's internal projection is **internal (visible)**.

| モジュール | export | 種別 | 分類 | 振る舞い |
| --- | --- | --- | --- | --- |
| `domain/achievement-toast.ts` | `AchievementToast` / `AchievementToastSchema` / `AchievementToastIcon` / `AchievementToastIconSchema` / `AchievementToastTitle` / `AchievementToastTitleSchema` | type + schema | **契約(暫定)** | toast payload と表示値を検証する |
| `domain/achievement-toast.ts` | `achievementToastFromEvent` | function | 内部(可視) | `Effect.Effect<AchievementToast \| null, Schema.SchemaError>` を返す |
| `application/achievement-toast-view.ts` | `AchievementToastView` / `createAchievementToastView` | type + function | **契約(暫定)** | toast payload を DOM に表示する |
| `application/achievement-toast-subscriber.ts` | `AchievementToastSubscription` / `startAchievementToastSubscriber` | type + function | **契約(暫定)** | sim の event bus を購読する。`close` で停止し、`join: Effect.Effect<void, Schema.SchemaError>` で subscriber failure を観測する |

mc-sim 0.7.0 の `DomainEvent` は mc-kernel 0.12.0 の広い achievement brand を使う。mx-ui は
受信した ID を mc-kernel 0.14.0 の `AchievementIdSchema` で decode してから表示表を引く。
失敗は `Schema.SchemaError` として subscriber の `join` から観測でき、toast に既定値を入れない。
表示名と item icon は mx-ui が所有し、表示表は有限 catalog の全 `AchievementId` literal を key にした `Record<AchievementId, AdvancementDisplay>` にする。
`minecraft:story/form_obsidian` は “Ice Bucket Challenge” の ID として含み、存在しない `minecraft:story/obtain_obsidian` は含まない。

**Provisional contract** identifies an API that is not yet consumed by a host such as mc-compose. Until it has a consumer,
compatibility changes cannot break an existing consumer. See the table above for each API's current classification; release versioning follows [versioning.md](./versioning.md) §5.

### なぜ `HTMLElement` ではなく構造型なのか

`tsconfig.base.json` includes `DOM` for UI implementation and `ESNext.Disposable` for the `Disposable` and `AsyncDisposable` types referenced by Effect 4 declarations. Consumers who specify `lib` explicitly must include `ESNext.Disposable` too.
**`HTMLElement` は書ける**。それでも `application/dom-surface.ts` がある理由は 2 つで、
mc-render の理由（DOM lib が無い）とは**別物**である。

1. **`vitest.config.ts` の `environment: 'node'` を守るため。**
   `HTMLElement` に対して書かれたレンダラは、jsdom を入れるか
   `as unknown as HTMLElement` を書いた偽物を使うかしないとテストできない。
   後者のほうが悪い——キャストこそが型安全を失う場所であり、しかもそれがテスト側にあるので
   偽物が実物からずれても誰も気づけない。
2. **一般要素にイベント登録口を配らないため。** `DomElement` に `addEventListener` は無い。
   native button/input の `DomInteractiveElement` / `DomInputElement` には click/input 用の登録口があり、
   session key listener は mount adapter が root の `ownerDocument` に登録する。
   その境界を分けることで、一般 renderer が独自の keyboard handler を持たない。
   `test/public-api.test.ts` は renderer に key handler を渡す export が無いことも検査する。

構造型が実 DOM の**真の部分集合**であることは `test/dom-surface.test.ts` が
実 `lib.dom.d.ts` に対して fixture をコンパイルして診断 0 件を assert する（mc-render と同じ手口）。


### `domain/caption.ts` (all exports are internal (visible))

| export | 種別 |
| --- | --- |
| `MAX_VISIBLE_CAPTIONS`（4）/ `CAPTION_LIFETIME_SECS`（3） | 定数 |
| `CaptionEvent` / `CaptionSettings` / `CaptionQueue` / `CaptionLineView` | type |
| `emptyCaptionQueue` | 定数 |
| `receiveCaption` / `expireCaptions` / `captionLines` | 純粋関数 |

### `domain/save-status.ts` (all exports are internal (visible))

| export | 種別 |
| --- | --- |
| `SAVED_VISIBLE_SECS`（3）/ `IDLE_SAVE_STATUS` | 定数 |
| `SaveMessage` / `SaveState` / `SaveStatus` | type |
| `saveStatus` / `saveStatusMessage` | 純粋関数 |

自動保存インジケータの**状態と表示時間**である。要素は `application/save-indicator.ts`。
`domain/caption.ts` と同じくクロックを取らず、時刻は引数で受ける。
**stage は増やしていない**——字幕と違って刈り取るキューが無く、
失効は読み取り時に経過時間を引いて判定するからである。

### `domain/accessibility.ts` (all exports are internal (visible))

| export | 種別 |
| --- | --- |
| `ColorVisionMode` / `ColorVisionCorrectionMode` / `ColorVisionMatrix` / `RgbChannels` / `UiScale` / `MotionSetting` / `MotionPreference` / `InputAction` / `KeyBindings` / `RebindResult` | type |
| `ColorVisionModeSchema` / `UiScaleSchema` / `MotionSettingSchema` | schema |
| `COLOR_VISION_MODES` / `COLOR_VISION_FILTER_TARGET` / `COLOR_VISION_FILTER_COLOR_SPACE` / `UI_SCALE_MIN` / `UI_SCALE_MAX` / `REBIND_CLEAR_KEYS` | constants |
| `decodeColorVisionMode` / `decodeUiScale` / `decodeMotionSetting` | decoder |
| `colorVisionAttribute` / `colorVisionMatrix` / `colorVisionCorrectionMatrixValues` / `colorVisionMatrixValues` / `applyColorVisionMatrix` / `resolveMotionPreference` / `animationDurationMs` / `shouldAnimate` / `rebind` / `unboundActions` | pure functions |

`domain/accessibility.ts` provides color-correction matrix values, UI-scale decoding, and pure projections of reduced-motion preferences. `application/color-vision-filters.ts` creates SVG filter definitions and applies them to the canvas.

### `domain/modal-stack.ts` (all exports are internal (visible))

| export | 種別 |
| --- | --- |
| `ScreenId` / `ModalStack` / `EscapeOutcome` | type |
| `emptyModalStack` | 定数 |
| `topOf` / `openScreen` / `closeScreen` / `escapePressed` / `gameplayInputSuppressed` / `pointerLockReleased` | 純粋関数 |

## 6. 「可視だが公開ではない」が何を買うか

ビューモデル、字幕キュー、アクセシビリティ関数、モーダルスタックは**全部 export されている**。
export されているのに公開 API ではない、というのは矛盾に見えるが、そうではない。

- **export する理由**: 各画面プレビューとテストは package root barrel から同じ実装を使う。`test/public-api.test.ts` の
  `exposes the same implementations through the barrel as through the modules` がこの対応を検査する。
- **公開 API ではない理由**: mc-compose はこれらを使わない。使わないものを変えても mc-compose は壊れない。
  だから `iconRow` の戻り値を変えても **MINOR bump で済む**（[versioning.md](./versioning.md) §5）。

アクセシビリティ関数の root exports はプレビューとテストで使うが、契約 API としては分類しない。存在は `test/public-api.test.ts` の export checks で固定する。
