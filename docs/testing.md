# 検証とテスト

## 1. 検証ゲート

ゲート構成は各コマンドと設定ファイルが正である。

```console
$ pnpm verify          # typecheck && lint && test。CI の Verify job に対応
$ pnpm test:coverage   # カバレッジ計測 + 100% ゲート。verify には含まれない
$ pnpm package:verify  # build && dist/ の実体検証。verify には含まれない
$ pnpm test:browser    # Playwright。verify には含まれない
```

| ゲート | 何を捕まえるか |
| --- | --- |
| `pnpm typecheck` | `tsconfig.build.json`（出荷ソース）、`tsconfig.test.json`（テスト + ツール）、`tsconfig.preview.json`（`apps/` の dev アプリ）の 3 プロジェクト。**出荷ソースには Node 型が無い** — `types: []` を継承しているので、画面の中で `process.env` を読むと落ちる。プレビューが Node の stdio を使えるのは**別プロジェクト**だからであって、build 側を緩めたからではない（§4） |
| `pnpm lint` | `oxlint --deny-warnings` + `ast-grep scan`。**このリポジトリ唯一の lint / format 設定**。prettier も biome も `.editorconfig` も置かない。oxlint は `--deny-warnings` 付きで走るため `warn` のルールもビルドを落とす。`ast-grep` は依存境界、壁時計直読み禁止、型 assertion 禁止を検査する |
| `pnpm test` | vitest |
| `pnpm test:coverage` | カバレッジ計測 + **100% ゲート**（4 指標すべて）。**`verify` には含まれない**ので別に走らせる（§5） |
| `pnpm test:browser` | Playwright。実ブラウザにしか答えられない 3 種——**実 `Document` への mount / 実測ピクセル / レイアウト**。**`verify` には含まれない**（CI では別 job として Chromium を入れてから走る）。§8 |
| `pnpm build` | `scripts/clean-dist.mjs` で `dist/` を消してから `tsc -p tsconfig.release.json` で emit する。**`verify` には含まれない** |
| `pnpm package:verify` | `pnpm build` の後、packed tarball を別ディレクトリにインストールして `exports` が実際に解決すること（実行時 + 型）を検証する。**`verify` には含まれない** |

**`apps/`（プレビュー）は lint 対象にも `tsconfig.preview.json` にも入っている。**
`pnpm verify` はプレビューを*実行*しないが、型検査・lint・壁時計禁止はすべて適用される。
「dev アプリだから検査しない」にすると、依存を 1 つ足すのに最も抵抗の少ない場所ができてしまう。

Nix の devShell では、Corepack が `package.json` の `packageManager` を参照して `pnpm` のバージョンを解決する（12.14.0）。
oxlint と ast-grep は npm devDependency ではなく `flake.nix` の `pkgs.oxlint` / `pkgs.ast-grep` から供給される。

## 2. 現状の suite

`DN-UI-*` IDs refer to contracts in [design-notes.md](./design-notes.md).

Vitest の対象は `vitest.config.ts` の `include: ['test/**/*.test.ts']` が定める。
実行環境、テストファイル数、テスト件数、使用中の Vitest 版は、固定スナップショットではなく
`package.json`、`vitest.config.ts`、および実行時の `pnpm test` 出力を正とする。

ブラウザ suite（`test-browser/`）は Vitest とは別に `pnpm test:browser` で実行する。
DOM mount、実測ピクセル、レイアウトのように実ブラウザが必要な検証をここに置き、
純粋な導出と属性・変更ログの検証は `test/` に置く。

プレビュー（`apps/`）は検査対象ではなく検査手段であり、そこで見つけた問題は
対応する `test/` の assertion に降ろす。

| ファイル | 守っているもの |
| --- | --- |
| `test/view-model.test.ts` | DN-UI-6（ハーフハート）/ DN-UI-7（クランプ）/ DN-UI-3（字幕）/ **DN-UI-11（パレットの保証）/ DN-UI-12（射影と unknown）** |
| `test/inventory-mirror.test.ts` | **DN-UI-12（mc-sim ミラーの形と、それがバレルに載る理由）** |
| `test/accessibility.test.ts` | DN-UI-1（色覚 / reduced-motion / リマップ）/ DN-UI-4（Escape 単一ハンドラ） |
| `test/stage-registration.test.ts` | DN-UI-8（`after` は制約のみ）/ DN-UI-9（再入可能）/ DN-UI-3 / DN-UI-10 |
| `test/check-dependency-whitelist.test.ts` | 依存境界 / DN-UI-5（kit 不要）/ DN-UI-10 |
| `test/public-api.test.ts` | 公開バレル / アクセシビリティ資産の存在保証 / **kernel 語彙を再公開していないこと** / **DN-UI-4（リスナ API を配らないこと）** |
| `test/dom-surface.test.ts` | **DN-UI-13（構造型が実 DOM の部分集合であること、`domain/` が document に届かないこと）** |
| `test/hud-view.test.ts` | **DN-UI-13（パレット適用 / 冪等性 / reduced-motion / リスナ皆無）/ DN-UI-13i（フォーカスリング）/ DN-UI-6 / DN-UI-7c** |
| `test/screen-views.test.ts` | DN-UI-13 (captions stay text; `unknown` is not empty), DN-UI-1a (attributes stay on canvas), and DN-UI-3; verifies that text and slots from the prior model are cleared |
| `test/palette-css.test.ts` | **DN-UI-11 + DN-UI-13g（全トークンが DOM に届くこと。未参照集合は空になった）** |
| `test/save-indicator.test.ts` | **DN-UI-13h（自動保存インジケータ、状態と表示時間、色以外での区別）/ DN-UI-10 / DN-UI-11b** |
| `test/screen-mount.test.ts` | The parent is passed as an argument (`docs/public-api.md` §4-1); hotbar selection is exclusive |
| `test/modal-flows.test.ts` | DN-UI-4（Escape 単一ハンドラ）をフロー側から。キーは持たない |
| `test/accessibility-gate.test.ts` | **全画面スイープ — フォーカス可能物の国勢調査と、書かれた色がトークンに解決すること** |
| `test/palette-survey.test.ts` | **測定そのものが壊れを検出できること。わざと壊したパレットを `surveyPalette` に渡し、名指しすることと、他のリストは空のままであることを確かめる（§5-3）** |
| `test/main-menu.test.ts` | **メニューの遷移は値であってリスナではない / 押せない control に `role="button"` を付けないこと / セーブ一覧は `unknown` であって空ではない** |
| `test/loading-screen.test.ts` | **DN-UI-10（最低表示時間は引数で来る時刻の算術）/ 不定プログレスバーを描かないこと** |
| `test/crosshair.test.ts` | **照準が自分用の scrim を連れて歩くこと（G1 の中に留まる唯一の方法）/ DN-UI-10（ヒットは継続時間でありタイマーではない）/ reduced-motion で信号を落とさないこと** |
| `test/caption-oracle.test.ts` | **字幕を切ったら出ている字幕も消えること（参照実装の移植が出した欠陥。[dom-oracle-triage.md](./dom-oracle-triage.md) §5）/ 設定は `ui:overlay-sync` が毎フレーム適用すること** |

API は `@effect/vitest` の `it.effect` + `Effect.sync`。

### `environment: 'node'` は既定ではなく判断である

**DOM リポジトリで `node` を選んでいる。** `vitest.config.ts` にそう書いてある。

理由は現状の `domain/` が全て純粋な導出だからで、jsdom を入れると**何も得ずに**毎回数秒が乗る。
現状 409 ms の suite が jsdom で数秒になると、保存するたびに走らせる価値が消える。

This does not conflict with `tsconfig.base.json` declaring `"lib": ["ES2024", "ESNext.Disposable", "DOM", "DOM.Iterable"]`.
The `lib` option makes DOM types available; `environment` determines whether `document` exists at runtime.
`ESNext.Disposable` supplies types referenced by Effect 4 declarations. The DOM types are needed here, while a runtime `document` is not.

## 3. **最重要**: DOM フローのテストは `it.effect` で書かない

**`it.effect` の中で `Effect.fork` + `Deferred.await` を使うとデッドロックする。**
待っている `Deferred` を解決するのが DOM のイベントリスナ = Effect ランタイムの外側だからで、
テストファイバを進める仕事がスケジューラの中に存在しない。

詳細は [design-notes.md](./design-notes.md) DN-UI-2。

### 書き方

**これは書かない:**

```typescript
it.effect('clicking Confirm resolves the dialog', () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.fork(dialog.show('Proceed?', 'Confirm'))
    confirmButton.click()          // DOM listener resolves the Deferred…
    const result = yield* Fiber.join(fiber)   // …but nothing here can run it.
    expect(result).toBe('confirmed')
  }),
)
```

**これを書く:**

```typescript
it('clicking Confirm resolves the dialog', async () => {
  const program = Effect.gen(function* () {
    const fiber = yield* Effect.fork(dialog.show('Proceed?', 'Confirm'))
    yield* Effect.sleep('1 millis')   // let the listeners get installed
    confirmButton.click()
    return yield* Fiber.join(fiber)
  })

  expect(await Effect.runPromise(program)).toBe('confirmed')
})
```

`Effect.runPromise` は Effect の外に出るので、アサーションと DOM イベントの発火を
同じマイクロタスクキューの上で順序づけられる。`Effect.sleep('1 millis')` が入っているのは、
`Effect.acquireRelease` の `acquire`（リスナの設置）がクリックより**後**に走るレースを
参照実装が実際に踏んでいるためである（`confirm-dialog.test.ts:88-92`）。

### Provide a document to DOM tests

`application/` depends on the structural types in `application/dom-surface.ts`, so unit tests use `test/fake-dom.ts` rather than a browser DOM. The fake records mutations, allowing tests to assert that an unchanged render performs no writes. Tests stay in the `node` environment and run in under a second.

The fake implements that structural surface without casts. Its mutation log can prove that a render made no DOM changes, which a real browser cannot report directly.

**DN-UI-2 の書き方は変わらない。** デッドロックは environment ではなく
`it.effect` のファイバ管理の問題である。現状の DOM テストは fiber を fork しないので
到達しないが、`it` + `Effect.runPromise` で書いてある——最初に fork するテストは
これらをコピーして書かれるからである。

**そしてブラウザは依然として必要である。** 偽 document は `var()` を解決せず、
レイアウトを持たず、ピクセルを持たない。§4 の完成条件 3 と 4 が別行なのはそのためである。

## 4. Completion conditions

| # | 条件 | 状態 |
| --- | --- | --- |
| 1 | `pnpm verify` が green | ✅ |
| 2 | 参照実装の DOM テストを mx-ui の oracle として整理 | ⚠️ [dom-oracle-triage.md](./dom-oracle-triage.md) に所有者と未実装画面のケースを記録している。mx-ui が所有する DOM 契約のテストだけを移植する |
| 3 | **各画面のプレビューが単体で起動し操作できる** | ✅（`apps/preview-screens/`、下記） |
| 4 | アクセシビリティ資産をブラウザで確認 | ✅ **ブラウザで測った**（`pnpm test:browser`、§8）。スロット寸法と hotbar 配置の欠陥を見つけ、修正してある |
| 5 | 100% カバレッジゲートが有効 | ✅（`vitest.config.ts` の `thresholds` + CI の `Coverage` ステップ。§5） |

✅ means complete. ⚠️ marks partial work with remaining cases listed.

### Terminal preview

`apps/preview-screens/`。`pnpm preview` で起動、`pnpm preview --screen captions` で字幕画面だけを起動する。

- **各画面が単体で起動する。** 背後にゲームは要らない（`--screen hud | inventory | settings | captions`）。
- This terminal preview has no runtime dependencies and is not exported from the package entry point.
- 状態はモックである（`apps/preview-screens/state.ts`）。
  「リテラルを渡せば HUD が出る」ようにビューモデルが純粋関数であることがこれを可能にしている。

`ui:overlay-sync` が mc-sim の状態を一切読まないのは、この条件のための構造である
（[responsibility.md](./responsibility.md) §1）。

#### Terminal preview and browser harness

`apps/preview-screens/` renders mocked view models and does not verify real DOM layout. The browser harness in `apps/browser-harness/` and `test-browser/` mounts the UI in a real browser and checks pixels and layout. `pnpm verify` typechecks and lints the terminal preview but does not run it.

#### 保証はどこまで証明されたか（正確に）

**証明された**（`environment: 'node'`、ブラウザ不要）:

- **全トークンが DOM に届く。** `test/palette-css.test.ts` が `domain/palette.ts` の
  `Rgb` export を総なめして、`SCRIM_OVER_*`（測定の途中式であってトークンではない）を除く全部が
  カスタムプロパティの出所であることを検査する。値は `cssColor` だけで作られ、
  **アルファも運ばれる**（`SCRIM_ALPHA` を落とすと見た目は正しいまま保証が消える）。
- **どの要素も色リテラルを持たない。** 全部 `var(--mx-ui-*)` 参照である。
- **G3 の非色チャネルが実在する。** ハートは中空 `♡` の上に実体 `♥` を 100/50/0% でクリップするので、
  `['shape']` と `['length']` が属性ではなく**要素として**ある。
  スロット選択は色に加えて枠 2px→3px（`['weight']`）である。
- **色覚属性は canvas にしか付かず、canvas はトークンを 1 つも持たない。**
  だから属性をキーにしたセレクタがトークンに届く経路が存在しない（DN-UI-1a の失敗モード）。
- **guarded トークンは 14 個すべてが要素に届く。** `test/palette-css.test.ts` の掃き出しは
  いま `[]` を assert する。長く残っていた 3 つは 2 つの理由から残っており、
  **どちらの理由も CSS では埋まらず、コンポーネントが要った**:
  - `STATUS_OK` / `STATUS_BUSY` → `application/save-indicator.ts`（DN-UI-13h）。
    **これが居心地の悪かった方**である——`status ok / status alert` は
    **この調査が参照実装で見つけた当の対**（`#d7f7c2` と `#ffd6d2`）であり、
    パレットは値を輝度のはしごで直したのに、**それを表示するコンポーネントが無いので修正が理論のままだった**。
    3 状態はそれぞれ独立した要素（`⟳` / `✔` / `✖` ＋ 3 語）で建つので、区別は色に依存しない。
  - `FOCUS_RING` → `application/slot-element.ts` のリング要素 + `HudView.setKeyboardFocus`（DN-UI-13i）。
    ホットバーが roving `tabindex` の 1 タブストップになった。
    **DOM 面は 1 メンバも広げていない**——`focus()` も `addEventListener` も足していない。

**2 点とも `pnpm test:browser` で検証済みである。** 以下は**何が分かったか**であって、
もう「未証明」の一覧ではない。詳細は §8。

1. **幾何は測った——そして 2 件の欠陥が出た** (`test-browser/geometry.spec.ts`)。 「レイアウトはブラウザが要る」は正しかったが、
   **要るものが無いのと、誰も作っていないのは別である**。ハーネスを書いたら 5 分で答えが出た。
   - **スロットに寸法が無かった。** 390px 幅で `43.3 x 4`、320px で `35.6 x 4`。
     スロットの 2 つの span は mc-sim がアイテムを供給するまで空なので内容ボックスが 0 で、
     4px は全部ボーダーだった。**これは 3 つの主張を同時に壊していた**——
     `weight` distinguisher（2px 対 3px が「枠が太い」ではなく「バーが 1.5 倍」になる）、
     フォーカスリング（`inset: 0` のオーバーレイが絶対配置の包含ブロック = padding box に対して
     解決するので **`386 x 0`**）、そしてこのリポジトリ唯一のタブストップが 4px の的であること。
     → `SLOT_TARGET_MIN_SIZE`（WCAG 2.2 §2.5.8 の 24px）。
   - **ホットバーが 1 列に並んでいなかった。** 9 スロットが**全幅のバーの縦積み**（254px）だった。
     `application/inventory-view.ts` は region ごとに `display: grid` と
     `grid-template-columns` を書いており、**同じ 9 スロットをインベントリ画面では横に並べていた**。
     1 リポジトリに 2 つの答えがあり、見分けられるのはブラウザだけだった。
     → `application/hud-view.ts` が同じグリッドを宣言する。
   - **crosshair の中央は正しかった。** セーフエリアのインセットを入れても viewport 中心に留まる
     （ホストはインセットを padding で持ち、絶対配置の子は padding box に対して解決する）。
     これは**正しい**——照準はカメラの主点を指すのであって、端末のクロームが残した領域の中心ではない。
2. **`var()` は解決した。そして `compositeOver` の前提が実測で裏付けられた** (`test-browser/palette-pixels.spec.ts`)。
   全トークンが宣言どおりのチャンネルに解決し、**アルファも 2 つとも運ばれた**
   （`rgba(10, 14, 18, 0.9)` / `rgba(0, 0, 0, 0.55)`）。
   一番効いたのはこちらである: `domain/palette.ts` は `compositeOver` について
   「in sRGB space, which is where CSS does it. Not gamma-correct, and that is not a bug:
   **the browser is not gamma-correct here either**」と書いていた。
   **これはブラウザを持たないリポジトリがコメントで断言した、他人のプログラムの挙動である。**
   中間グレーの上でスクリムを実測すると `[22, 26, 29]`、sRGB 合成の予測は `[21.8, 25.4, 29]`、
   **線形光合成なら `[43, 44, 46]` だった**。差は 17〜21 単位で、丸めの 1 単位とは桁が違う。
   もしブラウザがガンマ正しかったら、このリポジトリの `worstCaseContrastOnScrim` は
   **全部 2 倍明るい面に対して測っていた**ことになり、`SCRIM_ALPHA` の 0.88 → 0.90 は
   その読みの上で決めた 2 桁である。テストは**両方**を assert する——sRGB 予測に一致すること、
   そして**線形予測に一致しないこと**。後半が無ければ前半は許容誤差の広いだけの偶然になる。

**そして 1 つだけ、ブラウザでも埋まらないものが残っている**（別種なので番号を分ける）:

- **フォーカスは移動を通知してくれる相手がいない。** リング・トークン・タブストップは実在し、
  Tab はネイティブに効く（ストップは 1 つで、リングはそのスロットに描かれるので**構成上一致する**）。
  しかし入力の所有者が `setKeyboardFocus` を呼ぶまで、mx-ui は**キーボードがどこへ行ったか知らない**——
  知るには `addEventListener` が要り、それは意図的に語彙に無い（DN-UI-4 / DN-UI-13c、DN-UI-13i に詳細）。
  **これは mc-render 側の半分**であって、このリポジトリのテストで閉じられるものではない。

**別件として残っているもの:**

- **Recipe matching belongs to mc-sim.** The view projects the supplied `CraftingSnapshot`; when `result` is `undefined`, its view model reports `unknown` rather than inventing a recipe result.
- **保存イベントの producer はまだいない。** `domain/save-status.ts` と `application/save-indicator.ts` は status の変換と表示を実装しているが、
  `SaveStatus` を作って UI に渡すフレーム駆動側は未接続である。
  字幕と違って**刈り取るキューが無い**（値が 1 つで、失効は読み取り時の引き算）ので、
  `ui:overlay-sync` に足す仕事は無く、stage は変えていない。

### Browser checks for accessibility

Unit tests can verify that color-vision and reduced-motion values are produced. Browser tests verify that the rendered screen remains readable and that keyboard interaction works. The terminal preview does not check these browser behaviors (see §8).

## 5. カバレッジ — 100% ゲートは有効である

**閾値は 4 指標すべてに設定してある。** 値は `vitest.config.ts` の `coverage.thresholds` を正とする。

```typescript
// vitest.config.ts
thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
```

実測値とテスト件数は、実行時の `pnpm test:coverage` 出力を正とする。
99% だった当時「producer が保証している」「型システムでは証明できない」という理由で未カバーのまま
残っていた分岐は、100% への引き上げに際して 1 つずつ「テストする」か「到達不能を証明して削除する」の
どちらかで解消した——後者は多くの場合 `noUncheckedIndexedAccess` が要求する `if` ガードを
非 null アサーション 1 個に置き換える形になった（分岐そのものを消す。理由は各サイトのコメントに書いてある）。

`vitest.config.ts` と CI ワークフロー（`Coverage` ステップ）の**両方**で有効にしてある。
閾値は `vitest.config.ts` にしか書かない —— `vitest run --coverage` が自力で非ゼロ終了するので
CI に追加のフラグは要らず、そうしておけば手元と CI が同じ判定をする。
なお `pnpm verify` はカバレッジを含まない。

計測対象は `index.ts` / `domain/**` / `application/**` / `stages/**`（`coverage.include`）で、
テスト・設定ファイル・`.d.ts` は除外している。**除外リストにソースファイルは 1 つも無い。**

### 5-1. mutation で分かった 2 つのこと

新規テストは対象コードを壊して赤を確認した（20 個中 17 個が即死）。生き残った 3 つが有益だった。

**`setMotion` の早期 return を消しても、すべてのテストが成功する。** 同じ設定を 2 度書いても
DOM に何も書かれないという性質は**二重に**成り立っている —— 早期 return がループを飛ばし、
そのうえ `attributeCell` / `styleCell` が値の変わらない書き込みを弾く。
早期 return が節約しているのは**ループそのもの**で、それは fake DOM には原理的に見えない。
テストは残してあるが、コメントを「これは早期 return を固定している」から
「観測できる契約を固定しており、現在それを支えているのはセルの側である」に書き直した。
**テストが何を固定していないかは、固定していることと同じくらい書く価値がある。**

**`applyColorVisionMatrix` の alpha 列と定数オフセット列を消しても、すべてのテストが成功する。**
出荷している 4 つの行列はその 2 列が全部 0 なので、既存のアサーションはすべて 3x3 部分の話だった。
`ColorVisionMatrix` は公開型で「SVG の `feColorMatrix` が要求する順の 4x5」と明記されており、
5 列のうち 2 列を黙って無視する実装は**オフセットを使う最初の行列でブラウザと食い違う**。
2 列を直接駆動するテストを足してある。

### 5-2. 公開型の境界も 100% ゲートで覆う

`application/hud-view.ts` の `view === undefined` は、`hudViewModel` が通常返す 9 個の
hotbar では起きない。しかし `HudViewModel` は公開型で、`render` も公開関数なので、消費側が
短い配列を組み立てて渡す経路は型の上に存在する。

その境界を `test/hud-view.test.ts` の「短い hotbar でも DOM の余剰 slot を壊さない」回帰テストで
実際に検証している。したがって現在の coverage gate はこの経路も含め、branches / functions /
lines / statements の 4 指標すべてを 100% とする。生成器が常に 9 個を返すことだけを根拠に
除外したり、未カバーのまま残したりしない。

### 5-3. `surveyPalette` に引数を足した理由（テストの都合ではない）

`domain/palette.ts` はパレット自身のアクセシビリティ測定を持っており、
`test/accessibility-gate.test.ts` と `test/view-model.test.ts` は
**その 4 つのリストが空であること**を主張している。それは正しい主張で、穴がある ——

```typescript
const surveyPalette = () => ({ tokensBelowFloor: [], collapsedPairs: [], … })
```

これでも**すべてのテストが成功する**。カバレッジがそれを見せた: 報告経路
（`undeclared.push`、ペア名の整形、不透明パネル側の測定）は**一度も実行されていなかった**。
**発火するところを誰も見たことがないガードは、繋がっているかどうか誰も知らないガードである。**

そこで `surveyPalette(palette = THIS_PALETTE)` にして、
`test/palette-survey.test.ts` が**わざと壊したパレット**を渡し、
測定が壊れを**名指しすること**と、**他のリストは空のままであること**の両方を確かめている。
既定値があるので呼び出し側は 1 箇所も変わっておらず、本番の測定対象は今も THIS_PALETTE だけである。

`GuardedToken.on` が 3 つの背景を持ちながらこのパレットの 14 トークンが全部 `scrim` なのは
**死んだコードではなく、まだ使っていない選択肢**である —— 不透明パネルは scrim より易しい別の測定で、
その上に描くトークンはそちらで測るべきものになる。
「まだ誰も使っていない」と「コードが間違っている」はカバレッジレポートの上では見分けが付かないので、
ここに書いてある。

## 6. テストの書き方

- **テスト名は「何を守っているか」を書く。** `works correctly` ではなく
  ``REGRESSION: an odd health total shows a HALF heart rather than rounding it away`` のように、
  落ちたときに何が壊れたかが名前で分かるようにする。
- **Tests for design contracts should cite their source.** Link to [design-notes.md](./design-notes.md) or a relevant source file and line.
- **`REGRESSION:` 接頭辞は「参照実装で実際に起きた／設計注意が明示している失敗」に付ける。**
  そうでないものには付けない。区別が付かなくなると接頭辞の意味が消える。

## 7. Reference tests as oracles

Use [porting.md](./porting.md) §4 for migration order and [dom-oracle-triage.md](./dom-oracle-triage.md) to decide which assertions belong to mx-ui. Port tests only for the DOM contracts this package owns; behavior owned by other packages stays with those packages.

## 8. ブラウザゲート（`pnpm test:browser`）

実 DOM mount、実測ピクセル、レイアウトを検証する。`pnpm verify` には含まれず、CI の browser job で実行する。

```console
$ pnpm test:browser       # playwright test。webServer が pnpm preview:browser を 5182 で立てる
$ pnpm preview:browser    # ハーネスだけを立てて目で見る
```

### Browser harness

Before running these commands, complete the repository setup in [README.md](../README.md), including dependency installation and GitHub Packages authentication.

Run `pnpm preview:browser` and open `http://localhost:5182/` to inspect a screen. The side panel is open by default. Use **Scenario** to select a screen and scenario, and **Gallery** to show the scenarios for the selected screen together. The **Environment** controls set motion, color-vision mode, viewport size, safe area, device-pixel ratio, text scale, contrast, and background. **Timeline** controls virtual time. **State JSON** imports or exports the current harness state.

The **Diagnostics** section shows the intent log, input JSON, view-model JSON, accessibility tree, focus order, and resolved palette tokens with contrast. Layout diagnostics show bounds, overflow, DOM changes, document listeners, and console or page errors. Select **Refresh layout diagnostics** after changing the rendered scenario or layout.

Run the browser accessibility sweep with the default Chromium project:

```console
$ pnpm exec playwright test test-browser/accessibility.spec.ts
```

The sweep checks roles, accessible names, and applicable states for registered UI scenarios. It also checks keyboard behavior, the selected hotbar radio state, and focus order between the UI and debug panel. The full browser gate runs this spec as part of `pnpm test:browser`.

`playwright.environment.config.ts` runs `test-browser/environment.spec.ts` in four projects: desktop Chromium, Firefox, WebKit, and Chromium with a 390 by 844 touch-enabled mobile viewport. Each project checks registered scenarios for rendered content and browser errors; the mobile project also checks horizontal overflow. Install the required browser binaries, then run the environment suite:

```console
$ pnpm exec playwright install chromium firefox webkit
$ pnpm exec playwright test --config=playwright.environment.config.ts
```

ブラウザテストを並列レーンで実行する場合は、レーンごとに異なる`HARNESS_PORT`と`PLAYWRIGHT_OUTPUT_DIR`を指定します。未指定時はポート`5182`と`test-results/`を使います。たとえば、`nix develop --command env HARNESS_PORT=5193 PLAYWRIGHT_OUTPUT_DIR=.artifacts/lane-2 pnpm test:browser`で別の出力先へ実行できます。

| ファイル | 何を測るか |
| --- | --- |
| `test-browser/dom-surface.spec.ts` | 実 `Document` への mount、木の構築、listener 境界、palette custom property の配置 |
| `test-browser/furnace-view.spec.ts` | Furnace view を実 DOM に描画したときの表示 |
| `test-browser/palette-pixels.spec.ts` | トークンの CSS 解決、alpha、sRGB 合成、palette survey の下限 |
| `test-browser/geometry.spec.ts` | viewport のレイアウト、focus ring、bar weight、reduced-motion、safe area、crosshair 配置 |
| `test-browser/accessibility.spec.ts` | 登録済み UI シナリオの role、accessible name、状態、キーボード操作と focus order |
| `test-browser/environment.spec.ts` | browser projects ごとの描画、browser errors、mobile viewport の横 overflow |

### 8-1. なぜ `verify` に入れないか

`pnpm verify` は CI の Verify job に対応するが、CI 全体とは異なる。Browser job は別にあり、そこで Chromium を install して suite を実行する。
入れると、このリポジトリの看板ゲートが 180MB のダウンロードと動く Chromium に依存し、
**「`playwright install` を走らせていない」という平凡な失敗が、コードについて何も言わない赤いビルドになる。**

**ただし「実行しない」と「検査しない」は別である。**
`test-browser/` は `SCAN_ROOTS` にも lint 対象にも `tsconfig.test.json` にも入っている——
`apps/` について §1 が言っているのと同じ理由で、
**CI が走らせない唯一の suite が、何も検査しない唯一の suite でもある**のは
依存を 1 つ足すのに最も抵抗の少ない場所を 2 重に作ることだからである。

### 8-2. ハーネスは実 `Document` を**キャスト無しで**受け取った

`apps/browser-harness/main.ts` の 1 行がこのゲート全体の理由である:

```typescript
const factory: DomElementFactory = document
```

`test/fixtures/dom-surface.ts` が `lib.dom.d.ts` に対して証明していた
「構造型は実 DOM の部分集合である」が、**型ではなく実行で回収された**。
ブラウザハーネスは実 DOM を構造型として受け取り、キャストなしで画面を mount する。

**1 つだけコンパイルしなかったものがあり、それは欠陥ではなく制約である。**
`const page: DomElement = document.createElement('div')` と書いてから
`document.body.appendChild(page)` を呼ぶと落ちる（`TS2345`: `DomElement` は `Node` ではない）。
`Node.appendChild` は `<T extends Node>` のジェネリックなので、
`application/dom-surface.ts` の COST 1 が論じる双変性が**そもそも出番を持たない**。
部分集合であるのは**片方向だけ**であり、それは
`docs/public-api.md` §4-1 の想定 mount 面が `mount: (root: HTMLElement) => …` と
**実要素**を取ることと一致している。ホストは実 DOM でルートを作って実 DOM で append し、
そのあと mx-ui に渡す。mx-ui は以後すべて構造型の面から append し、要素を返さない。
全文は `apps/browser-harness/main.ts` の該当コメントにある。

### 8-3. The harness does not style inside mx-ui

The selectors in `apps/browser-harness/index.html` stop at `[data-harness-host]`. If the harness set a slot width, the browser would measure the harness rule rather than mx-ui's layout. Keeping UI styles out of the harness makes the measured dimensions attributable to mx-ui.

### 8-4. Event listeners stay outside mx-ui views

The structural UI surface has no `addEventListener` method; the host application owns input handling at the host boundary. The browser contract test checks UI roots for inline `on*` attributes. It also adds a positive-control listener to the page shell, outside the UI root, to show that the test can observe one. The test does not inspect the browser's event-listener registry; that is available only through DevTools. Unit tests use the fake document to record listener additions.

### 8-5. カバレッジの責任範囲

ブラウザ suite は vitest の coverage 計測には含めないが、`coverage.include` に含まれる
`domain/`、`application/`、`stages/` のソースは 4 指標すべて 100% を要求する。
`exclude` にソースファイルを追加して閾値を満たすことはしない。ブラウザでしか検証できない
実ピクセルや実レイアウトの契約は §8 の browser suite が担い、偽 DOM で検証できる実装経路は
§5 の vitest coverage gate が担う。
