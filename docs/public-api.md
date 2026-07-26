# 公開 API

出典: plan.md §4.1（モジュール契約）、§4.2（標準 stage 順序）、§2.3-3（全順序の所有者）。

## 1. mx-ui の公開面は他の 2 つより 1 つ広い

mx-gameplay と mx-redstone が mc-compose に対して公開するのは **stage 登録だけ**である
（plan.md §3.12 は mx-redstone について明示: 「主要な公開API: stage登録のみ(電力グラフは内部実装)」）。

mx-ui にはもう 1 つ要る。**UI は mount されなければならないから**である:

1. mc-compose がルート要素を渡せなければならない。DOM に依存しない他の体験モジュールにはこの問題が無い。
2. mc-compose が画面を開けなければならない。セッションライフサイクル（タイトル⇄ゲーム）は mc-compose の資産であり
   （plan.md §3.15）、「今はタイトル画面を出す」は mc-compose の判断である。

**この mount 面は first cut にはまだ存在しない。** `index.ts` にも `stages/registration.ts` にも無い。
意図している形は §4 に書く。

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
そのために `oxlint.json` は `@typescript-eslint/consistent-type-definitions` の例外を明記している
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

### 4-1. mount 面の想定形（未実装）

現状 `mc-compose` が mx-ui に画面を出させる手段は無い。想定している形:

```typescript
// 未実装。形だけの想定であり、mc-compose が実際に消費するまで確定しない。
export type UiMount = {
  /** DOM ルートを受け取り、解体は Scope に任せる。 */
  readonly mount: (root: HTMLElement) => Effect.Effect<void, never, Scope.Scope>
  /** mc-compose がセッション遷移で画面を開く。閉じるのは Escape ハンドラ側（DN-UI-4）。 */
  readonly open: (screen: ScreenId) => Effect.Effect<void>
}
```

設計上の制約が 3 つある:

1. **`HTMLElement` を要求する。** `document` を自分で探しに行かない。
   探しに行くと、各画面プレビューが同一ページで複数の mx-ui を立てられなくなる。
2. **解体は `Scope`。** plan.md §3.8 が「アプリスコープのシングルトンは再入可能な初期化を最初から」と要求しており、
   `makeUiFrameState` が Effect である理由（DN-UI-9）と同じである。
3. **`open` はあるが `close` は無い。** 閉じる決定は 1 か所（DN-UI-4）。
   mc-compose が任意に閉じられると、その 1 か所が 2 か所になる。

## 5. `index.ts` の全 export

`index.ts` は 6 モジュールを `export *` している（`domain/frame-contract.ts` は**含まれない**。下記）。分類:

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

`FrameServices = never` は意図的な乖離である。kernel は `ClockPort` の別名にしているが、
ここで `ClockPort` を再掲すると kernel と同じ文字列 ID を持つ**別の** `Context.Tag` ができてしまう。
見分けがつかない 2 つのタグは、狭すぎる型よりはるかに悪い。
`Effect<void, never, never>` は `Effect<void, never, ClockPort>` が欲しい場所に代入できるので、
このファイルに対して書かれた stage は kernel の import に差し替えても型検査を通り続ける。

### `domain/hud-view-model.ts` — すべて内部(可視)

| export | 種別 |
| --- | --- |
| `HEALTH_POINTS_PER_HEART` / `DEFAULT_MAX_HEALTH_POINTS` / `DEFAULT_MAX_HUNGER_POINTS` / `HOTBAR_SLOT_COUNT` | 定数 |
| `IconState` / `HotbarSlotSnapshot` / `VitalsSnapshot` / `HotbarSlotView` / `HudViewModel` | type |
| `iconRow` / `hudViewModel` | 純粋関数 |
| `spawnSnapshot` | プレビュー・テスト用のリテラル |

### `domain/caption.ts` — すべて内部(可視)

| export | 種別 |
| --- | --- |
| `MAX_VISIBLE_CAPTIONS`（4）/ `CAPTION_LIFETIME_SECS`（3） | 定数 |
| `CaptionEvent` / `CaptionSettings` / `CaptionQueue` / `CaptionLineView` | type |
| `emptyCaptionQueue` | 定数 |
| `receiveCaption` / `expireCaptions` / `captionLines` | 純粋関数 |

### `domain/accessibility.ts` — すべて内部(可視)

| export | 種別 |
| --- | --- |
| `ColorVisionMode` / `MotionSetting` / `MotionPreference` / `InputAction` / `KeyBindings` / `RebindResult` | type |
| `COLOR_VISION_MODES` / `COLOR_VISION_FILTER_TARGET` / `REBIND_CLEAR_KEYS` | 定数 |
| `colorVisionAttribute` / `resolveMotionPreference` / `animationDurationMs` / `shouldAnimate` / `rebind` / `unboundActions` | 純粋関数 |

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
