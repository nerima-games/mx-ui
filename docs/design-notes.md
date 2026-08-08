# 設計ノート（DN-UI-1 〜 DN-UI-13）

plan.md §3.13 / §3.6 / §2.3 の「設計注意」を展開したもの。

各項目は **ルール → 参照実装の根拠（`path:line`）→ 防いでいる失敗** の順で書く。
参照実装は `takeokunn/ts-minecraft`（凍結）、行番号は 2026-07-26 時点の実測。
各項目の末尾に、それを守っている**回帰テストの名前**を実際の `describe` / `it` タイトルで挙げる。
テストが無いものは「まだ無い」と書く（DN-UI-2 がそれである）。

## DN-UI-1 アクセシビリティ資産を引き継ぐ

plan.md §3.13:

> アクセシビリティ資産を引き継ぐ: 色覚モード(feColorMatrix ダルトナイゼーション、canvasのみに適用)、
> reduced-motion、キーリマッピングUI、サウンド字幕

4 つとも参照実装で**作って出荷済み**である。plan.md がわざわざ列挙しているのは、
**維持は安く、後付けは高い**からである。reduced-motion は特にそうで、
最初のアニメーションを書いた瞬間から全アニメーションに通しておかないと後から通せない。

`test/public-api.test.ts` の
`REGRESSION: every accessibility asset plan.md §3.13 asks to carry over is still exported`
が 4 資産 15 個の export を名前で列挙している。
**引き継いだ後に静かに落とすのは、引き継がなかったのと区別がつかない。** だから名前で固定する。

### DN-UI-1a 色覚モード — 4 値ちょうど、canvas だけ

**モードの集合は `off | protanopia | deuteranopia | tritanopia` ちょうどである。**

根拠: `packages/game/application/settings.schema.ts:10-11` が
`Schema.Literal('off', 'protanopia', 'deuteranopia', 'tritanopia')` を宣言している。
Schema リテラルなので、これは保存される設定値の形そのものである。
**集合を同一に保つと、参照実装のセーブした設定がそのまま読める。**
1 つ足しても引いても、その互換が消える。

UI 側の選択肢も同じ 4 つ: `packages/presentation/settings/settings-overlay-dom.ts:158-160`
（`<option value="protanopia">` / `deuteranopia` / `tritanopia`。`off` は :157）。

**フィルタは SVG `feColorMatrix` によるダルトナイゼーションで、canvas にだけ掛ける。**

根拠: `packages/presentation/hud/color-vision.ts:1-3`

> Applies the accessibility colorblind-correction setting. The actual filters
> (SVG feColorMatrix daltonization) live in index.html; this just flips the
> body data attribute the CSS rules key on.

つまり参照実装のモジュールがやるのは `<body>` の data 属性を切り替えることだけで、
**適用範囲を決めるのは CSS 側**である。`domain/accessibility.ts` の `COLOR_VISION_FILTER_TARGET = 'canvas'`
と `colorVisionAttribute` はこの分担をそのまま写している。

**ただし行列そのものも、ここが置き場である。**

スイッチだけを引き継ぐと、**後ろに何も無いフック**が残る。
`data-color-vision="protanopia"` は CSS が指す先があって初めて意味を持ち、その先＝
`feColorMatrix` の 20 個の数は参照実装の `index.html:445-460` にあった。
`pnpm preview --stats` はこの半端さを finding として報告した（当時の F5）。
**「引き継ぐ」は半分では満たされない。**

行列を mx-ui の `domain/` に置く理由は 2 つある。

1. **アクセシビリティを所有しているのはこのリポジトリである**（plan.md §3.13）。
   フィルタが掛かる canvas を所有するのは mc-render だが、**設定を所有してはいない**。
   置き場が無いままだと、最初にスタイルシートを書いた人がこの 20 個の数を別に再導出する。
2. **行列は算術なので、ここでならテストできる。** 参照実装ではマークアップだったので 1 度も検査されていない。
   `applyColorVisionMatrix` は他の導出と同じく `environment: 'node'` で走る。

分担そのものは変わっていない。**このモジュールが決めるのは値、スコープを決めるのはスタイルシート**である。

carry over した内容:

| 名前 | 参照実装の出所 | 何を守っているか |
| --- | --- | --- |
| `colorVisionMatrix(mode)` | `index.html:451-459` | 補正行列 3 つ。`off` は `undefined` = フィルタを入れない |
| `colorVisionMatrixValues(mode)` | 同上 | `<feColorMatrix values>` の文字列そのもの |
| `COLOR_VISION_FILTER_COLOR_SPACE = 'sRGB'` | `index.html:448-450` | SVG 既定の linearRGB では**中間調が明るくなりすぎる**。1 単語だが、補正と色褪せの差である |
| `applyColorVisionMatrix` | （参照実装に対応物なし） | 行和 1 とグレー不変を検査可能にするための算術 |

**行和が全て 1 である**（`index.html:445-447` が明記）。
これは白とグレーが素通しされるということで、**補正がシーン全体を色被りさせない**根拠である。
近似ではなく厳密なので、符号を 1 つ書き間違えれば即座に破れる。テストはそこを見ている。

**シミュレーションと補正を取り違えないこと。** `apps/preview-screens/ansi.ts` の行列は
Viénot–Brettel–Mollon の**シミュレーション**（プレイヤーに何が見えるか）であり、
`domain/accessibility.ts` の行列は**補正**（何を描き直すか）である。
入れ替えると、設定が直そうとしている当のものを壊す。両ファイルの冒頭が互いにそう書いている。

**なぜ canvas だけなのか。** 補正はピクセル単位の色変換である。
これを文書全体に掛けると、**UI クロームも一緒に変換される**。
UI クロームは意図的に、既にアクセシブルなコントラストで設計されている。
文書全体に掛けた結果は「アクセシビリティ設定を入れたら HUD が前より読みにくくなった」であり、
テキストのコントラスト比は設計時に満たしていた基準を満たさなくなる。

**`off` は属性を削除する。文字列 `"off"` を設定しない。**

根拠: `packages/presentation/hud/color-vision.ts:9-13`

```typescript
if (mode === 'off') {
  delete document.body.dataset['colorVision']
} else {
  document.body.dataset['colorVision'] = mode
}
```

`"off"` を設定すると、それに対応する CSS ルールが必要になる。誰も書かない。
`colorVisionAttribute('off')` が `undefined` を返すのはこの分岐の写しである。

回帰テスト（`test/accessibility.test.ts`、describe `colour vision (feColorMatrix daltonisation)`）:

- `REGRESSION: the filter targets the canvas only, never the whole document`
- `the mode set matches the reference exactly, so its saved settings stay readable`
- `"off" removes the attribute rather than setting it to a string`

行列側（`test/view-model.test.ts`、describe `colour vision correction (the feColorMatrix matrices themselves)`。
プレビューの finding は `test/view-model.test.ts` に降ろす規約なのでここにある）:

- `REGRESSION: every mode that sets the attribute also has a matrix, and \`off\` has neither`
  — 片方だけ立つと、属性を消したのにフィルタが残る（またはその逆）
- `the matrices are the reference’s, number for number`
- `REGRESSION: every row sums to 1, so greys and whites pass through unchanged`
- `the red-green corrections move red into the blue channel, which is the channel that is intact`
  — ダルトナイゼーションとは**これ**である。行和 1 を満たしたまま何も補正しない行列は書けるので、
  この 1 本が「フィルタとして妥当」と「補正として有効」を分けている
- `REGRESSION: the filter is declared in sRGB, not the SVG default`

### DN-UI-1b reduced-motion — 既定は OS、そして「短く」ではなく「ゼロ」

**OS の設定が既定値を種付けする。**

根拠: `packages/core/domain/environment-port.ts:10-13`

> OS-level accessibility preference (prefers-reduced-motion: reduce). Seeds
> the reducedMotion default so motion-sensitive users get it on first run
> without hunting for the toggle (WCAG 2.3.3).

これが `domain/accessibility.ts` の `MotionSetting = 'system' | 'full' | 'reduced'` と
`resolveMotionPreference` の形である。**`system` が既定であることが load-bearing** で、
動きに弱いプレイヤーは既に OS に伝えてある。
アニメーションを一画面ぶん見せてから改めて訊くのは、訊くのが遅すぎる。

消費側は `packages/app/application/frame/stages/render-stage.ts:33`（`readonly reducedMotion: boolean`）と
`:44`（`if (!inputs.reducedMotion) {` — カメラの bob / roll を止める）。
参照実装の :31-32 のコメントが範囲まで書いている:
「suppress camera bob/roll; the first-person arm keeps swinging (essential feedback), only CAMERA motion is reduced」。
**止めるのはカメラの動きであって、必須のフィードバックではない。**

**reduced motion は duration ゼロを意味する。「短く」ではない。**
100 ms の画面シェイクは依然として画面シェイクである。
この設定は「せっかちな人」ではなく「動きで気分が悪くなる人」のためにある。
`animationDurationMs(baseMs, motion)` が全 duration の唯一の通り道であることが、
「全部に通したか？」という問いに単一の答えを持たせている。

回帰テスト（`test/accessibility.test.ts`、describe `reduced motion`）:

- `REGRESSION: the default defers to the OS, because asking again is asking too late`
- `an explicit choice overrides the OS in both directions`
- `REGRESSION: reduced motion means zero duration, not a shorter one`
- `a negative base duration is clamped rather than producing a negative animation`

### DN-UI-1c キーリマッピング UI — Escape はバインドせずクリアする

根拠: `packages/presentation/settings/settings-overlay.ts:170-184` がリバインドフィールドの
`keydown` ハンドラ全体。核心は `:174-178`:

```typescript
event.stopPropagation()
if (event.code === 'Escape' || event.code === 'Backspace') {
  keyBindingValues.delete(action)
  input.value = ''
} else {
```

**Escape と Backspace はバインドされず、バインドを消す。**

罠は具体的である。プレイヤーが誤ってリバインドフィールドを開いてしまったとき、
**Escape を「スニーク」にバインドしない出口**が要る。
一度 Escape がスニークになると、ポーズメニューに到達できなくなり、直す手段はセーブの削除だけになる。

`domain/accessibility.ts` の `REBIND_CLEAR_KEYS = new Set(['Escape', 'Backspace'])` がこの 2 キーである。

同じフィールドにもう 1 つ、参照実装が入れたアクセシブルネームの修正がある。
`settings-overlay.ts:167-168`:

> Programmatic accessible name: the visible label is a sibling `<span>`,
> so a screen reader would otherwise announce this only as "edit text".

`:168` で `input.setAttribute('aria-label', \`Rebind ${label}\`)` を付けている。
**見えるラベルが兄弟要素だと、スクリーンリーダーには何も読み上げられない。**
リマップ画面を移植するときはこの 1 行も一緒に運ぶこと。

`rebind` が競合を**報告する**（自動解決しない）のも同じ系統の判断である。
もう一方のアクションを勝手に外すのは、「ジャンプできなくなった、理由も分からない」の作り方である。

回帰テスト（`test/accessibility.test.ts`、describe `key remapping`）:

- `REGRESSION: Escape and Backspace CLEAR a binding instead of being bound to it`
- `REGRESSION: a conflict is reported, never silently resolved`
- `rebinding an action to the key it already holds is idempotent, not a self-conflict`
- `binding is immutable: the map passed in is never modified`
- `unbound actions are reported so the screen can show them rather than hide them`

### DN-UI-1d サウンド字幕

DN-UI-3 を参照。

---

## DN-UI-2 `it.effect` + `Effect.fork` + `Deferred.await` はデッドロックする

**DOM イベントフローのテストはプレーン `it` + `Effect.runPromise` で書く。`it.effect` では書かない。**

これはこのリポジトリのテストに関する最重要事項である。

plan.md §3.13 が明記している:

> DOMイベントフローのテストで Effect.fork + Deferred.await を `it.effect` で書くとデッドロックする
> — プレーン `it` + `Effect.runPromise` を使う(参照実装で確立)

参照実装はこれを**独立に 3 か所**で記録している。

1. `docs/codex-implementation-prompt.md:161` — 実装者向けの注意書きとして:

   > `it.effect` + `Effect.fork` + `Deferred.await` の組み合わせはデッドロックする → `it` + `Effect.runPromise` を使う

2. `packages/presentation/menu/confirm-dialog.test.ts:88-97` — 実際に踏んだ記録:

   > The earlier `describe.skip` block (P1-W2b) attempted to drive the dialog
   > through forked-fiber + Effect.sleep + simulated click events but hit a
   > fiber-scheduling race where Effect.acquireRelease's `acquire` step (which
   > installs the DOM listeners) ran AFTER the test thread's synthetic click —
   > so the awaited Deferred never resolved.

3. 同ファイル `:128-132` — 採った回避策:

   > Standard `it` + `Effect.runPromise` is used here (not `itEffect.effect`):
   > the dialog's internal `Effect.scoped` + `Deferred.await` chain, when run
   > inside `@effect/vitest`'s scope, blocks the test's scope-finalization
   > even with `Fiber.interrupt`. Plain `Effect.runPromise` lets us fork,
   > assert on the synchronous construction phase, and interrupt cleanly.

### 機構

`Deferred` を解決するのは **DOM のイベントリスナ**である。DOM のイベントリスナは
Effect ランタイムのファイバスケジューラの**外側**で走る。
`it.effect` はテスト本体を 1 本のファイバとして走らせ、そのファイバが `Deferred.await` で待つ。
待たせている側を進める仕事は、そのスケジューラの中に**存在しない**。だから戻らない。

`Effect.runPromise` なら Effect の外に出るので、テストのアサーションと DOM イベントの発火を
同じマイクロタスクキューの上で順序づけられる。`Fiber.interrupt` で片付けもできる。

### まだ存在しないテストへの制約である

**このリポジトリには DOM フローのテストが 1 本も無い。** それでもここに書いてあるのは、
最初の 1 本を書く人が参照実装で確定済みの罠を踏み直さないためである。
1 度踏むと `describe.skip` が 1 個増えて、その画面のイベントフローが恒久的に未検証になる
（参照実装で実際にそうなり、Playwright の e2e に移された）。

`vitest.config.ts` の `environment: 'node'` の注記にもこの規則が書かれており、
DOM を持つ suite を足すときに必ず目に入るようにしてある。

回帰テスト: **まだ無い。** DOM フローの suite が出来た時点で最初の 1 本になる。
詳細と before/after のスケッチは [testing.md](./testing.md) §3。

---

## DN-UI-3 字幕はオーディオゲートより前に発火する

plan.md §3.6:

> 字幕イベントはオーディオゲート(ブラウザの自動再生制限)より**前**に発火する
> (参照実装の確定挙動: 音が出せない状態でも字幕は出る)

ブラウザはユーザーがページを操作するまで音を鳴らさない。
**素直な実装 — 音を鳴らす場所で字幕を出す — は次の結果になる:**

- 聞こえないプレイヤーは、たまたまクリックするまで何も見えない。
- ミュートで遊んでいるなら、**永久に何も見えない**。

字幕の存在意義の正反対である。だから mc-audio はゲートを見る**前**に字幕を発行し、mx-ui はそれを購読する。

### `audioUnlocked` を「読まないフィールド」として置く

`domain/caption.ts` の `CaptionSettings` は `audioUnlocked: boolean` を持ち、
**`receiveCaption` はそれを読まない**。

読まないなら削れる。削らない理由は、**欠落を見えるようにするため**である。
フィールドが無ければ「読み忘れ」と「読まない設計」が区別できず、テストにも書けない。
フィールドがあれば「意図的に読まない」が主張になり、回帰テストが書ける。

`stages/registration.ts` の `DEFAULT_CAPTION_SETTINGS.audioUnlocked` は `false` である。
最初のフレームはオートプレイゲートが満たされる前に来る。**そのフレームで字幕が失われてはならない。**

一方 `captionsEnabled` は**ゲートする**。それはプレイヤーの明示的な選択だからで、
「音が出せない」という環境の都合とは別のものである。

### キューの設計 2 点

- **同じ `cueId` は積み上げず更新する。** 1 秒に 8 回の足音は 8 行ではなく 1 つの事実である。
- **同時表示は 4 件まで**（`MAX_VISIBLE_CAPTIONS`）。
  無制限に伸びる字幕リストは戦闘中に文字の壁になり、読めなくなる。読めない字幕は無いのと同じである。

回帰テスト:

- `test/view-model.test.ts` describe `captions fire before the audio gate`:
  - `REGRESSION: a caption is shown even when the browser has not unlocked audio`
    — `audioUnlocked` の true/false で出力が `toStrictEqual` で同一であることまで見ている
  - `the player turning captions off DOES suppress them, because that is an explicit choice`
  - `REGRESSION: repeating a cue refreshes it instead of stacking duplicates`
  - `at most 4 captions are visible, newest first`
  - `REGRESSION: expiry takes the time as an argument — nothing here reads a clock`
  - `caption lines carry a directional arrow and a freshness that fades to zero`
  - `a zero lifetime yields zero freshness instead of dividing by zero`
  - `a non-positional sound gets no arrow`
- `test/stage-registration.test.ts`:
  - `REGRESSION: the default caption settings have audio LOCKED, and captions still work`

---

## DN-UI-4 モーダルの Escape は `stopPropagation`、閉じる責務はフレーム側単一ハンドラ

plan.md §3.13:

> モーダルの Escape は stopPropagation、閉じる責務はフレーム側単一ハンドラ(mc-render の入力設計と対)

対になる半分は mc-render 側にある。参照実装 `packages/presentation/input/input-service.ts:172-178`:

> Key listeners live on `window` (bubble phase) so modal overlays
> (inventory/settings/pause/chat) that consume a key with
> stopPropagation() on `document` shield it from gameplay input.
> Otherwise the frame-pipeline sees the same Escape one frame after
> the modal already handled it and acts on stale modal state.

実際の使用は `packages/presentation/settings/settings-overlay.ts:174`（リバインドフィールド）と
`:320`（オーバーレイの `handleDocumentKeyDown` で Escape を消費して閉じる）。

### 2 つの機構を混ぜない

| 機構 | 層 | 仕事 |
| --- | --- | --- |
| `stopPropagation()` on `document` | DOM | **キーストロークがゲームプレイ入力に届かないようにする** |
| Escape の**意味の決定** | フレーム | **最前面のモーダルを閉じるのか、ポーズメニューを開くのか** |

前者は DOM 層の仕事であり、DOM 層が持つ。
後者は `domain/modal-stack.ts` の `escapePressed` 1 本であり、**純粋関数なのでブラウザ無しで検証できる**。

`gameplayInputSuppressed(stack)` は後者の相棒で、DOM イベントを見ない stage が
「チャット入力中にツルハシを振らない」を知るための経路である。
`pointerLockReleased` が同じ条件なのに別関数なのは、
ポインタロックを保ちたいモーダル（ミニマップ、透過 HUD エディタ）が出た瞬間に分岐するからで、
**その時点で `stack.length > 0` を全部探す作業を誰も正しくやらない**。

### 分散させたときの失敗モード

**Escape のリスナを 2 つのモーダルが持つと、1 回の押下で 2 枚閉じる。**
設定オーバーレイを閉じるつもりで 1 回押したプレイヤーは、
ポーズメニューごと消えてゲームに戻される。ゾンビに食われている最中に。

参照実装は同じ系統の問題を `packages/app/application/main/session-runtime-overlays.ts:151` に記録している:

> paths (Escape, M key, Save & Quit) with no shared open/close stream

共有の open/close ストリームが無かったので、可視状態をポーリングで同期する羽目になった。

`escapePressed` が「スタック」だけでなく「アクション」も返すのはこの理由である。
呼び出し側が「スタックが変わらなかった → ポーズを開く」と**再導出**すると、
決定が 2 か所に増える。**2 回導出される決定は、いずれ違うように導出される。**

回帰テスト（`test/accessibility.test.ts`、describe `Escape belongs to ONE frame-level handler`）:

- `REGRESSION: Escape closes exactly one modal, top-down`
- `REGRESSION: Escape with nothing open opens the pause menu, and says so explicitly`
- `REGRESSION: re-opening a screen raises it instead of pushing a duplicate`
- `closing a screen that is not on top removes only that screen`
- `gameplay input and pointer lock are suppressed whenever anything is open`

3 本目は別の失敗の話で、既にスタックにある画面を再度開くと**重複が積まれる**。
重複は閉じるのに Escape が 2 回要る。プレイヤーの体験としては「Escape が効かなかった」である。

---

## DN-UI-5 mx-ui は mc-playground-kit を必要としない

plan.md §3.13:「kit 不要(DOMのみで起動)」。

kit は「ミニ平地ワールド + カメラ + レンダラ + 入力を 1 秒で束ねる糊」（plan.md §3.10）である。
mx-ui のプレビューは各画面を状態モックで単体起動するので、背後に世界が要らない。

**これが買うもの:**

- **全 suite と全プレビューが DOM だけで起動する。** ワールド生成もチャンクロードも THREE の初期化も無い。
- CI が軽い。これが plan.md §5.3 で画面別分割を棄却した根拠の半分である
  （「DOMのみでCIが軽く、プレビューは複数エントリで既に独立起動できる。利得ゼロ」）。
- kit の起動速度と安定性に開発体験が縛られない。plan.md §3.10 は
  「全プレビューの開発体験がここの起動速度と安定性に依存する」と書いているが、mx-ui はその依存から外れている。

ただし plan.md §2.3-2 の**組織全体のルールはここでも生きている**。
kit を `dependencies` に入れると出荷ビルドから入力処理が消える、という理由は mx-ui でも変わらない。

回帰テスト（`test/check-dependency-whitelist.test.ts`、describe `§2.3-2: mc-playground-kit is devDependency-only`）:

- `mx-ui needs no kit at all — its previews boot from the DOM alone`
- `REGRESSION: kit in "dependencies" would still be an error here, because the rule is org-wide`
- `REGRESSION: importing kit from shipped source is an error even if it is declared correctly`
- `kit remains allowed from tooling, should a preview ever want a world behind it`
- `REGRESSION: `stages/` counts as shipped source, not as tooling`

---

## DN-UI-6 ハーフハートは丸めない

**体力 1 点のプレイヤーには半分のハートが見えなければならない。**

切り捨てれば空の列を見せることになり、切り上げれば満タンの列を見せることになる。
**どちらも嘘であり、真実が最も重要な瞬間についた嘘である。**

`domain/hud-view-model.ts` の `iconRow` が割り算ではなく関数である理由がこれである。規則:

| 残り点数 | アイコン |
| --- | --- |
| 2 以上 | `full` |
| ちょうど 1 | `half` |
| 0 | `empty` |

したがって 19 点は `full` × 9 + `half` × 1、1 点は `half` × 1 + `empty` × 9 になる。

最大値が奇数のときも列は足りる（`Math.ceil(safeMax / 2)`）。5 点満点の Mob 体力バーは 3 アイコンで、
満タンが `['full', 'full', 'half']` になる。

回帰テスト（`test/view-model.test.ts`、describe `hearts and hunger shanks`）:

- `REGRESSION: an odd health total shows a HALF heart rather than rounding it away`
- `zero health is ten empty hearts, not an empty array`
- `an odd maximum still gets a row long enough to hold it`

2 本目も同系統の主張である。体力 0 で**空配列**を返すと、HUD からハートの行が消える。
死んだプレイヤーが見るべきなのは「空のハート 10 個」であって「何も無い」ではない。

---

## DN-UI-7 スナップショットは信用せずクランプする

**HUD が例外を投げるのは、HUD が一瞬間違っているより悪い。**

`domain/hud-view-model.ts` が入力を検証ではなくクランプで扱うのはこれが理由である。
クランプするもの:

| 値 | 起こりうる異常 | 処理 |
| --- | --- | --- |
| `healthPoints` | 最大値超過 / 負 / 非整数 | `clamp(Math.floor(v), 0, safeMax)` |
| `selectedHotbarIndex` | `9` / `-1`（ホイールの巻き戻り、古いセーブ、QA API 呼び出し） | `clamp(⌊v⌋, 0, 8)` |
| `experienceProgress` | `1.5` / `-1` | `clamp(v, 0, 1)` → 整数パーセント |
| `durability` | 範囲外 | `clamp(v, 0, 1)` → 整数パーセント |
| `hotbar` の長さ | 短い配列 | 出力は常に `HOTBAR_SLOT_COUNT` = 9 |

**そして根拠はスナップショットの出所にある。** `VitalsSnapshot` は mc-sim から来る。
mc-sim は別リポジトリであり、ピン留めされたバージョン境界を越えて来る
（[versioning.md](./versioning.md) §3 のボトムアップ publish-then-pin）。
境界の向こうで意味が変わった値は、いつかここに届く。

出力のホットバーが常に 9 スロットなのは DOM 層のためで、
**DOM 層が短い配列について考えなくて済む**。

### DN-UI-7a `Math.min`/`Math.max` は NaN を素通しする

**クランプが止めていたのは簡単な半分だけだった。**

`Math.min(Math.max(NaN, 0), 20)` は `0` ではなく `NaN` である。NaN との比較は全て false だからで、
`9` と `-1` は止まるが `NaN` は素通しした。`pnpm preview --stats` が 3 つの症状として報告している
（当時の F2 / F3、および本文に出ていなかった 2 件）:

| 入力 | 旧挙動 | 直った後 |
| --- | --- | --- |
| `healthPoints: NaN` | 全アイコン empty **かつ `dead: false`** | 全アイコン empty **かつ `dead: true`** |
| `selectedHotbarIndex: NaN` | **どのスロットも選択されない** | スロット 0（`-1` と同じ） |
| `count: NaN` | `countLabel: "NaN"` を HUD に描く | `empty: true`、ラベル無し |
| `experienceLevel: NaN` | `experienceLevelLabel: "NaN"` | `"0"` |
| `maxHealthPoints: Infinity` | **`RangeError` を投げる**（`Array.from({length: Infinity})`） | アイコン 0 個 |

**そして NaN こそがこの節の想定していた入力である。** クランプを選んだ理由は
「値がバージョン境界を越えて来るから」であり、ゼロ最大値での除算・意味が変わったフィールド・
形の違うセーブの読み込みは、どれも `9` ではなく `NaN` を寄越す。

規則は 1 つ: **`clamp` は NaN を `low` にする。**

`low` である理由は DN-UI-6 と同じである。`[low, high]` の中で、
**スナップショットが主張していない体力を発明しない**唯一の値が `low` だからである。
`high` に倒せば、死んでいるかもしれないプレイヤーに満タンのハート列を見せることになり、
それは DN-UI-6 が名指しで禁じている嘘そのものである。

**throw にはしない。** この節の前提（「HUD が例外を投げるのは、HUD が一瞬間違っているより悪い」）は
そのまま生きている。むしろ `Infinity` の行は、旧実装に**唯一許されない結果**が実在したことを示している。

### DN-UI-7b 列とフラグは同じ数から導く

**旧実装の本当の欠陥は NaN そのものではなく、`dead` が独立した式だったことである。**

```typescript
hearts: iconRow(snapshot.healthPoints, snapshot.maxHealthPoints),  // クランプ経由
dead:   Math.floor(snapshot.healthPoints) <= 0,                    // クランプを経由しない
```

**同じ 1 つの問いに 2 つの導出があれば、いずれ違う答えを出す。** DN-UI-4 が Escape について
「2 回導出される決定は、いずれ違うように導出される」と書いているのと同じ話である。
現在は両方が `safePoints(...)` の 1 つの値を読む。

### DN-UI-7c 空スロットは全フィールドが空である — そして射影は 1 つである

`empty` ガードは `itemId` と `countLabel` を消していたが `durabilityPercent` を消していなかった
（当時の F1）。「フィールドがあれば描く」と書いた DOM 層——**それが自然な書き方である**——は、
空スロットの下に耐久バーを描く。プレイ中に到達する: **道具が壊れると `count: 0` と耐久度が残る**。

**この節が DN-UI-12 の根拠でもある。** 欠陥の本体は「1 つ書き忘れた」ことではなく、
**スロットの射影が 1 か所にしか無いという保証が無かった**ことである。
インベントリ画面が自前の射影を書けば、この 3 フィールド目の判断を**もう一度**することになり、
今度は 36 スロットぶん間違える。したがって `slotView` は export され、
`domain/inventory-view-model.ts` は全リージョンをそれ経由で射影する。
`REGRESSION: the slot projection is SHARED with the hotbar, never re-derived` が
ホットバーの 1 スロットとインベントリの同じスロットを `toStrictEqual` で突き合わせている。

### DN-UI-7d XP バーは `floor`、耐久度は `round`

`Math.round(0.999 * 100)` は `100` である。すると XP バーが満タンなのに
**隣のレベル表示が上がらない**（当時の F4）。プレイヤーには固まった HUD に見え、
しかもこの矛盾は画面上で確認できてしまう。`Math.floor` なら **1.0 だけが 100 に届く**。

`durabilityPercent` は `Math.round` のままである。**そちらの 100% は出来事の主張ではなく**、
隣に矛盾を作る数字も無い。異なる 2 つの丸めがあるのは事故ではなく判断である。

回帰テスト（`test/view-model.test.ts`）:

- `a snapshot from across a version boundary is clamped rather than trusted`
- `REGRESSION: an out-of-range selected index is clamped, so the HUD never loses its selection`
- `the view model always has exactly 9 slots, however short the snapshot`
- `experience progress becomes a clamped whole percentage`
- `a slot holding zero of something is empty, not a zero-count item`
- `REGRESSION: NaN is clamped like any other bad value — Math.min/Math.max pass it through`（DN-UI-7a）
- `REGRESSION: a non-finite maximum yields no icons rather than throwing`（同）
- `REGRESSION: a NaN selected index still selects a slot, exactly as 9 and -1 do`（同）
- `REGRESSION: a NaN count is not drawn as the text "NaN"`（同）
- `REGRESSION: a NaN experience level is not drawn as the text "NaN"`（同）
- `REGRESSION: NaN health makes the heart row and the \`dead\` flag agree`（DN-UI-7b）
- `REGRESSION: an empty slot reports NO durability — every field goes, not just the obvious two`（DN-UI-7c）
- `REGRESSION: the XP bar does not read 100% one level early`（DN-UI-7d）

`a slot holding zero of something is empty, not a zero-count item` は別種で、
`count: 0` の `itemId` 付きスロットは**空**として扱う。
「0 個の石」を描くと、プレイヤーは持っていないものを持っているように見る。

---

## DN-UI-8 stage の `after` は制約のみ、全順序は mc-compose

plan.md §2.3-3:

> stage 実行順序表は compose が唯一所有。各モジュールは順序制約(`after`)を宣言するだけで、
> 全順序は compose が解決する

したがって `StageRegistration` には優先度も添字も**書く場所が無い**。
`test/stage-registration.test.ts` の
`REGRESSION: a registration carries constraints and nothing else — no priority, no index`
は各登録のキー集合が `['after', 'id', 'run']` ちょうどであることを検査している。

### import ゲートに見えない穴

`StageId` は文字列である（`domain/frame-contract.ts`）。文字列であることは意図的で、
`after: [StageId('sim:physics')]` が mc-sim の stage モジュールを import せずに順序を表現できる。

**その同じ性質が穴でもある。**

```typescript
// これは pnpm check:deps を通る。import が 1 つも増えないから。
after: [StageId('gameplay:interactions')]
```

`scripts/check-dependency-whitelist.ts` は import を見るので、これが見えない。
そして mx-ui は組織で**最もこれを書きたくなる場所**である（[architecture.md](./architecture.md) §5）。

だから 2 つ目のゲートがある。`stages/stage-ids.ts` が全 `StageId` を 1 ファイルに集め、
`EXPERIENCE_MODULE_STAGE_PREFIXES` と `OWN_STAGE_PREFIX` を使って
`test/stage-registration.test.ts` が兄弟モジュールへのエッジを検査する。

回帰テスト（`test/stage-registration.test.ts`）:

describe `§2.3-1 zero edges between experience modules`:

- ``REGRESSION: no `after` edge names another experience module — "the hotbar updates after mining" is NOT an ordering constraint on gameplay``
- `REGRESSION: every declared upstream stage belongs to a foundation repository`
- `REGRESSION: mx-ui does not order itself against mc-render either, though §4.2 puts hud-sync after post-fx`

describe `§2.3-3 the total order belongs to mc-compose`:

- `REGRESSION: a registration carries constraints and nothing else — no priority, no index`
- `the two registered stages split by what they read`
- `StageId rejects a blank id`

`test/public-api.test.ts`:

- `REGRESSION: exports nothing that would let a consumer resolve a total stage order`

---

## DN-UI-9 初期化は再入可能に — `makeUiFrameState` は Effect であって定数ではない

plan.md §3.8 が参照実装の最大級のバグ源として記録している:

> **ゲームループ・自動保存は `forkDaemon`**(スコープ非依存)+ 明示 `stop()`。
> 参照実装では2周目ワールドのデッドロック/やり残しfiberが最大級のバグ源だった。
> アプリスコープのシングルトンは**再入可能な初期化**を最初から

`stages/registration.ts` の `makeUiFrameState` は `Effect.Effect<UiFrameState>` であり、定数ではない。
呼ぶたびに独立した `Ref` 一式ができる。

mx-ui での実際の必要は 2 周目ワールドではなく**プレビュー**である。
plan.md §3.13 は各画面を単体起動できることを完成条件にしており、
**同一ページで複数の mx-ui 状態が立つ**ことになる。
シングルトンだと、インベントリプレビューのモックが設定プレビューに漏れる。

回帰テスト（`test/stage-registration.test.ts`、describe `stage behaviour`）:

- `each call to makeUiFrameState yields independent state (re-entrant initialisation)`
- `every stage tolerates dt = 0`

2 本目は `DeltaTimeSecs` の契約側で、ゼロ delta は合法であり stage が拒否せず処理しなければならない
（`domain/frame-contract.ts` の `DeltaTimeSecs` の注記）。

---

## DN-UI-10 `Date.now()` 禁止 — そして mx-ui で最も効く

plan.md §4.3:

> クロックPort — 決定論・fast-forward の要。`Date.now()` 直接参照禁止

**この禁止が最も効くのが mx-ui である。** UI は時刻を欲しがるものだらけだからで、少なくとも 4 つある:

| 欲しがるもの | 代わりに何を受け取るか |
| --- | --- |
| 字幕の失効 | `expireCaptions(queue, nowSecs, lifetimeSecs)` の `nowSecs` 引数 |
| トーストのフェード | `captionLines(queue, nowSecs)` が返す `freshness` |
| 自動保存インジケータ | フレームが供給する `dt`（未実装） |
| FPS カウンタ | 同上（参照実装は `packages/presentation/fps-counter.ts`、53 LOC） |

**全部が時刻をパラメータとして取る。** `domain/caption.ts` の冒頭がこの選択を説明している:

> Rather than take a clock dependency here, the queue is bounded by COUNT and
> the caller supplies the monotonic timestamp it already has.

`stages/registration.ts` の `ui:overlay-sync` は `dt` を `state.elapsedSecs` に積算して `nowSecs` を作る。
**単調時刻は読むものではなく積み上げるものである。**
これが「字幕の 3 秒をマイクロ秒で経過させる」テストを可能にしている。

### なぜ oxlint ではなくスクリプトなのか

oxlint 0.12 は `no-restricted-syntax` も `no-restricted-properties` も**実装していない**。
`no-restricted-globals` は `oxlint --rules` の一覧に出るが、これも実装されていない
（0.12.0 で実測確認済み。3 ルール全部を設定した状態でも診断 0 件）。

したがって禁止は `scripts/check-dependency-whitelist.ts` の rule 7 にある。
コメント・文字列リテラル・正規表現リテラルの中身は `maskSource` でマスクされるので誤検知しない。
`.oxlintrc.json` の冒頭にこの実測メモがあり、oxlint が該当ルールを実装したら移す、と書いてある。

禁止対象は 3 つ: `Date.now()` / `new Date()` / `performance.now()`。
クロック Port の実装アダプタだけは実クロックを読む必要があるので、
その行に `mc-kernel-allow-time-source` コメントを付けると除外される。

回帰テスト:

- `test/check-dependency-whitelist.test.ts` describe `§4.3: the clock is injected, never read from a global`:
  - `REGRESSION: Date.now(), new Date() and performance.now() are all rejected`
  - `a mention of Date.now() inside a comment or a string is not a violation`
- `test/view-model.test.ts`:
  - `REGRESSION: expiry takes the time as an argument — nothing here reads a clock`
- `test/stage-registration.test.ts`:
  - ``REGRESSION: caption ageing is driven by accumulated `dt`, never by a wall clock``

---

## DN-UI-11 パレットは「何を、何に対して」保証するかを言う

**mx-ui は長らく色を 1 つも定義していなかった。** トークンもテーマもスタイルシートも無く、
`domain/accessibility.ts` は「スタイルシートが key にする属性」の名前だけを持ち、
プレビューのコントラスト表は**プレビュー自身が発明した hex 値**を測っていた。
ハーネスは本物、被検体は仮置きである（当時の G1）。

`domain/palette.ts` がこれを埋める。埋め方に 3 つの判断がある。

### DN-UI-11a 参照実装から掘る。ただし測ってから採る

参照実装には**パレットが無い**。`packages/presentation` だけで生の色リテラルが実測約 460 個、
色の CSS カスタムプロパティは `--icon-fill` と `--vital-glow` の 2 つだけである。
その代償が参照実装自身のソースに出ている——**同一のコントラスト修正が 4 ファイルに複写されている**:

> white on a gradient whose lightest stop is `#6d6d6d` yields 5.36:1;
> the old `#e0e0e0`-on-`#7e7e7e` was 3.92:1 — a real fail

`packages/presentation/settings/settings-overlay-dom.ts:70` と `:231`、
`packages/presentation/menu/confirm-dialog.ts:69`、
`packages/presentation/menu/death-screen-styles.ts:67`。
**1 か所に書く場所が無かったから 4 回書いてある。** これがトークンモジュールを置く理由である。

値は参照実装から取った（各定数に `<reference-impl>/path:line` を書いてある）。
ただし**取ってから測り、2 つは動かした**:

| トークン | 参照実装 | 採った値 | 理由 |
| --- | --- | --- | --- |
| `HEART` | `index.html:287` `#c81919` | `#e02828` | 最悪世界ピクセル上で 2.61:1。アイコンの下限 3:1 に届かない |
| `ICON_EMPTY` | `index.html:263` `#2d2d2d` | `#767676` | 同 1.10:1。**明るい地面の上で消える空ハート**は DN-UI-6 の嘘の別ルートである |
| `STATUS_BUSY` | `index.html:204` `#ffe38a` | `#e8c040` | `STATUS_OK` と潰れる。`#e8c040` は参照実装が隣の役割で使っている値（`index.html:147` / `:496`） |
| `STATUS_ALERT` | `index.html:212` `#ffd6d2` | `#f4553f` | **下記の実際の欠陥** |

### DN-UI-11b 調査が見つけた欠陥 — 参照実装の自動保存インジケータ

`index.html:159` は保存成功のインクを `#d7f7c2`、`:212` は**保存失敗**を `#ffd6d2` にしている。
シミュレートすると、この 2 つは protanopia で **12**、deuteranopia で **22** しか離れていない
（潰れ閾値は 442 の立方体対角に対して 24）。

**赤緑色覚特性のプレイヤーは「ワールドを保存しました」と「保存に失敗しました」を区別できない。**
同じ場所に、同じ背景の上に、同じくらいの長さの文字列が出る。

参照実装のアクセシビリティゲートには**構造的に見えない**。
`e2e/ui/accessibility.e2e.ts:10` はテキストノードの `color` を自分の `background-color` と比べる。
**ある状態と別の状態を比べることは 1 度もしない**——そしてプレイヤーが実際にする比較はそちらである。
同じ穴のせいで、ハート・肉・XP・選択スロットという**意味を担う色は 1 つも検査されていない**。
どれもテキストではなく塗りだからである。

直し方は色相の入れ替えではなく**輝度のはしご**である（OK 0.85 / BUSY 0.57 / ALERT 0.29）。
二色覚は色相を圧縮し、**輝度はおおむね保存する**。だから輝度で分けた集合は構成上生き残り、
色相で分けた集合は運で生き残る。

### DN-UI-11c 保証は「mx-ui 自身の面に対して」だけ

**レンダリングされた世界の上で「WCAG AA」は誰も守れない主張である。** 背景はプレイヤーが向いた方角で決まる。
だから主張を真になるまで狭めて、`surveyPalette` で強制する。

| # | 保証 | 対象 |
| --- | --- | --- |
| G1 | テキスト 4.5:1 / アイコン・メーター・枠 3:1 | **宣言した面に対して**。`SCRIM` は半透明なので、**あり得る最悪の世界ピクセル**の上での合成に対して測る |
| G2 | 全 `CRITICAL_PAIRS` が 4 モードすべてで `COLLAPSE_SEPARATION` 以上離れている | シミュレーション後の sRGB 距離 |
| G3 | 全ペアが色以外のチャンネル（形・輪郭・長さ・太さ・位置・数字）を 1 つ以上宣言している | — |

**保証しないもの**: レンダリングされたシーンの上に直接描かれるもの。canvas は mc-render の資産であり
（plan.md §3.9）、任意の世界ピクセルの上のグリフにコントラスト下限は無く、mx-ui はそれを主張しない。
**`SCRIM` がトークンであってデコレーションでないのはこのためである** — 上の主張を守れるものにしている機構が
スクリムであり、そこから出た内容は保証も一緒に置いていく。

G1 の最悪値が**標本ではなく厳密**なのは、合成の輝度が背景の各チャンネルについて単調だからである。
ただしコントラスト比は背景輝度について V 字なので、両端を見て真の最小になるのは
**前景の輝度が合成の範囲の外にあるとき**だけである。`surveyPalette` はこれを仮定せず
`boundIsExact` として**検査**する。満たさないトークンは「ある世界の上でスクリムに溶ける」トークンであり、
静かに誤って測られるのではなく落ちなければならない。

### DN-UI-11d 補正はこの色に届かない

DN-UI-1a のとおり、`feColorMatrix` ダルトナイゼーションは **canvas にだけ**掛かる。
つまり `domain/palette.ts` の色は**1 つも補正されない**。
参照実装も同じ判断をしており、`index.html:416` がその根拠として
「the HUD already carries icon/shape/numeric redundancy」と書いている。

したがって **G2 は「あると良いもの」ではない**。色覚特性のあるプレイヤーにとって、
HUD の後ろに立っているのはこれだけである。そして G3 を壊すことは
**別リポジトリで下された判断を無効にする**ことでもある。

回帰テスト（`test/view-model.test.ts`、describe `the palette keeps its guarantee`）:

- `REGRESSION: every guarded token clears its floor over ANY world pixel`
- `REGRESSION: no critical pair collapses under any of the four colour-vision modes`
- `REGRESSION: the pair the reference collapses is the pair this palette fixed`
  — 参照実装の 2 値を**そのまま入れて潰れることを assert している**。
  「参照実装の値に戻す」人に理由が伝わるようにするためである
- `REGRESSION: shape coding is not the only distinguisher, and it is not optional either`
  — 両方向である。色は唯一のチャンネルであってはならないが、**形を宣言すれば距離テストを免除される、でもない**
- `REGRESSION: a token that lands on top of another is a failure until somebody explains it`
  — 宣言済みペアだけでなく**全トークン対**を掃く。逃げ道は `KNOWN_NEAR_COLLISIONS` で、書かれた理由を要求する
- `the tokens render for a stylesheet through exactly one function`
- `REGRESSION: the SIMULATION is not the CORRECTION, and neither file holds both`

`KNOWN_NEAR_COLLISIONS` は 1 件しかなく、それは**手抜きではなく色空間の限界**を記録している。
最悪世界ピクセル上で 4.5:1 を確保し、かつ 3 種の二色覚すべてで空腹オレンジから 40 単位離れる
「警告色」を sRGB 全体から探すと、**返ってくるのはグレーと紫だけ**である。
暗い HUD の上に、警報でもあり空腹とも区別できる赤は**存在しない**。
だからその区別は領域・形・トーストの文字が全部担っており、後で発見されるのではなくここに書いてある。

---

## DN-UI-12 ミラーは組織の既定手であって、この画面だけの例外ではない

`inventory` と `crafting` は plan.md §3.13 が挙げる 4 画面のうちの 2 つでありながら、
長く `ScreenId` union のメンバーでしかなかった（当時の G2）。
保留には理由が書かれていた——**mc-sim がインベントリ状態を所有し、その形をまだ publish していない。
今書けば読み取るスナップショット型を発明することになり、`api-lock.md` がそれを公開面として固定する。**

**この論はそれ自体は正しい。しかしこの事例に固有ではない。** 同じ論が組織の全ミラーの論である:

| ミラー | 何を写しているか | pin しているテスト |
| --- | --- | --- |
| `domain/frame-contract.ts`（本リポジトリ） | mc-kernel の frame 契約 | `test/public-api.test.ts` |
| `mx-gameplay/domain/chunk-store-port.ts` | mc-worldgen の `ChunkStore` **全体** | `test/chunk-store-mirror.test.ts` |
| `mc-render/domain/camera-mirror.ts` | mc-sim のカメラ姿勢 | `test/camera-mirror.test.ts` |
| 各 `domain/kernel-vocabulary.ts` | kernel 語彙 | 各 `test/kernel-mirror.test.ts` |
| **`VitalsSnapshot`（`domain/hud-view-model.ts`）** | **mc-sim のプレイヤー状態** | — |

最後の行が決定的である。**`VitalsSnapshot` は最初のカットから `api-lock.md` に載っている。**
保留の論を一貫して適用すれば、`hudViewModel` も書けなかったことになる。

### 前提も事実として間違っていた

**mc-sim の形は「未知」ではなく「未 publish」である。**
`mc-sim/domain/inventory.ts` が `Inventory` / `Slot` / `ItemStack` / `ItemId` /
`INVENTORY_SLOT_COUNT` を定義しており、**mc-sim 自身の `api-lock.md` の `## Exported` に 5 つとも載っている**。
「GitHub Packages にまだ無い」が障害の全部であり、**それはミラーパターンが発明された当の障害である**
（mx-gameplay が mc-worldgen に対して既に渡った橋と同一）。

### 保留が正しかった部分は残してある

`domain/inventory-view-model.ts` のミラー節は provisional と明記し、置換手順（1. 依存を足す
2. 節を消す 3. import を差し替える）を持ち、`test/inventory-mirror.test.ts` が**双方向の代入**で
形を pin している。意図的な広げ方 2 つ（`count` を brand しない / `durability` は mc-sim に無い）も
そこに書いてある。

### chunk-store-port と 1 点だけ違う — バレルに載せる

mx-gameplay はミラーを `index.ts` から export **しない**。
`ChunkStore` は `Context.Tag` であり、**他リポジトリのサービス**を再公開することになるからである
（同じ文字列キーの 2 つのタグは実行時に 1 つのサービスで型としては別物、という実害がある）。

このミラーはタグでもサービスでもない。**本リポジトリ自身の純粋関数の引数型**である。
mc-compose は `inventoryViewModel` を呼ばないので、mc-sim publish 時に引数を狭めるのは
[versioning.md](./versioning.md) §5 の MINOR であり、破壊的変更ではない。
**`VitalsSnapshot` が最初から占めているのと同じ位置**である。
`REGRESSION: the mirror is published as a PARAMETER, not as mc-sim’s vocabulary` が
この区別（ミラーは載る / kernel 語彙は載らない）を 1 本で固定している。

### 射影しかしない。解釈はしない

plan.md §2.3-1 は**スタッキング規則とレシピ照合を mc-sim に割り当てている**。
したがってこのファイルに `canStack` も `matchRecipe` も無く、あってはならない。

| mc-sim が所有 | mx-ui が所有 |
| --- | --- |
| 2 つのスタックが合体するか | 画面が対象スロットをハイライトするか |
| グリッドがレシピに一致するか | 出力マスをどこに描くか |
| 36 スロットと中身 | そのうち 9 がホットバーで 27 がグリッドであること |

**そして答えを持っていないときは `unknown` を射影する。** これが一番効くところである:

- **クラフト結果は 3 値である。** `match` / `no-match` / `unknown`。
  `no-match` は「作れるものは無い」という**主張**であり、mx-ui にその資格は無い。
  mc-sim にはレシピモデルが**存在しない**（`api-lock.md` に `Recipe` が無い）ので、
  実際の値は `unknown` である。空の出力マスを描けば嘘になり、
  しかも**プレイヤーがレシピに迷っているまさにそのとき**に嘘になる。
- **合体可能スロットは mc-sim が答える。** ここで `itemId` を比べれば `addItem` の 3 分の 1 を再実装し、
  `MAX_STACK_COUNT` の上限を取りこぼす。しかも**プレイヤーが約束と読むハイライトの中で、静かに**間違える。
- **mc-sim に無いリージョンは `unknown` である。** 防具枠を空のマス 4 つで描けば
  「あなたは何も装備していない」と言ったことになる。mc-sim は**何も言っていない**。別の画面である。

回帰テスト（`test/view-model.test.ts`、describe
`inventory and crafting project state without interpreting it`）:

- `the projection is pure, total and the same for the same input`
- `REGRESSION: the slot projection is SHARED with the hotbar, never re-derived`（DN-UI-7c）
- `layout is mx-ui’s: 36 flat slots become a hotbar and a 9x3 grid`
- `REGRESSION: a state this repository cannot interpret is UNKNOWN, never guessed`
- `“no recipe matches” and “mc-sim has not answered” are DIFFERENT screens`
- `one derivation serves both screens — the grid width comes from the snapshot`
- `REGRESSION: this repository implements no stacking rule and no recipe matcher`
- `a snapshot from across a version boundary is clamped, exactly as the HUD’s is`（DN-UI-7）

および `test/inventory-mirror.test.ts` の 6 本。

**画面が 2 つで導出が 1 つ**なのは、インベントリとクラフトが**グリッドの幅しか違わない**からである。
その幅は mc-sim のコンテナが知っている（`CraftingSnapshot.gridWidth`）ので、
`craftingViewModel` を別に建てれば 1 つの射影の 2 つ目の導出になる——DN-UI-7c が記録している当の間違いである。

## DN-UI-13 DOM 層 — 狭い構造面、冪等な描画、リスナ皆無

**ルール: `application/` は `domain/` の射影を要素にする。`domain/` を import し、逆は無い。
DOM には `application/dom-surface.ts` の構造型を通してだけ触る。**

`domain/hud-view-model.ts` が最初から書いていた約束である:
「When the DOM layer arrives it goes in a sibling module that imports this one,
never the other way round」。`test/dom-surface.test.ts` の
`REGRESSION: domain/ still cannot reach a document` が向きを固定する
（`domain/` の全ファイルについて `application` への import が無く、`document.` / `window.` が
コード中に現れないこと）。`lib` に DOM が入っているのはこのリポジトリだけなので、
**これを守っているのはこのテストだけ**である。

### DN-UI-13a なぜ `HTMLElement` を直接書かないのか — mc-render とは別の理由

mc-render の `application/dom-surface.ts` は**書けないから**存在する（build プロジェクトに DOM lib が無い）。
ここは違う。`tsconfig.base.json` は最初から `"lib": ["ES2024", "DOM"]` であり、
`HTMLElement` は `domain/` でも書ける。**この非対称は事実として認めた上で、面はやはり要る。**

1. **`environment: 'node'` を守るため。** `docs/testing.md` §2 はこれを既定ではなく判断として書いている。
   `HTMLElement` に対して書かれたレンダラは jsdom を要求するか、
   `as unknown as HTMLElement` を書いた偽物を要求する。**後者のほうが悪い**——
   キャストこそ型安全を失う場所であり、しかもそれがテスト側にあるので、
   偽物が実物からずれても落ちるものが無い。
2. **リスナを配らないため。** この面に `addEventListener` は**無い**（DN-UI-13c）。

### DN-UI-13b 代償 — mc-render のそれとは**別物**である

mc-render の代償は「イベントのフィールドを全部 optional にする」ことだった。
ブラウザが**渡してくる**値（リスナ引数の `Event`）を名指すので、`DomInputEvent` は
`Event` の**上位型**でなければならない、という一方向の要求である。

要素の構築は向きが逆で、代償の落ちる場所も違う。要素はブラウザが**返してくる**値
（`createElement` の戻り）であり、同時にブラウザに**渡す**値（`appendChild` の引数）でもある。
前者は上位型を要求し、後者は反変性により**下位型**を要求する。構造的な部分集合は両方にはなれない。

| # | 代償 | 何が起きるか |
| --- | --- | --- |
| 1 | **`appendChild` はメソッド構文で書く**（`readonly appendChild: (...) => ...` ではなく） | プロパティ構文だと `strictFunctionTypes` が引数を反変に比べ、`HTMLElement` が代入不能になる（`Type 'DomNode' is missing the following properties from type 'Node': baseURI, childNodes, firstChild, isConnected, and 45 more`）。メソッド引数は**双変**なのでこれだけが抜け道である。**双変は実際に穴**であり、隠さずここに書く——偽の要素を実 `appendChild` に渡せるのはこれのおかげであり、無関係なオブジェクトを渡せるのも同じ理由である |
| 2 | **親子の辺のためだけに 2 つ目のほぼ空の型（`DomNode`）が要る** | `DomElement` は使えない。双変はどちらか一方向が通れば良いが、`DomElement` と `Node` は**どちらの向きにも**代入不能である（`Node` に `setAttribute` が無い）。`{}` も使えない——何でも通してしまう。`nodeType` はすべての `Node` が持ち、かつノード階層を引き込まずに名指せる唯一のメンバである。mx-ui はこれを読まない |
| 3 | **`textContent` は `string \| null`** | null は 1 度も書かず 1 度も読まないのに union で持つ。mc-render の「イベントのフィールドを全部 optional」の直接の対応物である。lib.dom が宣言を変えている（旧: `textContent: string \| null`、TypeScript 5.9: `get(): string` / `set(value: string \| null)`）ので、両方を満たす形が union である。mc-render が `requestPointerLock` の戻りを `unknown` にしたのと同じ判断——**このファイルはブラウザの年代を選ばない** |

3 つとも「自然に書いた版がコンパイルを通らない」ことで見つかった。
`test/fixtures/dom-surface.ts` を実 `lib.dom.d.ts` に対してコンパイルして診断 0 件を assert する
`test/dom-surface.test.ts` が唯一の番人である——**`pnpm typecheck` は 1 と 2 の退行を見られない**。
面を狭めれば fixture も一緒に直され、両方通ってしまうからである。

**mc-render との運用差が 1 つある。** mc-render は fixture を全プロジェクトから `exclude` する
（見えない DOM 型を名指すので）。ここは全プロジェクトに DOM lib があるので fixture を
`tsconfig.json` / `tsconfig.test.json` にも**入れてある**。ゲートが 2 つになるだけで費用は無い。
テストのほうが権威なのは、**誰かが lib を狭めたときに生き残るゲートだから**である。

### DN-UI-13c Escape の所有者は語彙の問題である

DN-UI-4 は「閉じる責務はフレーム側単一ハンドラ」と言う。従来これは**規律**だった。

`application/dom-surface.ts` に `addEventListener` が無いので、いまは**構造**である。
この面に対して書かれたレンダラはリスナを付けられない——動詞が語彙に無い。
3 方向から固定してある:

- `test/dom-surface.test.ts` — 面のソースに宣言が現れないこと。
- `test/hud-view.test.ts` の `REGRESSION: attaches no event listener anywhere in its tree` —
  偽 document は**わざと面より高機能**で `addEventListener` を実装しているので、
  これは「偽物に記録できなかった」ではなく「レンダラが付けなかった」の観測である。
- `test/public-api.test.ts` の `REGRESSION: exports no way for a renderer to take a key (DN-UI-4)`。

**設定画面を作らなかったのはこの帰結である。** キーリマップは `KeyboardEvent.code` を要求し、
入力サービスは mc-render のもの（plan.md §2.3-2）である。
ラベルの一覧だけ描いて「設定画面ができた」と言えば、**中心の挙動が到達不能で検査不能な画面**が
このリポジトリに残る——DN-UI-1a が 1 段落かけて拒否した「後ろに何も無いフック」そのものである。

### DN-UI-13d 描画は差分である — セルという単位

**すべての書き込みは「要素のメンバ＋最後に書いた値」を持つセルを通る。**
`ui:hud-sync` は毎フレーム走り、HUD の入力はそのうちの数フレームでしか変わらない（plan.md §5.2）。
`textContent = x` は x が同じでもテキストノードを破棄・再生成するので、無変更の書き込みは無料ではない。

固定している性質は「速い」より強い: **モデルが変わらない再描画は DOM を 1 回も触らない**。
偽 document が変更ログを持つので、これは機械の速度に依存しない厳密な assert になる
（`expect(factory.since(before)).toStrictEqual([])`）。

- 木は mount 時に 1 度だけ組み、以後は変異させる。**要素を消さない**——余ったアイコンは `hidden` にする。
  だから面に `removeChild` が無く、すべてのセルが恒久的な要素参照を持てる。
- **フレーム経路で色を書かない。** 色は mount 時に入る `var(--mx-ui-*)` 参照であり、
  状態変化は「どの変数を参照するか」を差し替えるだけで、それも差分である。
- 唯一割り当てるのはパーセント文字列で、`writePercent` が**数値を先に比べる**ので
  実際に動いたフレームでしか作らない。
- 割り当てが起きる唯一の経路は**ハート列が伸びたとき**（最大体力の変化）である。
  毎フレームの出来事ではなく、代替（無限の上限に備えて先に確保する）は
  `safeMaxPoints` が上限を持たない以上とれない。

### DN-UI-13e トークンは mx-ui 自身のルートに宣言する

**カスタムプロパティ。`:root` でも `<body>` でも生成スタイルシートでもなく、host から渡されたルートに。**

- **生成スタイルシートは却下。** `document.head` が要り、`docs/public-api.md` §4-1 制約 1 が禁じている
  （「`document` を自分で探しに行かない…探しに行くと、各画面プレビューが同一ページで
  複数の mx-ui を立てられなくなる」）。スタイルシートは文書大域なので、
  2 つの mx-ui が 1 組の規則を奪い合う——制約が防ごうとしていた当の結果である。
- **要素ごとのインライン色も却下。** トークンの**値**が使うたびに DOM に入るので、
  ハート 1 列で `HEART` が 10 回現れ、毎フレーム 10 回の色文字列比較が要る。
  「パレットは画面に届いたか」の答えが N 個になる。
- **`:root` / `<body>` はカスタムプロパティが**継承する**のが理由で却下。**
  色覚属性は canvas に付く（DN-UI-1a）。トークンを `:root` に置くと両者が同じスコープに入り、
  `body[data-color-vision="protanopia"] { --mx-ui-heart: … }` という**まったく自然な 1 行**が
  書けるようになる——それは DN-UI-1a が禁じている当の失敗（コントラストを測って作った UI クロームを
  再着色する）である。`test/screen-views.test.ts` が両側から固定している:
  mx-ui のどの要素にも属性が付かず、canvas にはトークンが 1 つも無い。
- **そして保証の範囲と一致する。** `domain/palette.ts` は G1 を「mx-ui 自身の面に対してだけ」と述べ、
  「レンダリングされたシーンの上に直接描かれるもの」は保証**しない**と明記する。
  ルートに閉じれば「トークンが**見える**要素の集合」と「保証が**覆う**要素の集合」が構成上一致する。
  `:root` なら canvas 配下は前者に入って後者に入らず、それを言うものが何も無い。

### DN-UI-13f G3 は属性では満たせない

`CRITICAL_PAIRS` は各対に非色チャネルを宣言し、G1〜G3 の G3 は
「belt AND braces」——G2 に通ったから形を免除、はしない——と明言する。
`data-icon-state="half"` を出すだけのレンダラは `surveyPalette` の数値を全部緑に保ったまま、
**その冗長性を削除する**。しかも参照実装が DOM HUD を**未補正のまま**にした判断
（`<reference-impl>/index.html:416`：「the HUD already carries icon/shape/numeric redundancy」）は
その冗長性の存在に支えられているので、削れば**別のリポジトリの決定を無効化する**。

だからアイコンは 2 要素である: 中空グリフ（`♡` / `○`、`ICON_EMPTY`）の上に
実体グリフ（`♥` / `●`、`HEART` / `SHANK`）を 100 / 50 / 0% でクリップする。
`shape` と `length` と `position` が**要素として**あり、
半分状態は DN-UI-6 が要求するとおり**半分のグリフ**になる（半ハートの文字は存在しないので、
再着色では表現できない）。スロット選択は色に加えて枠 2px→3px（`weight`）である。
`test/hud-view.test.ts` の
`carries the icon distinction on SHAPE and LENGTH as well as colour (palette G3)` が固定する。

### DN-UI-13g 届いていなかった 3 つ — 集合は空になった

`test/palette-css.test.ts` のこの assertion は長らく
`['focusRing', 'statusBusy', 'statusOk']` ちょうどだった。**いまは `[]` である。**

`--mx-ui-focus-ring` をルートに宣言することと、画面がフォーカスリングを**描く**ことは別である。
`surveyPalette` は `GUARDED_TOKENS` の 14 個全部を測るので、どの要素も参照していないトークンは
**保証がまだ数値についてだけのトークン**だった。3 つとも CSS を書き足しても埋まらず、
書き足して埋まらないという事実そのものが「何を作るべきか」の指定になっていた:

- `FOCUS_RING` — フォーカスできる要素が無かった。→ DN-UI-13i
- `STATUS_OK` / `STATUS_BUSY` — 自動保存インジケータが無かった。**これが居心地の悪い方**であり、
  `status ok / status alert` は**この調査が参照実装で見つけた当の対**（`#d7f7c2` と `#ffd6d2` が
  protanopia で 12 しか離れていない）だったので、
  **調査の目玉の修正がこのリポジトリの中で理論のままだった**。→ DN-UI-13h

**テストは消さず、掃き出しとして残してある。** 1 度閉じたことと閉じ続けることは別で、
`GUARDED_TOKENS` に足されて誰も参照しないトークンは、まったく同じ穴を 1 つずつ静かに開け直す
（`surveyPalette` はそれを緑と報告し続ける）。

### DN-UI-13h 自動保存インジケータ — 状態は 3 要素、失敗は失効しない

**要素を 3 つ作る。1 つ作って色を差し替えない。**

`domain/save-status.ts` が状態と時間、`application/save-indicator.ts` が要素である。
DOM 側の形を決めているのは 1 つの要求だけである: **状態は色無しで区別できなければならない。**

これは上品な追加ではなく**調査の発見そのもの**である。G3 は各対に非色チャネルの宣言を要求し、
DN-UI-13f は「属性では満たせない」と書いている。したがって

```
⟳  Saving world…    STATUS_BUSY
✔  World saved      STATUS_OK
✖  Save failed      STATUS_ALERT
```

の 3 行が**それぞれ独立した要素**として mount 時に建ち、描画は `hidden` の付け外しだけになる。買えるもの:

1. **フレーム経路で色を 1 度も書かない。** hud-view が許している「どの `var()` を持つかの差し替え」すら起きない。
2. **テキストも書かない。** `textContent = x` は同じ値でもテキストノードを作り直す（DN-UI-13d）。
   そして**言葉は最強の非色チャネル**なので、恒久的に持つ価値がある。
3. **3 つの status トークンが mount 時に要素へ届く。** 1 要素方式だと
   「`STATUS_BUSY` は画面に届いたか」の答えが**最後に描いた状態に依存**し、
   `test/palette-css.test.ts` が閉じたはずの穴が形を変えて戻ってくる。
4. `removeChild` は要らないままである。

**そして時間の設計が 4 行のうち 3 行で判断になっている。**

| 状態 | 表示 | 期間 |
| --- | --- | --- |
| `idle` | 無し | — |
| `saving` | する | ホストが別のことを言うまで。**mx-ui は測らない** |
| `saved` | する | `SAVED_VISIBLE_SECS`（3 秒）。`CAPTION_LIFETIME_SECS` と同じ数で、同じであることが意図である |
| `failed` | する | ホストが別のことを言うまで。**失効しない** |

**`failed` が失効しないのが核心である。** 確認は領収書であり、見逃しても費用は無い——
確認している当の出来事はもう起きている。失敗は警告であり、見逃すとワールドを失う。
そして「保存に失敗しました」を最も見逃すのは、HUD の隅ではなくゲームを見ていたプレイヤーであって、
**3 秒のトーストはまさにその人を落とす機構**である。

これは副産物として、**参照実装が潰していた 2 状態のもう 1 本の差**でもある: 片方は消え、片方は残る。
`Distinguisher` の union には入れていない（あれは一目で読む channel の集合である）が、実在し、無料である。

**`saving` も測らない。** 保存を所有しているのは mc-sim であり、
N 秒で諦めるスピナは「書き込みは終わった」と嘘をつく——DN-UI-6 がハーフハートで拒否したのと同じ種類の嘘である。

**スピナは入れなかった。** 回る `⟳` は装飾アニメーションであり、reduced-motion で消さねばならない
（`domain/accessibility.ts`）。つまり**足した上で、最も注意深く保存を見ているプレイヤーからは即座に取り上げる**
ことになる。状態はグリフと 3 語で既に運ばれているので、動きが足す情報はゼロで、忘れうる箇所が 1 つ増えるだけである。

**この作業がパレット側の穴も 1 つ露出させた。** `CRITICAL_PAIRS` は `STATUS_ALERT` を含む 2 対を宣言して
止まっていた（参照実装の欠陥が「失敗」の話だったから）。4 状態のインジケータは
**「保存済み」対「保存中」**もプレイヤーに比べさせる。宣言されていない対は全対掃き出しが
**偶然**守っているだけで約束ではなく、G3 が非色チャネルを要求しない。
`status ok / status busy` を宣言に足した——最悪 108 単位離れており、
deuteranopia でのコントラストは **1.11:1**。つまり `heart full / shank full` と同じく**彩度で分かれている**対であり、
グリフは飾りではなく信号の大半である。

回帰テスト（`test/save-indicator.test.ts`、15 本）。中核はこの 1 本:

- `names the reference’s two values, shows they collapse, and shows the screen does not depend on them`
  — `#d7f7c2` / `#ffd6d2` を**そのまま書いて**潰れることを assert し、
  そのうえで画面側が別要素・別グリフ・別の文であることを assert する。
  `test/view-model.test.ts` の同名の主張は**パレットについて**、これは**画面について**である。

### DN-UI-13i フォーカスリング — リングは描画、キーは入力

**「フォーカスできる要素が無い」の本当の理由は「コントロールにはキーが要る」ではなかった。**

DN-UI-13c は設定画面を作らない理由を書き、その帰結として `FOCUS_RING` に消費者が無かった。
しかし**フォーカスリングは描画の問題であって入力の問題ではない**。要素は、このリポジトリが
キーストロークを 1 つも取らずに、focusable にでき、スタイルもできる。3 つを分けると所有者が違う:

| 事柄 | 必要な動詞 | 所有者 |
| --- | --- | --- |
| スロットがフォーカスを持てる | `setAttribute` | mx-ui |
| フォーカスが**どう見えるか** | `style.setProperty` | mx-ui |
| フォーカスを**動かす**キーストローク | `addEventListener` | mc-render |
| 動いたことを mx-ui に**伝える** | — | mc-render |

上 2 つは `application/dom-surface.ts` に既にある動詞だけで足りる。**面は 1 メンバも広げていない。**
特に `focus()` も `addEventListener` も足していない——前者はフォーカスを動かす動詞、後者は観測する動詞で、
どちらも入力であり、入力は mc-render のものである（plan.md §2.3-2、決定はフレーム級 = DN-UI-4）。

**作ったもの: ホットバーを roving `tabindex` の 1 タブストップにした。**

- 9 スロットのうち 1 つだけが `tabindex="0"`、残りは `"-1"`。文書のタブ順で**ホットバー全体が 1 停留点**になる。
- リングは**スロットごとの専用要素**である（`data-mx-ui="slot-focus-ring"`）。
  `FOCUS_RING` の金 3px を `FOCUS_RING_SHADOW` の暗色 5px の内側に置く——
  `CRITICAL_PAIRS` が宣言する `weight` チャネルが**2 つの実寸**として存在する。
- 色は mount 時に入り、フォーカスは `hidden` の 1 属性で切り替わる。**フレーム経路で色を書かない。**

**リングを枠ではなく別要素にしたのは、パレットの文をそのまま構造にするためである。**
`domain/palette.ts` は `FOCUS_RING` を `SLOT_SELECTED` と分けて持つ理由をこう書いている:
「"Which slot is the game using" と "which control is the keyboard on" は別の問いであり、
キーボードで操作しているプレイヤーは**両方を同時に**訊いている」。
**2 つの問い、2 つの要素**であり、別々のスロットで同時に点く。
`test/hud-view.test.ts` の
`REGRESSION: the ring and the SELECTION are different questions on different slots` がこれを固定する。

**リスナ無しで正直でいられる理由。** タブストップとリングは**同じスロット**に置かれる。
だから Tab でブラウザが**ネイティブに**フォーカスする要素は、mx-ui がリングを描いた要素と
**構成上一致する**。キーを 1 つも取らず、何も観測せずに一致する。

**まだ mc-render のものである半分、正確に。** 入力の所有者が `setKeyboardFocus` を呼ぶまで、
Tab を押したプレイヤーが見るのは**ユーザーエージェント既定のリング**であってパレットのそれではない。
これは DN-UI-1a が拒否した「後ろに何も無いフック」ではない——リングもトークンもタブストップも実在し到達可能である——が、
**このリポジトリだけでは閉じられない唯一の点**であり、閉じるにはキーストロークに気づく必要がある。

`setKeyboardFocus` が渡された index は `hotbarSlotIndex` を通る。
`selectedHotbarIndex` が通るのと**同じ導出**である: どちらも境界を越えて来る index で、
どちらも `9` / `-1` / `NaN` になりうる。**選択を見失う HUD と消えるリングは同じバグ 2 回**なので、
導出は 1 つである（DN-UI-7c / DN-UI-4「2 回導出される決定は、いずれ違うように導出される」）。

`role="group"` + `aria-label="Hotbar"` をホットバー行に付けた。DN-UI-1c が参照実装で記録している
「見えるラベルが兄弟要素だと何も読み上げられない」の同型で、
**名前の無いフォーカス停留点は何も告げない停留点**である。静的なのでフレーム費用はゼロ。

回帰テスト（`test/hud-view.test.ts`、describe `the hotbar is focusable, and mx-ui still owns no keys`、7 本）:

- `is ONE tab stop, not nine — a roving tabindex the browser honours natively`
- `draws NO ring until somebody says where the keyboard is`
- `REGRESSION: the ring and the SELECTION are different questions on different slots`
- `carries the ring on WEIGHT as well as colour, as two real widths (palette G3)`
- `clamps a told index through the SAME derivation the selection uses (DN-UI-7a)`
- `re-stating the same focus mutates nothing`
- `REGRESSION: making a slot focusable did not add a listener or a way to move focus`
