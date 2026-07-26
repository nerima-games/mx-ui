# 設計ノート（DN-UI-1 〜 DN-UI-10）

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

### DN-UI-7c 空スロットは全フィールドが空である

`empty` ガードは `itemId` と `countLabel` を消していたが `durabilityPercent` を消していなかった
（当時の F1）。「フィールドがあれば描く」と書いた DOM 層——**それが自然な書き方である**——は、
空スロットの下に耐久バーを描く。プレイ中に到達する: **道具が壊れると `count: 0` と耐久度が残る**。

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
`oxlint.json` の冒頭にこの実測メモがあり、oxlint が該当ルールを実装したら移す、と書いてある。

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
