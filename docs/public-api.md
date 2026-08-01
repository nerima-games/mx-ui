# 公開 API

出典: plan.md §4.1（モジュール契約）、§4.2（標準 stage 順序）、§2.3-3（全順序の所有者）。

## 1. mx-ui の公開面は他の 2 つより 1 つ広い

mx-gameplay と mx-redstone が mc-compose に対して公開するのは **stage 登録だけ**である
（plan.md §3.12 は mx-redstone について明示: 「主要な公開API: stage登録のみ(電力グラフは内部実装)」）。

mx-ui にはもう 1 つ要る。**UI は mount されなければならないから**である:

1. mc-compose がルート要素を渡せなければならない。DOM に依存しない他の体験モジュールにはこの問題が無い。
2. mc-compose が画面を開けなければならない。セッションライフサイクル（タイトル⇄ゲーム）は mc-compose の資産であり
   （plan.md §3.15）、「今はタイトル画面を出す」は mc-compose の判断である。

この mount 面は `makeUiMount` として実装済みである。`mc-compose` の browser session が要求する
`name` / `start` / `stop` と構造互換であり、循環依存を作らずにそのまま runtime module として渡せる。

## 2. `StageRegistration` 契約（plan.md §4.1 逐語）

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

`domain/frame-contract.ts` はこれを**逐語で**再掲している。`type` ではなく `interface` のままなのも意図的で、
そのために `.oxlintrc.json` は `@typescript-eslint/consistent-type-definitions` の例外を明記している
（「Keeping the spec and the code character-identical is worth more than local style consistency」）。

このファイルは mc-kernel が publish された時点で削除される（[versioning.md](./versioning.md) §6）。

### 2-1. 全順序は mc-compose だけが解決する（plan.md §2.3-3）

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

## 3. 標準 stage 順序と、mx-ui が埋める枠（plan.md §4.2）

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
| `input` | `mc-render`（実行時入力サービス、plan.md §2.3-2） |
| `simulation` の physics / entities / time | `mc-sim` |
| `simulation` の interactions / fluids | `mx-gameplay` |
| `simulation` の redstone | `mx-redstone` |
| `camera-mirror` / `chunk-sync` / `render` / `post-fx` | `mc-render` |
| **`hud-sync`** | **`mx-ui`** |

**そして、この骨格自体は誰も宣言しない。** これは mc-compose が所有する全順序の形であって、
どのモジュールの資産でもない（plan.md §2.3-3）。

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

ここには長らく「`GameModule` はまだ実装していない。`RIn` は mc-sim と mc-audio の公開 API が
存在するまで名前を付けられないから」と書いてあった。**Layer は障害ではなかった。**

mx-ui はフレーム契約を通じてサービスを公開しない。UI を mount させる面は別の、意図的に小さい面である
（§4-1）。だから `layers` は空であり、最初から空だった。

本当の障害は **`frameStages` が配列だったこと**である。本リポジトリの stage は Effect の中で確保した
`Ref` から組み立てられるので、`ReadonlyArray` 型のフィールドに入れる方法が無かった。
縦切りスパイクが `frameStages` を Effect にしたことで、このファイルが既に取っていた形が契約になった。

```typescript
export const makeUiStages: Effect.Effect<ReadonlyArray<StageRegistration>>

export const uiModule: GameModule<never, never, never> = {
  layers: Layer.empty,
  frameStages: makeUiStages,
}
```

`RIn` は `never` のままである。`ui:hud-sync` が mc-sim を読み、`ui:overlay-sync` が
mc-audio に autoplay ゲートの状態を尋ねるようになったとき、それらは `frameStages` の中で —
つまり `RRegister` パラメータで — 取得される。本リポジトリはそれらが供給しなければならないものを
何も構築しないからである。

### 4-1. mount 面

`makeUiMount` はホストが所有する DOM ルートを受け取り、mx-ui が所有する子コンテナに HUD、inventory、
main menu を初期描画する:

```typescript
export type UiMount = {
  readonly name: string
  readonly start: Effect.Effect<typeof uiModule, unknown>
  readonly stop: Effect.Effect<void, unknown>
  readonly current: () => UiMountedViews | undefined
  readonly updateDebug: (snapshot: DebugHudSnapshot) => void
  readonly updateSettings: (settings: UiSettings) => void
  readonly openSettings: () => void
  readonly closeSettings: () => void
}
```

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

## 5. `index.ts` の全 export

`index.ts` は 20 モジュールを `export *` している——`domain/` の 7、`stages/` の 2、
そして **`application/` の 11**（`domain/frame-contract.ts` は**含まれない**。下記）。分類:

- **契約** — mc-compose が消費する。変更は破壊的変更（[versioning.md](./versioning.md) §5）。
- **内部(可視)** — このリポジトリ自身のプレビューとテストのために export しているだけ。
  変更は破壊的変更では**ない**。

### `stages/registration.ts`

| export | 種別 | 分類 |
| --- | --- | --- |
| `uiStages` | `(state) => ReadonlyArray<StageRegistration>` | **契約** |
| `makeUiStages` | `Effect<ReadonlyArray<StageRegistration>>` | **契約** |
| `makeUiFrameState` | `Effect<UiFrameState>` | **契約**（再入可能な初期化、DN-UI-9） |
| `UiFrameState` | type | 内部(可視) |
| `DEFAULT_CAPTION_SETTINGS` | `CaptionSettings` | 内部(可視) |

### `stages/stage-ids.ts`

| export | 種別 | 分類 |
| --- | --- | --- |
| `UI_STAGE_IDS` | `{ hudSync, overlaySync }` | **契約** |
| `UPSTREAM_STAGE_IDS` | `{ simPhysics }` | **契約** |
| `EXPERIENCE_MODULE_STAGE_PREFIXES` | `readonly string[]` | 内部(可視)（回帰テスト用） |
| `OWN_STAGE_PREFIX` | `'ui:'` | 内部(可視)（回帰テスト用） |

### `domain/frame-contract.ts` — **バレルには載せない**

`index.ts` はこのファイルを `export *` **しない**。末尾のコメントが存在と削除予定を記すだけである。

| export | 種別 | 分類 |
| --- | --- | --- |
| `StageId` | type + `Brand.refined` | **非公開**（所有者は mc-kernel） |
| `DeltaTimeSecs` | type + `Brand.refined` | **非公開**（所有者は mc-kernel） |
| `StageRegistration` | interface | **非公開**（所有者は mc-kernel）。`makeUiStages` の**戻り値の形**としてだけ観測される |
| `FrameServices` | type（現状 `never`） | **非公開**（所有者は mc-kernel） |

**re-export しない理由。** このファイルは mc-kernel が publish された時点でまるごと消える
（[versioning.md](./versioning.md) §6）。バレルに載せると `StageId` / `DeltaTimeSecs` /
`StageRegistration` が**所有していないパッケージの公開 API** になり、
約束済みの削除がすべての消費者にとっての破壊的変更に化ける。
消費者はこの語彙を kernel から取る。型は構造的に同一なので、
kernel から import した消費者は `makeUiStages` の戻り値に対してそのまま型検査を通る。
mc-sim / mc-render / mc-playground-kit のバレルが同じ判断をしており、mx-gameplay / mx-redstone も同じである。
固定しているテスト: `REGRESSION: does not republish mc-kernel’s vocabulary as its own`。

### 5-1. ではなぜインベントリのミラーは**載せる**のか

`domain/inventory-view-model.ts` も mc-sim の `Inventory` / `Slot` / `ItemStack` をローカル再掲している。
それは `export *` されている。**逆の判断であり、意図的である。**

判断を分けているのは**ミラーが何を指しているか**である。

| ミラー | 指しているもの | バレル | 削除・置換のコスト |
| --- | --- | --- | --- |
| `domain/frame-contract.ts` | mc-kernel の**契約**。mc-compose が消費する | 載せない | 載せれば約束済みの削除が MAJOR に化ける |
| `mx-gameplay/domain/chunk-store-port.ts` | mc-worldgen の**サービス**（`Context.Tag`） | 載せない | 他リポジトリのサービスの再公開。タグキー衝突という実害もある |
| `domain/inventory-view-model.ts` のミラー | 本リポジトリの純粋関数の**引数型** | **載せる** | mc-compose は `inventoryViewModel` を呼ばない → §5 の表で MINOR |
| `VitalsSnapshot` | 同上（最初のカットから載っている） | **載っている** | 同上 |

つまり**「他人の語彙を再公開するな」であって「他人の形を写すな」ではない**。
`VitalsSnapshot` が最初から後者をやっていて誰も問題視しなかったのは、
それが mx-ui の関数が「何を渡してほしいか」の表明だからである。インベントリのミラーも同じ位置にいる。

`test/inventory-mirror.test.ts` の
`REGRESSION: the mirror is published as a PARAMETER, not as mc-sim’s vocabulary` が
この 2 方向（ミラーは載る / `StageId` と `DeltaTimeSecs` は載らない）を 1 本で固定している。
詳細は [design-notes.md](./design-notes.md) DN-UI-12。

`FrameServices = never` は意図的な乖離である。kernel は `ClockPort` の別名にしているが、
ここで `ClockPort` を再掲すると kernel と同じ文字列 ID を持つ**別の** `Context.Tag` ができてしまう。
見分けがつかない 2 つのタグは、狭すぎる型よりはるかに悪い。
`Effect<void, never, never>` は `Effect<void, never, ClockPort>` が欲しい場所に代入できるので、
このファイルに対して書かれた stage は kernel の import に差し替えても型検査を通り続ける。

### `domain/hud-view-model.ts` — すべて内部(可視)

| export | 種別 |
| --- | --- |
| `HEALTH_POINTS_PER_HEART` / `DEFAULT_MAX_HEALTH_POINTS` / `DEFAULT_MAX_HUNGER_POINTS` / `HOTBAR_SLOT_COUNT` | 定数 |
| `IconState` / `HotbarSlotSnapshot` / `VitalsSnapshot` / `SlotView` / `HudViewModel` | type |
| `iconRow` / `hudViewModel` / `slotView` / `hotbarSlotIndex` | 純粋関数 |
| `spawnSnapshot` | プレビュー・テスト用のリテラル |

`hotbarSlotIndex` は `hudViewModel` の中のローカル式だった。export したのは
**同じ問いが 2 つになった**からである——mc-sim の `selectedHotbarIndex` と、
入力の所有者が言う「キーボードはどのスロットにいるか」（`HudView.setKeyboardFocus`、DN-UI-13i）。
どちらも境界を越えて来る index で、どちらも `9` / `-1` / `NaN` になりうる（DN-UI-7a）。
**選択を見失う HUD と消えるフォーカスリングは同じバグ 2 回**なので、導出は 1 つである。

`SlotView` は以前 `HotbarSlotView` という名前だった。改名したのは
`domain/inventory-view-model.ts` が**同じ型と同じ射影関数**を使うようになったからで、
「ホットバーの」と名乗る型が 36 スロットのインベントリにも出てくるのは誤りである。
`slotView` を export したのも同じ理由（DN-UI-7c / DN-UI-12）。
どちらもビューモデルの型なので [versioning.md](./versioning.md) §5 では**破壊的変更ではない**。

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
`document` を触らないので、宣言している保証（DN-UI-11）が主張ではなくテストになっている。
`simulateColorVision` が**シミュレーション**であって `domain/accessibility.ts` の
`colorVisionMatrix`（**補正**）ではないことは DN-UI-1a / DN-UI-11d を参照。

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

**「暫定」の意味**は §4-1 と同じである。mc-compose がまだ mount していないので、
`createHudView(factory, parent, motion)` という 3 引数の形は確定していない。
確定するのは mc-compose が実際に消費したときであり、それまでは
[versioning.md](./versioning.md) §5 の意味での破壊的変更は起きえない（消費者がいない）。

### なぜ `HTMLElement` ではなく構造型なのか

`tsconfig.base.json` は 16 リポジトリで唯一 `"lib": ["ES2024", "DOM"]` を宣言しており、
**`HTMLElement` は書ける**。それでも `application/dom-surface.ts` がある理由は 2 つで、
mc-render の理由（DOM lib が無い）とは**別物**である。

1. **`vitest.config.ts` の `environment: 'node'` を守るため。**
   `HTMLElement` に対して書かれたレンダラは、jsdom を入れるか
   `as unknown as HTMLElement` を書いた偽物を使うかしないとテストできない。
   後者のほうが悪い——キャストこそが型安全を失う場所であり、しかもそれがテスト側にあるので
   偽物が実物からずれても誰も気づけない。
2. **リスナを配らないため。** この面には `addEventListener` が**無い**。
   だから DN-UI-4 の「Escape の所有者は 1 つ」は規律ではなく**語彙の問題**になる。
   `test/public-api.test.ts` の
   `REGRESSION: exports no way for a renderer to take a key (DN-UI-4)` が
   バレル側からもこれを固定している。

構造型が実 DOM の**真の部分集合**であることは `test/dom-surface.test.ts` が
実 `lib.dom.d.ts` に対して fixture をコンパイルして診断 0 件を assert する（mc-render と同じ手口）。
支払った代償は DN-UI-13 に書く。

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
`domain/caption.ts` と同じくクロックを取らず、時刻は引数で受ける（DN-UI-10）。
**stage は増やしていない**——字幕と違って刈り取るキューが無く、
失効は読み取り時の引き算だからである（DN-UI-13h）。

### `domain/accessibility.ts` — すべて内部(可視)

| export | 種別 |
| --- | --- |
| `ColorVisionMode` / `ColorVisionMatrix` / `RgbChannels` / `MotionSetting` / `MotionPreference` / `InputAction` / `KeyBindings` / `RebindResult` | type |
| `COLOR_VISION_MODES` / `COLOR_VISION_FILTER_TARGET` / `COLOR_VISION_FILTER_COLOR_SPACE` / `REBIND_CLEAR_KEYS` | 定数 |
| `colorVisionAttribute` / `colorVisionMatrix` / `colorVisionMatrixValues` / `applyColorVisionMatrix` / `resolveMotionPreference` / `animationDurationMs` / `shouldAnimate` / `rebind` / `unboundActions` | 純粋関数 |

`colorVisionMatrix` 以下の 3 つと `COLOR_VISION_FILTER_COLOR_SPACE` は
**`feColorMatrix` ダルトナイゼーションそのもの**である。参照実装ではマークアップ（`index.html:445-460`）
だったので carry over から漏れていた。スイッチだけでは後ろに何も無いフックが残る（DN-UI-1a）。

### `domain/modal-stack.ts` — すべて内部(可視)

| export | 種別 |
| --- | --- |
| `ScreenId` / `ModalStack` / `EscapeOutcome` | type |
| `emptyModalStack` | 定数 |
| `topOf` / `openScreen` / `closeScreen` / `escapePressed` / `gameplayInputSuppressed` / `pointerLockReleased` | 純粋関数 |

## 6. 「可視だが公開ではない」が何を買うか

ビューモデル、字幕キュー、アクセシビリティ関数、モーダルスタックは**全部 export されている**。
export されているのに公開 API ではない、というのは矛盾に見えるが、そうではない。

- **export する理由**: 各画面プレビュー（plan.md §3.13）とテストがこのリポジトリの外側の入口（`index.ts`）から
  同じものを見られる必要がある。`test/public-api.test.ts` の
  `exposes the same implementations through the barrel as through the modules` がこれを固定している。
- **公開 API ではない理由**: mc-compose はこれらを使わない。使わないものを変えても mc-compose は壊れない。
  だから `iconRow` の戻り値を変えても **MINOR bump で済む**（[versioning.md](./versioning.md) §5）。

`test/public-api.test.ts` は 3 つのブロックに分けてこの区別を記録している —
`re-exports the stage registration contract — the part mc-compose actually consumes`（契約）、
`REGRESSION: every accessibility asset plan.md §3.13 asks to carry over is still exported`（消えたら困る資産）、
`re-exports the view-model domain and the modal stack, which the per-screen previews drive`（プレビューが駆動するもの）。

4 つ目は**不在**を固定するブロックである —
`REGRESSION: does not republish mc-kernel’s vocabulary as its own` が
`StageId` と `DeltaTimeSecs` がバレルに現れないことを assert する。
「見えるが公開ではない」の管理はドキュメントでできるが、
「所有していないものを公開する」はドキュメントでは止められない——消えるのが約束だからである。

2 つ目のブロックは分類ではなく**存在保証**である。
plan.md §3.13 が「引き継ぐ」と言っているアクセシビリティ資産は、
引き継がれた後に静かに落とされると引き継がれなかったのと区別がつかない。名前で列挙してあるのはそのためである。
