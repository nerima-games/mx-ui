# 公開 API

## 1. mx-ui には stage 登録とは別に mount 面が要る

stage を登録するだけでは UI を表示できない。ホストの mc-compose が次のことを行う:

1. UI が描画する DOM ルートを渡す。
2. セッションの状態に応じて、どの画面を開くか決める。

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

これは `test/stage-registration.test.ts` で 2 方向から固定してある:

- `REGRESSION: a registration carries constraints and nothing else — no priority, no index`
  — 各登録のキーが `['after', 'id', 'run']` ちょうどであることを検査する。
  優先度も添字も**書く場所が無い**。
- `REGRESSION: exports nothing that would let a consumer resolve a total stage order`
  （`test/public-api.test.ts`）— `sortStages` / `stageOrder` / `totalOrder` / `framePipeline` / `runFrame`
  のいずれも export していないことを検査する。全順序を解ける道具を配らない。

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

### 3-1. `after: [render:post-fx]` を宣言しない理由

§4.2 は `hud-sync` を `post-fx` の**後**に置いている。そう書いてあるのだから、そう宣言したくなる。しない。

1. **mc-render は mx-ui の親ではない**（[architecture.md](./architecture.md) §6）。
2. より本質的に、**大域的な位置は mc-compose が言うべきことである**。
   モジュールは他のモジュールを見ていないので、自分の絶対位置を正しく決められない。

mx-ui 自身の正しさが要求しているのは「HUD が**このフレームの**シミュレーションを反映すること」だけで、
それは `after: [StageId('sim:physics')]` が既に言っている。
`stages/stage-ids.ts` のコメントがこの区別をそのまま書いており、
`test/stage-registration.test.ts` の
`REGRESSION: mx-ui does not order itself against mc-render either, though §4.2 puts hud-sync after post-fx`
が `render:` 接頭辞のエッジがゼロであることを固定している。

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

`makeUiMount` はホストが所有する DOM ルートを受け取り、mx-ui が所有する子コンテナに HUD、inventory、
main menu を初期描画する:

```typescript
export type UiMount = {
  readonly name: string
  readonly start: Effect.Effect<typeof uiModule, UiMountError>
  readonly stop: Effect.Effect<void, UiMountError>
  readonly current: () => UiMountedViews | undefined
  readonly updateDebug: (snapshot: DebugHudSnapshot) => void
  readonly updateSettings: (settings: UiSettings) => void
  readonly openSettings: () => void
  readonly closeSettings: () => void
  readonly openInventory: (model?: InventoryViewModel) => void
  readonly closeInventory: () => void
  readonly updateInventory: (model: InventoryViewModel) => void
  readonly moveInventoryFocus: (direction: InventoryNavigationDirection) => boolean
  readonly activateInventoryFocus: () => boolean
}

export class UiMountError {
  readonly _tag: 'UiMountError'
  readonly name: 'UiMountError'
  readonly message: string
  readonly cause: unknown
  constructor(message: string, options?: ErrorOptions)
}
```

The host passes a real `HTMLElement` as the mount root. mx-ui uses the structural `DomElementFactory` and `DomElement` types only for the child elements it creates inside that root.

Failures from `start` and `stop` are returned in Effect's error channel as `UiMountError`.
This tagged value has `_tag`, `name`, `message`, and `cause`; it does not extend native `Error`.

設計上の制約は次の通り:

1. **`HTMLElement` を要求する。** global `document` は参照せず、渡された root の `ownerDocument` だけを使う。
2. **`start` は再入可能。** 既存 mount を解体してから作り直し、途中失敗時は作成済み DOM と listener をロールバックする。
3. **`stop` は冪等。** mx-ui が作った子コンテナだけを外し、ホストに元からある子要素は保持する。
4. **画面更新口は view handle と typed snapshot。** HUD / inventory / main menu は `current()` の view handle、
   F1 デバッグ HUD と設定値は `updateDebug` / `updateSettings` をホストが駆動する。
5. **セッションキーは mount adapter が所有する。** F1 はデバッグ HUD、F10 は設定画面を切り替え、Escape は設定画面を閉じる。
   listener は常に root の `ownerDocument` に登録し、再 mount / stop / 初期化失敗で解除する。
6. **設定変更は typed callback でホストへ返す。** mouse sensitivity、render distance、field of view、master volume の
   所有権はホスト側にあり、mx-ui は入力と通知だけを担う。
7. **ゲームパッドはホストがポーリングする。** mx-ui は Gamepad API やボタン割り当てを所有せず、ホストが
   `moveInventoryFocus` / `activateInventoryFocus` に意味上のコマンドを渡す。矢印キーも同じ移動関数を使い、
   region の列数、未知 region のスキップ、crafting output への遷移を一貫させる。

## 5. `index.ts` の主な可視 export

`index.ts` は `application/`、`domain/`、`stages/` から export する。この節は契約面と
主要な可視 export を分類するもので、完全な実装一覧は `src/index.ts` と build 後の declaration を正とする:

- **契約** — mc-compose が消費する。変更は破壊的変更（[versioning.md](./versioning.md) §5）。
- **内部(可視)** — このリポジトリ自身のプレビューとテストのために export しているだけ。
  変更は破壊的変更では**ない**。

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

### 5-1. ではなぜインベントリのミラーは**載せる**のか

`domain/inventory-view-model.ts` も mc-sim の `Inventory` / `Slot` / `ItemStack` をローカル再掲している。
それは `export *` されている。**逆の判断であり、意図的である。**

判断を分けているのは**ミラーが何を指しているか**である。

| ミラー | 指しているもの | バレル | 削除・置換のコスト |
| --- | --- | --- | --- |
| `mx-gameplay/domain/chunk-store-port.ts` | mc-worldgen の**サービス**（`Context.Tag`） | 載せない | 他リポジトリのサービスの再公開。タグキー衝突という実害もある |
| `domain/inventory-view-model.ts` のミラー | 本リポジトリの純粋関数の**引数型** | **載せる** | mc-compose は `inventoryViewModel` を呼ばない → §5 の表で MINOR |
| `VitalsSnapshot` | 同上 | **載っている** | 同上 |

### `domain/hud-view-model.ts` — すべて内部(可視)

| export | 種別 |
| --- | --- |
| `HEALTH_POINTS_PER_HEART` / `DEFAULT_MAX_HEALTH_POINTS` / `DEFAULT_MAX_HUNGER_POINTS` / `HOTBAR_SLOT_COUNT` | 定数 |
| `IconState` / `HotbarSlotSnapshot` / `VitalsSnapshot` / `SlotView` / `HudViewModel` | type |
| `iconRow` / `hudViewModel` / `slotView` / `hotbarSlotIndex` | 純粋関数 |
| `spawnSnapshot` | プレビュー・テスト用のリテラル |

`hotbarSlotIndex` は mc-sim の `clampHotbarIndex` を再 export し、HUD の選択位置とキーボード focus に同じ規則を使う。`slotView` は inventory と hotbar の slot を同じ view type に変換する。これらの view model export は内部(可視)なので、変更は [versioning.md](./versioning.md) §5 の破壊的変更に分類しない。

### `domain/inventory-view-model.ts` — すべて内部(可視)

| export | 種別 |
| --- | --- |
| `INVENTORY_SLOT_COUNT`（36、mc-sim のミラー）/ `INVENTORY_MAIN_COLUMNS` / `INVENTORY_MAIN_ROWS` / `INVENTORY_MAIN_SLOT_COUNT` | 定数 |
| `MirroredItemId` / `MirroredItemStack` / `MirroredSlot` / `MirroredInventory` | type（**mc-sim のミラー**、provisional） |
| `CraftingSnapshot` / `CraftingResultSnapshot` / `InventorySnapshot` | type |
| `RegionId` / `SlotRegion` / `CraftingOutcomeView` / `MergeTargets` / `InventoryViewModel` | type |
| `inventoryViewModel` / `slotSnapshotOf` / `regionOf` | 純粋関数 |
| `emptyInventorySnapshot` | プレビュー・テスト用のリテラル |

**ミラーがバレルに載る理由**は §5-1 に書く。

### `domain/palette.ts` — すべて内部(可視)

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

### `application/**` — DOM 層。**契約(暫定)** と 内部(可視) が混在する

`application/` は `domain/` の射影を要素にする層である。`domain/` を import し、
**逆は無い**（`test/dom-surface.test.ts` が固定）。

| モジュール | export | 種別 | 分類 |
| --- | --- | --- | --- |
| `application/dom-surface.ts` | `DomNode` / `DomStyle` / `DomElement` / `DomElementFactory` / `DomAttributeTarget` | type | **契約(暫定)** — mc-compose が `document` を渡すときの受け口 |
| `application/hud-view.ts` | `createHudView` / `HudView`（`render` / `setMotion` / `setKeyboardFocus`）/ `EXPERIENCE_TRANSITION_MS` | 関数 + type + 定数 | **契約(暫定)** |
| `application/caption-view.ts` | `createCaptionView` / `CaptionView` | 関数 + type | **契約(暫定)** |
| `application/inventory-view.ts` | `createInventoryView` / `InventoryView` | 関数 + type | **契約(暫定)** |
| `application/save-indicator.ts` | `createSaveIndicator` / `SaveIndicator` / `SAVE_MESSAGES` / `SAVE_STATUS_GLYPH` / `SAVE_STATUS_LABEL` | 関数 + type + 定数 | **契約(暫定)** |
| `application/accessibility-dom.ts` | `COLOR_VISION_ATTRIBUTE` / `ColorVisionCell` / `colorVisionCell` / `applyColorVision` | 定数 + type + 関数 | **契約(暫定)** — canvas は mc-render のものだから |
| `application/palette-css.ts` | `PALETTE_PROPERTY_PREFIX` / `PALETTE_PROPERTY` / `PALETTE_SOURCE` / `PALETTE_VALUE` / `PALETTE_VAR` / `PALETTE_TOKEN_NAMES` / `PaletteTokenName` / `declarePalette` | 定数 + type + 関数 | 内部(可視) |
| `application/dom-write.ts` | `TextCell` / `StyleCell` / `PercentCell` / `AttributeCell` と各 `*Cell` / `write*` / `clearStyle` | type + 関数 | 内部(可視) |
| `application/slot-element.ts` | `SlotElement` / `createSlotElement` / `updateSlotElement` / `setSlotHidden` / `hideSlotElementAtMount` / `setSlotTabStop` / `setSlotKeyboardFocus` / `DURABILITY_LOW_PERCENT` / `FOCUS_RING_WIDTH` / `FOCUS_RING_SHADOW_WIDTH` | type + 関数 + 定数 | 内部(可視) |
| `application/icon-element.ts` | `IconKind` / `IconElement` / `createIconElement` / `updateIconElement` / `retireIconElement` | type + 関数 | 内部(可視) |

### Achievement toast

この API は、`src/domain/achievement-toast.ts` の payload schema と event projection、`src/application/achievement-toast-view.ts` の DOM view、および `src/application/achievement-toast-subscriber.ts` の event-bus subscription から成る。各 module の export は `src/index.ts` の root barrel に含まれる。まだ mc-compose が利用していない API は「契約(暫定)」、subscriber の内部 projection は「内部(可視)」に分類する。

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

**「契約(暫定)」**は、mc-compose などの host がまだ消費していない API を示す。最初の consumer が付くまでは、
既存 consumer を壊す互換性変更は発生しない。各 API の現時点の分類は上の表を参照し、release の versioning は
[versioning.md](./versioning.md) §5 に従う。

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


### `domain/caption.ts` — すべて内部(可視)

| export | 種別 |
| --- | --- |
| `MAX_VISIBLE_CAPTIONS`（4）/ `CAPTION_LIFETIME_SECS`（3） | 定数 |
| `CaptionEvent` / `CaptionSettings` / `CaptionQueue` / `CaptionLineView` | type |
| `emptyCaptionQueue` | 定数 |
| `receiveCaption` / `expireCaptions` / `captionLines` | 純粋関数 |

### `domain/save-status.ts` — すべて内部(可視)

| export | 種別 |
| --- | --- |
| `SAVED_VISIBLE_SECS`（3）/ `IDLE_SAVE_STATUS` | 定数 |
| `SaveMessage` / `SaveState` / `SaveStatus` | type |
| `saveStatus` / `saveStatusMessage` | 純粋関数 |

自動保存インジケータの**状態と表示時間**である。要素は `application/save-indicator.ts`。
`domain/caption.ts` と同じくクロックを取らず、時刻は引数で受ける。
**stage は増やしていない**——字幕と違って刈り取るキューが無く、
失効は読み取り時に経過時間を引いて判定するからである。

### `domain/accessibility.ts` — すべて内部(可視)

| export | 種別 |
| --- | --- |
| `ColorVisionMode` / `ColorVisionMatrix` / `RgbChannels` / `MotionSetting` / `MotionPreference` / `InputAction` / `KeyBindings` / `RebindResult` | type |
| `COLOR_VISION_MODES` / `COLOR_VISION_FILTER_TARGET` / `COLOR_VISION_FILTER_COLOR_SPACE` / `REBIND_CLEAR_KEYS` | 定数 |
| `colorVisionAttribute` / `colorVisionMatrix` / `colorVisionMatrixValues` / `applyColorVisionMatrix` / `resolveMotionPreference` / `animationDurationMs` / `shouldAnimate` / `rebind` / `unboundActions` | 純粋関数 |

`colorVisionMatrix` 以下の 3 つと `COLOR_VISION_FILTER_COLOR_SPACE` は
**`feColorMatrix` による色覚補正を実装する関数と定数**である。補正を有効にする UI とフィルターの両方を提供する。

### `domain/modal-stack.ts` — すべて内部(可視)

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

別の回帰テストは**不在**を固定する —
`REGRESSION: does not republish mc-kernel’s vocabulary as its own` が
`StageId` と `DeltaTimeSecs` がバレルに現れないことを assert する。
「見えるが公開ではない」の管理はドキュメントでできるが、
「所有していないものを公開する」はドキュメントでは止められない——消えるのが約束だからである。

アクセシビリティ関数の root exports はプレビューとテストで使うが、契約 API としては分類しない。存在は `test/public-api.test.ts` の export checks で固定する。
