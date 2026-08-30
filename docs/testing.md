# 検証とテスト

出典: plan.md §3.13（検証: 「DOMテスト + 状態モック付きプレビュー(各画面を単体起動して操作)」）、§6 Step 2、§8。

## 1. 検証ゲート

組織のツールチェーン凍結（Wave 0）で、ゲート構成が以下の形に揃った。

```console
$ pnpm verify          # typecheck && lint && test。CI と同じ内容
$ pnpm test:coverage   # カバレッジ計測 + 100% ゲート。verify には含まれない
$ pnpm package:verify  # build && dist/ の実体検証。verify には含まれない
$ pnpm test:browser    # Playwright。verify には含まれない
```

| ゲート | 何を捕まえるか |
| --- | --- |
| `pnpm typecheck` | `tsconfig.build.json`（出荷ソース）、`tsconfig.test.json`（テスト + ツール）、`tsconfig.preview.json`（`apps/` の dev アプリ）の 3 プロジェクト。**出荷ソースには Node 型が無い** — `types: []` を継承しているので、画面の中で `process.env` を読むと落ちる。プレビューが Node の stdio を使えるのは**別プロジェクト**だからであって、build 側を緩めたからではない（§4） |
| `pnpm lint` | `oxlint --deny-warnings` + `ast-grep scan`。**このリポジトリ唯一の lint / format 設定**。prettier も biome も `.editorconfig` も置かない。oxlint は `--deny-warnings` 付きで走るため `warn` のルールもビルドを落とす。`ast-grep` は `no-restricted-imports`（依存境界、Tier3）と `no-wall-clock-read`（壁時計の直読み禁止）を見る。`no-type-assertion` は Wave 0 時点では `warning` — 既存ヒットは Wave 3 で `as` を外して `error` に上げる |
| `pnpm test` | vitest |
| `pnpm test:coverage` | カバレッジ計測 + **100% ゲート**（4 指標すべて）。**`verify` には含まれない**ので別に走らせる（§5） |
| `pnpm test:browser` | Playwright。実ブラウザにしか答えられない 3 種——**実 `Document` への mount / 実測ピクセル / レイアウト**。**`verify` には含まれない**（CI では別 job として Chromium を入れてから走る）。§8 |
| `pnpm build` | `scripts/clean-dist.mjs` で `dist/` を消してから `tsc -p tsconfig.release.json` で emit する。**`verify` には含まれない** |
| `pnpm package:verify` | `pnpm build` の後、packed tarball を別ディレクトリにインストールして `exports` が実際に解決すること（実行時 + 型）を検証する。**`verify` には含まれない** |

**`apps/`（プレビュー）は lint 対象にも `tsconfig.preview.json` にも入っている。**
`pnpm verify` はプレビューを*実行*しないが、型検査・lint・壁時計禁止はすべて適用される。
「dev アプリだから検査しない」にすると、依存を 1 つ足すのに最も抵抗の少ない場所ができてしまう。

`pnpm` は Nix の devShell が `packageManager`（`package.json`）のバージョンで解決する（11.24.0）。
oxlint と ast-grep は npm devDependency ではなく `flake.nix` の `pkgs.oxlint` / `pkgs.ast-grep` から供給される。

壁時計の直読み禁止が oxlint ではなく `ast-grep` の仕事なのは、oxlint が該当ルール
（`no-restricted-syntax` 等）を実装していないためで、経緯は `.ast-grep/rules/no-wall-clock-read.yml`
と DN-UI-10 にある。

## 2. 現状の suite（2026-07-27 実測）

```
vitest 3.2.7
 ✓ test/public-api.test.ts                 (8 tests)
 ✓ test/stage-registration.test.ts         (15 tests)
 ✓ test/accessibility.test.ts              (17 tests)
 ✓ test/view-model.test.ts                 (49 tests)
 ✓ test/inventory-mirror.test.ts           (6 tests)
 ✓ test/check-dependency-whitelist.test.ts (21 tests)
 ✓ test/api-lock.test.ts                   (26 tests)
 ✓ test/dom-surface.test.ts                (4 tests)
 ✓ test/hud-view.test.ts                   (21 tests)
 ✓ test/screen-views.test.ts               (10 tests)
 ✓ test/palette-css.test.ts                (6 tests)
 ✓ test/save-indicator.test.ts             (15 tests)
 ✓ test/screen-mount.test.ts               (13 tests)
 ✓ test/modal-flows.test.ts                (6 tests)
 ✓ test/accessibility-gate.test.ts         (12 tests)
 ✓ test/main-menu.test.ts                  (20 tests)
 ✓ test/loading-screen.test.ts             (22 tests)
 ✓ test/crosshair.test.ts                  (16 tests)
 ✓ test/caption-oracle.test.ts             (7 tests)

 Test Files  20 passed (20)
      Tests  314 passed (314)
```

後半 11 ファイルが `application/`（DOM 層）のぶんである。**環境は `node` のまま**で、
jsdom も `@vitest-environment` プラグマも入っていない（§3）。

> **2026-07-28 追記 4。この数は動いていない。** ブラウザゲート（§8、18 本）が入ったが、
> **それは vitest の下では走らない別 suite** であり、`test/` には 1 本も足していない。
> 足すべきでもなかった —— §3 の「C が A/B より優れているのは速度ではなく、
> **答えられる問いの種類**である」がそのまま逆向きに効く。
> ブラウザに持っていく価値があるのは偽 document が原理的に答えられない問いだけで、
> 属性・変更ログ・純関数の射影は今も `test/` のほうが速く厳密に答える。
> **ブラウザで見つけた欠陥 2 件の修正も、`test/` の本数を 1 本も増やしていない**
> （どちらも mount 時の幾何であり、偽 document には見えない。§8-5 の変異 1 と 2）。

`save-indicator.test.ts` は**新しい 2 コンポーネントのうち 1 つ**のためのファイルで、
純粋な時間設計（`domain/save-status.ts`）と要素（`application/save-indicator.ts`）の両方を持つ。
1 ファイルに置いているのは、そのコンポーネントの主張——**参照実装が潰していた 2 状態を色以外で区別する**——が
2 層にまたがって初めて成立するからである。もう 1 つ（フォーカスリング）は
`hud-view.test.ts` に describe を 1 つ増やしている（DN-UI-13i）。

`view-model.test.ts` が 20 → 35 に増えたのはプレビューの finding 4 件と gap 2 件を
assertion として降ろしたぶんで、35 → 49 に増えたのは**その gap 2 件を埋めたぶん**である。
**「無い」ことを assert していた 2 本は消え、「何を保証するか」を assert する 14 本になった**（§4）。
`inventory-mirror.test.ts` は mc-sim のミラーを pin する新ファイルで、
`mx-gameplay/test/chunk-store-mirror.test.ts` と同じ役割である（DN-UI-12）。

**プレビュー（`apps/`）にテストは無い。** 意図的である——プレビューは検査対象ではなく検査**手段**であり、
そこで見つかったことは `test/view-model.test.ts` に assertion として降ろすのが正しい置き場所である（§4）。

**この数字はスケルトンが育つたびに動く。** 権威は `pnpm verify` の出力であって本節ではない。
本節が古くなっていたら、それは suite が増えたということである。

> **2026-07-27 追記。** 上の一覧は実際に 3 ファイル分古かった
> （`screen-mount` / `modal-flows` / `accessibility-gate` は `docs/e2e-triage.md` の
> 移植で入ったが、ここには反映されていなかった）。その 3 つと、
> メインメニュー / ローディング画面 / crosshair の 3 つを合わせて 198 → 283 になっている。
> **手で書いた数字が本文から導出されていない限りまた壊れる**という
> `docs/e2e-triage.md` §2.1 の欄外注は、この節にもそのまま当てはまる。

> **2026-07-27 追記 2。** 283 → 294 は
> [dom-oracle-triage.md](./dom-oracle-triage.md) の移植 11 本ぶんである
> （`caption-oracle` 7 本 + `loading-screen` に 4 本追記）。
> **そして上の一覧はまたしても 1 件ずれていた** — `accessibility-gate` は
> 11 ではなく 12 だった。前回の欄外注が書いたとおりのことが、
> その欄外注を書いた次の版で起きている。

> **2026-07-27 追記 3。** 294 → 314 は 99% カバレッジゲートを入れたぶんである（§5）。
> 新ファイルは `palette-survey.test.ts`（10 本）1 つで、残りは
> `screen-views` +5 / `view-model` +4 / `caption-oracle` 系 0 の内訳になる。
> **20 本のうち「数字のため」に書いたものは 1 本も無い** —— 未到達だった 27 分岐のうち
> 12 本だけがテストを必要としており、残りは削除か、理由を書いて残すかだった。表は §5-0 にある。

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
| `test/screen-views.test.ts` | **DN-UI-13（字幕はテキスト / `unknown` は空ではない）/ DN-UI-1a（属性は canvas だけ）/ DN-UI-3。前のモデルの表示が残らないこと（余った枠・消えた領域・carried）もここ（§5-0）** |
| `test/palette-css.test.ts` | **DN-UI-11 + DN-UI-13g（全トークンが DOM に届くこと。未参照集合は空になった）** |
| `test/save-indicator.test.ts` | **DN-UI-13h（自動保存インジケータ、状態と表示時間、色以外での区別）/ DN-UI-10 / DN-UI-11b** |
| `test/screen-mount.test.ts` | 親は**引数**であること（`docs/public-api.md` §4-1）/ ホットバー選択の ONLY 性 |
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

`tsconfig.base.json` が `"lib": ["ES2024", "DOM"]` を宣言していることと矛盾しない。
lib は「DOM の型を書いてよい」であり、`environment` は「実行時に document があるか」である。
現状は前者だけが必要で、後者はまだ必要ない。

## 3. **最重要**: DOM フローのテストは `it.effect` で書かない

**`it.effect` の中で `Effect.fork` + `Deferred.await` を使うとデッドロックする。**
待っている `Deferred` を解決するのが DOM のイベントリスナ = Effect ランタイムの外側だからで、
テストファイバを進める仕事がスケジューラの中に存在しない。

根拠は plan.md §3.13 と、参照実装の 3 か所（`docs/codex-implementation-prompt.md:161`、
`packages/presentation/menu/confirm-dialog.test.ts:88-97` および `:128-132`）。
全文は [design-notes.md](./design-notes.md) DN-UI-2。

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

### document をどうやって与えるか — 決着（A でも B でもない）

2 案を挙げて保留していた。**どちらも採らなかった。**

| 案 | 内容 | 採否 |
| --- | --- | --- |
| A | DOM を要るファイルの先頭に `// @vitest-environment jsdom` プラグマ | 不採用 |
| B | vitest の project を 2 つに分ける（`node` / `jsdom`） | 不採用 |
| **C** | **`test/fake-dom.ts` — 構造型を実装した 90 行の偽 document** | **採用** |

`application/` は `HTMLElement` ではなく `application/dom-surface.ts` の**構造型**に対して書かれている。
だから偽 document は**キャスト無しで**それを満たせる（`test/dom-surface.test.ts`）。
environment は `node` のままで、suite は 1 秒を切ったままである。

**C が A/B より優れているのは速度ではなく、答えられる問いの種類である。**
「変更の無い再描画が DOM を 1 回も触らないこと」は jsdom では観測できない——
*何も起きなかったこと*を報告する API が無いからである。偽 document は変更ログを持つので、
`expect(factory.since(mark)).toStrictEqual([])` が書ける。これは §5.2 の主張そのものである。

**DN-UI-2 の書き方は変わらない。** デッドロックは environment ではなく
`it.effect` のファイバ管理の問題である。現状の DOM テストは fiber を fork しないので
到達しないが、`it` + `Effect.runPromise` で書いてある——最初に fork するテストは
これらをコピーして書かれるからである。

**そしてブラウザは依然として必要である。** 偽 document は `var()` を解決せず、
レイアウトを持たず、ピクセルを持たない。§4 の完成条件 3 と 4 が別行なのはそのためである。

## 4. 完成条件

plan.md §6 Step 2 の共通条件:

> 各リポジトリの完了条件: ユニット/シナリオテスト green + 内蔵プレビューが操作可能

mx-ui にとってのプレビューは plan.md §3.13 の

> 状態モック付きプレビュー(各画面を単体起動して操作)

| # | 条件 | 状態 |
| --- | --- | --- |
| 1 | `pnpm verify` が green | ✅ |
| 2 | 参照実装の DOM テスト資産（63 ファイル / 10,862 LOC、`input/` 除く）をオラクルとして移植 | ⚠️ **63 ファイル全部を triage 済み**（[dom-oracle-triage.md](./dom-oracle-triage.md)）。**移植すべきは 63 ファイルではない** — 25 ファイル / 203 本（45%）は所有者が別か、mx-ui が構造的に別の答えを出している。今日書けるのは 8 ファイル / 71 本で、うち 5 ファイル分は既存オラクルが持っている。**未着手は NEEDS-SCREEN の 29 ファイル / 176 本**で、これは画面の残作業そのものである |
| 3 | **各画面のプレビューが単体で起動し操作できる** | ✅（`apps/preview-screens/`、下記） |
| 4 | アクセシビリティ資産 4 つが目視で確認済み | ✅ **ブラウザで測った**（`pnpm test:browser` の 18 本、§8）。残っていた 2 点は「ブラウザにしか答えられない」で正しかったが、**それは誰も作っていないというだけだった**。測ったら**欠陥が 2 件出た**（スロットに寸法が無い / ホットバーが 1 列に並ばない）——両方とも直してある |
| 5 | 100% カバレッジゲートが有効（組織のツールチェーン凍結、Wave 0） | ✅（`vitest.config.ts` の `thresholds` + CI の `Coverage` ステップ。実測 100 / 100 / 100 / 100、§5） |

### プレビューの条件（満たしている）

`apps/preview-screens/`。`pnpm preview` で起動、`pnpm preview --screen captions` で字幕画面だけを起動する。

- **各画面が単体で起動する。** 背後にゲームは要らない（`--screen hud | inventory | settings | captions`）。
- **mc-playground-kit を使っていない**（DN-UI-5、plan.md §3.13:「kit 不要」）。依存は 0 個である。
- 置き場は `apps/preview-screens/`（plan.md §4.1）。`index.ts` から export されず、`pnpm verify` は実行しない。
- 状態はモックである（`apps/preview-screens/state.ts`）。
  「リテラルを渡せば HUD が出る」ようにビューモデルが純粋関数であることがこれを可能にしている。

`ui:overlay-sync` が mc-sim の状態を一切読まないのは、この条件のための構造である
（[responsibility.md](./responsibility.md) §1）。

#### なぜ端末レンダラなのか（DOM プレビューではなく）

mx-ui は 16 リポジトリ中で唯一 `lib` に "DOM" を持つ。だからブラウザプレビューが自明に見えるが、
**今日の時点では違う**。理由は 4 つあり、詳細は `apps/preview-screens/main.ts` の冒頭にある。要約:

1. **プレビューすべき DOM コードが無い。** `domain/` に `document` は 1 度も現れない。
   ブラウザプレビューはまず DOM 層を書くことを要求し、それを `apps/` に書けば
   出荷されないコードのプレビューになる。
2. **検証対象のビューモデルは純粋関数である。** 端末レンダラはその**もう 1 つの独立した射影**であり、
   モデルについて分かったことはブラウザにそのまま移る。
3. ブラウザプレビューはバンドラとブラウザを要求し、対価は**どのビューモデルも主張していない**レイアウト忠実度である。
   `--once --ascii` の出力は pipe でき diff でき issue に貼れる。
4. **アクセシビリティは端末のほうが測れる。** コントラスト比も色覚シミュレーションも RGB 上の算術であり、
   `--stats` が「どのモードでどの色対が潰れるか」の表を出す。

**失うものは実在する**: レイアウト崩れ、重なり、フォーカスリング、スクリーンリーダーの読み上げ。
どれも DOM の問いであり、最初の画面が書かれたときブラウザプレビューは**これの代わりではなく隣に**置く。

**既存の保証は弱めていない。** `tsconfig.build.json` は `types: []` を継承し続けており、
プレビューは専用の `tsconfig.preview.json`（`types: ["node"]`）で型検査する。
「画面の中で `process.env` を読むと落ちる」は以前と同じ範囲でそのまま成立している。

#### プレビューが実際に何を見つけたか

`pnpm preview --stats` は数値レポートを出す。レポートは 2 つのリストを持つ。

- **finding** — **実行時の測定**であり、記録された期待値は 1 つも無い。直せば自動的に消える。
- **gap** — **無いもの**。走らせて測れないので、消えたことを検出できるのはピン留めしたテストだけである。

**この区別が要るのは、finding を直しても件数が減らないレポートは読まれなくなるからである。**

初回実行の finding は 4 件で、**4 件とも直して `test/view-model.test.ts` の assertion にした**。
現在の finding は 0 件である。全文は
[`apps/preview-screens/README.md`](../apps/preview-screens/README.md) にある。要約:

- **空スロットが `durabilityPercent` を報告し続けていた（F1）。** `empty` ガードが `itemId` と
  `countLabel` は消すのに `durabilityPercent` は消していなかった。「フィールドがあれば描く」と書いた
  DOM 層は空スロットの下に耐久バーを描く。道具が壊れた直後に到達する。→ DN-UI-7c
- **NaN 体力が「空のハート列 + `dead: false`」になっていた（F2/F3）。** `clamp` が
  `Math.min`/`Math.max` なので NaN を素通しし、列は「体力ゼロ」と言い、フラグは「生存」と言っていた。
  同じ穴が `selectedHotbarIndex`・`count`・`experienceLevel` にもあり、
  `maxHealthPoints: Infinity` に至っては **`RangeError` を投げていた**——
  DN-UI-7 が唯一許していない結果である。→ DN-UI-7a / DN-UI-7b
- **XP バーが 1 レベル早く 100% になっていた（F4）。** `Math.round(0.999)` が `1`。→ DN-UI-7d

**4 件とも既存の 20 本のビューモデルテストが捕まえていなかった。**
どれも「境界を越えて来る値」に関するもので、テストは妥当な入力を渡すからである。
**プレビューが値の妥当さを仮定しないのは、それが検査手段の仕事だからである。**

**gap は 2 件から 1 件になり、その 1 件は前より狭い。**
「無い」ことを assert していた describe
`gaps the preview found that are recorded rather than filled` は消えた。
埋まった以上、そこにあるべきなのは**何を保証するか**の assertion である。

#### 埋めた 2 件

- **旧 G1: mx-ui が色を 1 つも定義していない → `domain/palette.ts`。**
  トークンは参照実装から掘った（各定数に `<reference-impl>/path:line`）。
  ただし取ってから測り、**2 つは動かした**——`HEART` は最悪世界ピクセル上で 2.61:1 しか無く
  アイコンの下限 3:1 に届かず、`ICON_EMPTY` は 1.10:1 で明るい地面の上では見えない。
  **そして調査は実際の欠陥を 1 つ見つけた**: 参照実装の自動保存インジケータは
  成功 `#d7f7c2`（`index.html:159`）と**失敗** `#ffd6d2`（`:212`）が
  protanopia で 12、deuteranopia で 22 しか離れておらず（閾値 24）、
  赤緑色覚特性のプレイヤーは**保存の成否を区別できない**。
  参照実装の e2e ゲートは構造上これを見られない（テキストノードを自分の背景とだけ比べるので、
  ある状態と別の状態を比べない）。詳細と保証の定義は DN-UI-11。
- **旧 G2: インベントリ／クラフトにビューモデルが無い → `domain/inventory-view-model.ts`。**
  保留の論（mc-sim の形が publish されていない）は正しいが**この事例に固有ではなく**、
  組織の全ミラーの論である——そして `VitalsSnapshot` は最初のカットから同じことをしている。
  さらに mc-sim の形は「未知」ではなく「未 publish」で、
  `mc-sim/domain/inventory.ts` と mc-sim 自身の `api-lock.md` に載っている。
  ミラーは provisional と明記し、`test/inventory-mirror.test.ts` が双方向で pin する。詳細は DN-UI-12。

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

**2 点とも証明された（2026-07-28、`pnpm test:browser`）。** 以下は**何が分かったか**であって、
もう「未証明」の一覧ではない。詳細は §8。

1. **幾何は測った——そして 2 件の欠陥が出た。** 「レイアウトはブラウザが要る」は正しかったが、
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
2. **`var()` は解決した。そして `compositeOver` の前提が実測で裏付けられた。**
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
   出荷側の面倒は [versioning.md](./versioning.md) §4（`files` / `exports` / tsc だけでは足りないビルド）。

**そして 1 つだけ、ブラウザでも埋まらないものが残っている**（別種なので番号を分ける）:

- **フォーカスは移動を通知してくれる相手がいない。** リング・トークン・タブストップは実在し、
  Tab はネイティブに効く（ストップは 1 つで、リングはそのスロットに描かれるので**構成上一致する**）。
  しかし入力の所有者が `setKeyboardFocus` を呼ぶまで、mx-ui は**キーボードがどこへ行ったか知らない**——
  知るには `addEventListener` が要り、それは意図的に語彙に無い（DN-UI-4 / DN-UI-13c、DN-UI-13i に詳細）。
  **これは mc-render 側の半分**であって、このリポジトリのテストで閉じられるものではない。

**別件として残っているもの:**

- **mc-sim にレシピモデルが無い。** クラフト**画面**はあり、渡されたものを射影する。
  しかし「このグリッドは何か作るか」に射影すべき答えが無い（mc-sim の `api-lock.md` に `Recipe` が無い）。
  だから `CraftingSnapshot.result` は実際 `undefined` で、ビューモデルは `unknown` を返す。
  **それは正しい挙動であって仮置きではない**が、mc-sim がレシピを所有するまで
  本物のクラフト結果は出せない。レシピ照合は plan.md §2.3-1 で mc-sim のものであり、
  ここで発明することがこのリポジトリのしてはならないことである。
- **保存イベントを供給する相手もまだいない。** `domain/save-status.ts` は `SaveStatus` を受け取る形で、
  それを作るのは「フレームを駆動する誰か」である——`VitalsSnapshot` が最初のカットからそうであるのと同じ位置である。
  字幕と違って**刈り取るキューが無い**（値が 1 つで、失効は読み取り時の引き算）ので、
  `ui:overlay-sync` に足す仕事は無く、stage は変えていない。

### アクセシビリティ検証はユニットテストでは閉じない

**色覚モードと reduced-motion は「見なければ」検証できない。**

- `colorVisionAttribute('deuteranopia') === 'deuteranopia'` はテストできる。
  **その属性が付いた画面が実際に読めるか**はテストできない。
  DN-UI-1a の失敗モード（文書全体に掛けて UI クロームのコントラストを壊す）は、
  値としては正しいまま起こる。
- `animationDurationMs(400, 'reduced') === 0` はテストできる。
  **duration をどこかで 1 か所忘れていないか**はテストできない。

だから完成条件 3 と 4 は別行になっている。**プレビューがこの検証の場所である。**
参照実装も同じ結論に達しており、`confirm-dialog.test.ts:96-97` が
「Production behavior (click → resolve, Enter/Esc, focus) was manually verified via Playwright MCP」と記録している。

> **2026-07-28 追記。** 上の 2 つの例は今も正しいが、「見なければ」の**見る側が自動化された**。
> 「その属性が付いた画面が実際に読めるか」は依然として人間の問いだが、
> **「ブラウザが実際にその色を描いたか」は機械の問い**であり、§8 がそれを測っている。
> 参照実装の `Playwright MCP で手で確かめた` という記録は、
> **手で確かめたことを次の人が確かめ直せない**という意味でもある。

## 5. カバレッジ — 100% ゲートは有効である

**閾値は 4 指標すべてに設定してある。** 組織のツールチェーン凍結（Wave 0）で 99% → 100% に上げた。

```typescript
// vitest.config.ts
thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
```

実測は **statements 100 / branch 100 / functions 100 / lines 100**（394 テスト）。
99% だった当時「producer が保証している」「型システムでは証明できない」という理由で未カバーのまま
残っていた分岐は、100% への引き上げに際して 1 つずつ「テストする」か「到達不能を証明して削除する」の
どちらかで解消した——後者は多くの場合 `noUncheckedIndexedAccess` が要求する `if` ガードを
非 null アサーション 1 個に置き換える形になった（分岐そのものを消す。理由は各サイトのコメントに書いてある）。

`domain/` はビューモデル、字幕キュー、モーダルスタック、そしてパレット自身のアクセシビリティ測定を持ち、
`application/` はこのリポジトリが定義した DOM 界面の上に 7 つのレンダラを持つ。

`vitest.config.ts` と CI ワークフロー（`Coverage` ステップ）の**両方**で有効にしてある。
閾値は `vitest.config.ts` にしか書かない —— `vitest run --coverage` が自力で非ゼロ終了するので
CI に追加のフラグは要らず、そうしておけば手元と CI が同じ判定をする。
なお `pnpm verify` はカバレッジを含まない。

計測対象は `index.ts` / `domain/**` / `application/**` / `stages/**`（`coverage.include`）で、
テスト・設定ファイル・`.d.ts` は除外している。**除外リストにソースファイルは 1 つも無い。**

### 5-0. 有効化のためにやったこと（テストは 20 本、しかし本題はコードの側にある）

branch は **93.57%** で、未到達は 27 本だった。**そのうちテストを書くべきものは 12 本しか無かった。**

| 分岐 | 判定 | 対応 |
| --- | --- | --- |
| `matrix[base + n] ?? 0` × 5（`accessibility.ts`） | 型が排除済み。`ColorVisionMatrix` は 20 要素のタプルで、添字は 0/1/2 しか来ない | タプルを分解代入して**削除**（行構造が読めるようにもなった） |
| `line/icon/slot === undefined` × 5（各レンダラ） | 自分自身の長さで回すループの添字読み。到達不能 | `for (const [i, x] of xs.entries())` にして**削除**。別配列を引く側の検査は**残した**（そちらは本物） |
| `panels.find(...) ?? root`（`main-menu-view.ts`） | コメント自身が「これは外れない」と書いていた | 閉じた union の `Record` にして**削除**。外れないことを**型が**言うようになった |
| `left/right === undefined`（全ペア掃引） | 同上 | `entries()` + `slice()` で**削除** |
| `surfaceOf` の `: SCRIM` | 呼び出し元が既に scrim を除外している | 引数を `Exclude<…, 'scrim'>` にして**削除** |
| 字幕の `setMotion` 早期 return | 到達可能 | テスト（ただし下記 5-1） |
| 余った枠を隠す／消えた領域を隠す／carried／crafting match | **本物の抜け**。どれも「前のモデルの表示が残る」失敗 | `test/screen-views.test.ts` |
| 装備欄・オフハンドを mc-sim が**供給した**場合 | **本物の抜け**。全テストが `undefined` 側しか駆動していない | `test/view-model.test.ts` |
| `hex` / `compositeOver` の NaN アーム | **本物の抜け**。CSS には失敗チャンネルが無い | `test/view-model.test.ts` |
| `mergeable === true` | **本物の抜け**。「描かない」と「描けない」が区別できていなかった | `test/screen-views.test.ts` |
| パレット測定の**報告経路**（7 本） | 到達可能だが、パレットが正しい限り走らない | `surveyPalette` に引数を足し、**壊したパレットを渡すテスト**を新設（5-2） |
| `hud-view.ts` の短いホットバー | 到達不能（5-2） | 呼び出し地点に理由を書いて残す |

**数字のためのテストは 1 本も書いていない。** `exclude` リストも広げていない。

### 5-1. mutation で分かった 2 つのこと

新規テストは対象コードを壊して赤を確認した（20 個中 17 個が即死）。生き残った 3 つが有益だった。

**`setMotion` の早期 return を消しても全テストが緑のまま通る。** 同じ設定を 2 度書いても
DOM に何も書かれないという性質は**二重に**成り立っている —— 早期 return がループを飛ばし、
そのうえ `attributeCell` / `styleCell` が値の変わらない書き込みを弾く。
早期 return が節約しているのは**ループそのもの**で、それは fake DOM には原理的に見えない。
テストは残してあるが、コメントを「これは早期 return を固定している」から
「観測できる契約を固定しており、現在それを支えているのはセルの側である」に書き直した。
**テストが何を固定していないかは、固定していることと同じくらい書く価値がある。**

**`applyColorVisionMatrix` の alpha 列と定数オフセット列を消しても全テストが緑のまま通る。**
出荷している 4 つの行列はその 2 列が全部 0 なので、既存のアサーションはすべて 3x3 部分の話だった。
`ColorVisionMatrix` は公開型で「SVG の `feColorMatrix` が要求する順の 4x5」と明記されており、
5 列のうち 2 列を黙って無視する実装は**オフセットを使う最初の行列でブラウザと食い違う**。
2 列を直接駆動するテストを足してある。

### 5-2. 覆っていない 1 本と、その理由（0.24%）

`application/hud-view.ts` の `view === undefined`。
`hudViewModel` は `Array.from({ length: HOTBAR_SLOT_COUNT })` でホットバーを作るので、
このリポジトリの中では常に 9 個であり到達しない。
それでも消さないのは、**`HudViewModel` が公開型で `render` が公開関数**だからである ——
型は `ReadonlyArray<SlotView>` としか言っておらず、9 とは言っていない。
公開ビューモデルとは**消費側が自分で組み立てるためのもの**なので、短いものが来る経路は型の上に存在する。

覆うには唯一の生成器を迂回してモデルを手で組むことになり、
それは次の読み手に「生成器が短い配列を返しうる」と教える。理由は呼び出し地点に書いてある。

### 5-3. `surveyPalette` に引数を足した理由（テストの都合ではない）

`domain/palette.ts` はパレット自身のアクセシビリティ測定を持っており、
`test/accessibility-gate.test.ts` と `test/view-model.test.ts` は
**その 4 つのリストが空であること**を主張している。それは正しい主張で、穴がある ——

```typescript
const surveyPalette = () => ({ tokensBelowFloor: [], collapsedPairs: [], … })
```

これでも**全テストが通る**。カバレッジがそれを見せた: 報告経路
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
- **設計の前提を守るテストには由来を書く。** plan.md の節番号、参照実装の `path:line`、DN 番号。
  由来の無いテストは、将来だれかが「たぶん間違いだろう」と直してしまう。
  現状の 5 ファイルは全部これを守っており、
  例えば `the mode set matches the reference exactly, so its saved settings stay readable` の本体には
  `// packages/game/application/settings.schema.ts:10-11` が書かれている。
- **`REGRESSION:` 接頭辞は「参照実装で実際に起きた／設計注意が明示している失敗」に付ける。**
  そうでないものには付けない。区別が付かなくなると接頭辞の意味が消える。

## 7. 参照実装のテストが**オラクル**である

plan.md §8 のリスク表:

> 書き直しのスコープ(参照実装は84k LOC + 数ヶ月分のデバッグ知見)
> → 参照実装を仕様書として使い、テスト資産を各Stepで**先に**移植。ゼロから仕様を再発明しない

`packages/presentation/` のテストは実測 **63 ファイル / 10,862 LOC**（`input/` 除く）で、
非テストコード 10,116 LOC とほぼ同量である。移植順序は [porting.md](./porting.md) §4。

**ただし「オラクルとして移植」は「63 ファイルを移植する」ではない。**
1 ファイルずつの判定は [dom-oracle-triage.md](./dom-oracle-triage.md) にある。
本数は **456 本**で、`it.effect` だけを数えると 128 本しか見えない
（`it.scoped` が 139 本ある — porting.md §4-2 の数え方はここが漏れる）。
45% は mc-render / mc-sim の持ち物か、DN-UI-4 のように mx-ui が
**面に動詞を置かないことで別の答えを出している**ものである。

## 8. ブラウザゲート（`pnpm test:browser`）

**18 本 / 3 ファイル、実測 3.1 秒。`pnpm verify` には入っていない。**

```console
$ pnpm test:browser       # playwright test。webServer が pnpm preview:browser を 5182 で立てる
$ pnpm preview:browser    # ハーネスだけを立てて目で見る
```

| ファイル | 本数 | 何を測るか |
| --- | ---: | --- |
| `test-browser/dom-surface.spec.ts` | 4 | **実 `Document` への mount**。7 画面が渡されたホストに建つこと / 木が最後まで建つこと / DN-UI-4（リスナ皆無）/ カスタムプロパティが root にあり `document` に漏れないこと |
| `test-browser/palette-pixels.spec.ts` | 4 | **実測ピクセル**。カスケードがトークンのチャンネルに解決すること / アルファ 2 つ / **合成が sRGB であって線形でないこと** / **survey の最悪値が実際に下限であること** |
| `test-browser/geometry.spec.ts` | 10 | **レイアウト**。320 / 390px でホットバーが 1 列 24px 以上 / フォーカスリングに面積があること / `weight` が実ピクセルであること / **reduced-motion でヒットの太さが残ること** / セーフエリア内に収まること / 照準が中央に留まること |

### 8-1. なぜ `verify` に入れないか

`pnpm verify` は **「CI と同じ内容」**（§1）であり、CI にブラウザバイナリが無い。
入れると、このリポジトリの看板ゲートが 180MB のダウンロードと動く Chromium に依存し、
**「`playwright install` を走らせていない」という平凡な失敗が、コードについて何も言わない赤いビルドになる。**

前例はこのリポジトリの中にある: `pnpm test:coverage` が §1 の表で
**「`verify` には含まれない」**と明記されているのと同じ形である。
組織としては mc-compose の `check:roster` が同じ判断をしている
（実在するゲートで、実在するスクリプトがあり、`verify` の行には無い）。

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
7 画面・445 要素が建ち、キャストは 1 つも要らなかった。

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

### 8-3. ハーネスは mx-ui の中を 1 行もスタイルしない

`apps/browser-harness/index.html` の CSS セレクタは `[data-harness-host]` で止まっており、
**mx-ui のルートの内側に届く規則が 1 つも無い。** これが測定を正直にしている唯一の仕掛けである。
ハーネスがスロットに `width: 48px` を書けば、
「スロットは押せる大きさか」は**「ハーネスが 48px と書いたか」**に化ける——
`docs/e2e-triage.md` が偽 DOM に対して `48` を主張することを拒んだときの
**「測っていないものを測ったことにはしない」**と同じ失敗である。

その禁欲が、**否定的な結果を意味のあるものにしている**。
スロットが 4px で返ってきたことは mx-ui についての事実であって、ハーネスについての事実ではない。

### 8-4. リスナはハーネスにも無い

ブラウザハーネスは `addEventListener` を紛れ込ませるのに最も都合のよい場所である——
実 document があり、実イベントがあり、見ているテストが無い。**無い。**
DN-UI-4 の保証は「面に動詞が無いのでリスナを付けられない」であり、
ハーネスがその例外ではなく**その実演**であることのほうが、
買える対話性より価値がある。状態はクエリ文字列から来る。押すものは無い。

`test-browser/dom-surface.spec.ts` の DN-UI-4 テストは 1 つだけリスナを張るが、
**mx-ui のルートの外側**（ページシェル）であり、
張る理由は**カウンタがリスナを見られることを先に示すため**である——
一度も 1 を見たことのないガードが 0 を報告するのは §5-3 が出荷を拒んだ形である。

### 8-5. mutation（11 変異、10 が 1 本以上を殺した）

| # | 壊したもの | 殺した本数 |
| --- | --- | ---: |
| 1 | スロットの `min-width` / `min-height` を削除 | 3 |
| 2 | ホットバーの `display: grid` を削除 | 2 |
| 3 | スロットの `position: relative` を削除（リングの包含ブロック） | 1 |
| 4 | `PALETTE_ALPHA` から scrim を削除（アルファを落とす） | 2 |
| 5 | **`compositeOver` を線形光合成に変える** | 1 |
| 6 | `worstCaseContrastOnScrim` を `Math.min` → `Math.max`（下限を偽る） | 1 |
| 7 | `declarePalette(root)` を削除 | 5 |
| 8 | crosshair の `translate(-50%, -50%)` を削除 | 2 |
| 9 | `parent.appendChild(root)` を削除 | 13 |
| 10 | `aria-label` を行から削除 | **0（設計どおり）** |
| 11 | ヒットの太さを `animates` で条件付けする（reduced-motion で信号を落とす） | 1 |

**11 は `application/crosshair-view.ts` が冒頭で警告している当の間違いである** ——
参照実装の凍ったローディングバーと同じ形で、**アクセシブルな経路が情報を静かに失う**。
書かれた文字列としては偽 document も見られるが、
**実ピクセルで 4px が 2px に落ちること**を見られるのはブラウザだけである。

**5 が一番価値のある変異である。** `domain/palette.ts` がコメントで断言していた
「ブラウザもガンマ正しくない」を実際に反証可能にしているのがこの 1 本で、
前提が逆だったら赤くなる。

**10 は生存し、それは穴ではない。** アクセシブル名は
`test/accessibility-gate.test.ts` の持ち物であり、ブラウザ側で二重化していない。
**属性は偽 document が完全に観測できるもの**なので、ブラウザに持っていく理由が無い
（§3 の「C が A/B より優れているのは速度ではなく、答えられる問いの種類である」の裏返しである）。

### 8-6. カバレッジは動いていない

**99.89 / 99.76 / 100 / 99.89 のままである。** ブラウザ suite は vitest の下で走らないので
`coverage.include` に 1 行も足さず、`exclude` にも 1 行も足していない。
実装側の変更（スロットの最小寸法、ホットバーのグリッド）は**すべて mount 時の文**であり、
既存の 314 本が既に通っている経路なので、指標は 1 桁も動かなかった。
**フレームパスには 1 文も足していない**（`test/hud-view.test.ts` の
「変更の無い再描画が DOM を 1 回も触らない」は緑のままである）。
