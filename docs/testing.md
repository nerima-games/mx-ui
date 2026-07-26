# 検証とテスト

出典: plan.md §3.13（検証: 「DOMテスト + 状態モック付きプレビュー(各画面を単体起動して操作)」）、§6 Step 2、§8。

## 1. 検証ゲート

```console
$ pnpm verify        # typecheck && lint && check:deps && test。CI と同じ内容
```

| ゲート | 何を捕まえるか |
| --- | --- |
| `pnpm typecheck` | `tsconfig.build.json`（出荷ソース）、`tsconfig.test.json`（テスト + ツール）、`tsconfig.preview.json`（`apps/` の dev アプリ）の 3 プロジェクト。**出荷ソースには Node 型が無い** — `types: []` を継承しているので、画面の中で `process.env` を読むと落ちる。プレビューが Node の stdio を使えるのは**別プロジェクト**だからであって、build 側を緩めたからではない（§4） |
| `pnpm lint` | oxlint。**このリポジトリ唯一の lint / format 設定**。prettier も biome も `.editorconfig` も置かない。**`--deny-warnings` 付きで走る**ため、`warn` のルールもビルドを落とす（`oxlint.json` は 5 カテゴリすべてと個別 67 ルールが `warn`、`error` は 4 つだけ。このフラグが無かった頃は実質その 4 つしかゲートになっていなかった） |
| `pnpm check:deps` | 依存ホワイトリスト / 循環 / 推移閉包 / kit の実行時混入 / **壁時計の直読み**（DN-UI-10） |
| `pnpm api:check` | `api-lock.md` と公開 API の乖離（plan.md §6 Step 0-3） |
| `pnpm test` | vitest |
| `pnpm test:coverage` | カバレッジ計測。**閾値は未設定**（§5） |

**`apps/`（プレビュー）は `SCAN_ROOTS` にも lint 対象にも入っている。**
`pnpm verify` はプレビューを*実行*しないが、型検査・lint・依存ゲート・壁時計禁止はすべて適用される。
「dev アプリだから検査しない」にすると、依存を 1 つ足すのに最も抵抗の少ない場所ができてしまう。

`pnpm` は `corepack` 経由で 9.15.0（`package.json` の `packageManager` でピン留め）。

`check:deps` が壁時計禁止まで見ているのは oxlint 0.12 が該当ルールを実装していないためで、
経緯は `oxlint.json` の冒頭と DN-UI-10 にある。

## 2. 現状の suite（2026-07-26 実測）

```
vitest 3.2.7
 ✓ test/public-api.test.ts                 (6 tests)
 ✓ test/stage-registration.test.ts         (15 tests)
 ✓ test/accessibility.test.ts              (17 tests)
 ✓ test/view-model.test.ts                 (49 tests)
 ✓ test/inventory-mirror.test.ts           (6 tests)
 ✓ test/check-dependency-whitelist.test.ts (20 tests)
 ✓ test/api-lock.test.ts                   (26 tests)

 Test Files  7 passed (7)
      Tests  139 passed (139)
```

`view-model.test.ts` が 20 → 35 に増えたのはプレビューの finding 4 件と gap 2 件を
assertion として降ろしたぶんで、35 → 49 に増えたのは**その gap 2 件を埋めたぶん**である。
**「無い」ことを assert していた 2 本は消え、「何を保証するか」を assert する 14 本になった**（§4）。
`inventory-mirror.test.ts` は mc-sim のミラーを pin する新ファイルで、
`mx-gameplay/test/chunk-store-mirror.test.ts` と同じ役割である（DN-UI-12）。

**プレビュー（`apps/`）にテストは無い。** 意図的である——プレビューは検査対象ではなく検査**手段**であり、
そこで見つかったことは `test/view-model.test.ts` に assertion として降ろすのが正しい置き場所である（§4）。

**この数字はスケルトンが育つたびに動く。** 権威は `pnpm verify` の出力であって本節ではない。
本節が古くなっていたら、それは suite が増えたということである。

| ファイル | 守っているもの |
| --- | --- |
| `test/view-model.test.ts` | DN-UI-6（ハーフハート）/ DN-UI-7（クランプ）/ DN-UI-3（字幕）/ **DN-UI-11（パレットの保証）/ DN-UI-12（射影と unknown）** |
| `test/inventory-mirror.test.ts` | **DN-UI-12（mc-sim ミラーの形と、それがバレルに載る理由）** |
| `test/accessibility.test.ts` | DN-UI-1（色覚 / reduced-motion / リマップ）/ DN-UI-4（Escape 単一ハンドラ） |
| `test/stage-registration.test.ts` | DN-UI-8（`after` は制約のみ）/ DN-UI-9（再入可能）/ DN-UI-3 / DN-UI-10 |
| `test/check-dependency-whitelist.test.ts` | 依存境界 / DN-UI-5（kit 不要）/ DN-UI-10 |
| `test/public-api.test.ts` | 公開バレル / アクセシビリティ資産の存在保証 / **kernel 語彙を再公開していないこと** |

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

### document をどうやって与えるか — 未決

2 案あり、まだ選んでいない。

| 案 | 内容 | 利点 | 欠点 |
| --- | --- | --- | --- |
| A | DOM を要るファイルの先頭に `// @vitest-environment jsdom` プラグマ | 設定変更なし。純粋テストは `node` のまま速い | ファイルが増えるほど宣言が散る |
| B | vitest の project を 2 つに分ける（`node` / `jsdom`） | 環境の境界が 1 か所で見える | 設定が増える。ファイルの置き場所で環境が決まる |

`vitest.config.ts` のコメントが両案を挙げて「どちらでもよい」と保留している。
**どちらを選んでも DN-UI-2 の書き方は変わらない。**
デッドロックは environment ではなく `it.effect` のファイバ管理の問題だからである。

## 4. 完成条件

plan.md §6 Step 2 の共通条件:

> 各リポジトリの完了条件: ユニット/シナリオテスト green + 内蔵プレビューが操作可能

mx-ui にとってのプレビューは plan.md §3.13 の

> 状態モック付きプレビュー(各画面を単体起動して操作)

| # | 条件 | 状態 |
| --- | --- | --- |
| 1 | `pnpm verify` が green | ✅ |
| 2 | 参照実装の DOM テスト資産（63 ファイル / 10,862 LOC、`input/` 除く）をオラクルとして移植 | ❌ |
| 3 | **各画面のプレビューが単体で起動し操作できる** | ✅（`apps/preview-screens/`、下記） |
| 4 | アクセシビリティ資産 4 つが目視で確認済み | ⚠️ 部分的（4 つとも操作でき、補正行列を引き継ぎ、**パレットも定義して 4 モード全部で調査した**。残るのは**そのトークンを CSS にする消費者がまだ無い**ことで、保証は数値については証明済み、描かれた画面については未証明である——下記 G1） |
| 5 | 99% カバレッジゲートが有効 | ❌（完成時に有効化、§5） |

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

#### 残っている 1 件（G1、前より狭い）

`pnpm preview --stats` が印字する。2 つの別々のことが 1 エントリに入っているのは、
**どちらも今このリポジトリの中では閉じられない**からである。

1. **パレットに消費者が無い。** トークンは値であり、CSS にする層がまだ無い。
   だから保証（テキスト 4.5:1 / アイコン 3:1、スクリムの上、任意の世界ピクセルに対して）は
   **数値については証明済みで、描かれた画面については未証明**である。
   保証は「HUD の内容がスクリムの上に留まる」ことも前提にしており、
   スタイルシートがラベルをスクリムの外に置けば保証は置き去りになる——
   そしてスタイルシートが無い間、それを見るテストは書けない。
   出荷側の面倒は [versioning.md](./versioning.md) §4（`files` / `exports` / tsc だけでは足りないビルド）。
2. **mc-sim にレシピモデルが無い。** クラフト**画面**はあり、渡されたものを射影する。
   しかし「このグリッドは何か作るか」に射影すべき答えが無い（mc-sim の `api-lock.md` に `Recipe` が無い）。
   だから `CraftingSnapshot.result` は実際 `undefined` で、ビューモデルは `unknown` を返す。
   **それは正しい挙動であって仮置きではない**が、mc-sim がレシピを所有するまで
   本物のクラフト結果は出せない。レシピ照合は plan.md §2.3-1 で mc-sim のものであり、
   ここで発明することがこのリポジトリのしてはならないことである。

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

## 5. カバレッジ — 99% ゲートは完成時に入れる、今ではない

**現在、閾値は設定していない。これは意図的である。**

- 参照実装（`takeokunn/ts-minecraft`）は branches / functions / lines / statements の全てに **99%** を強制している
  （`vitest.config.ts:128-133`）。
- **スケルトンに閾値を課しても意味がない。** 型定義と純粋関数だけのモジュールがいくつかあれば簡単に満たせてしまい、
  実装の品質について何も語らない数字になる。現状の 5 ファイル 75 テストは
  `domain/` の純粋関数をほぼ全部通っているので、閾値を入れれば**今日でも通る**。
  それは「通した」ではなく「まだ何も無い」という意味である。
- 計測とレポートは常に動かしている（`pnpm test:coverage`）ので、数字はいつでも見える。
  CI にも `Coverage` ステップがあり、`coverage/` を artifact として 7 日間保存する。

有効化する行は `vitest.config.ts` に**コメントとして既に置いてある**:

```typescript
// thresholds: { branches: 99, functions: 99, lines: 99, statements: 99 },
```

CI ワークフローにも注記がある:

```yaml
# Coverage is reported but not yet thresholded — see vitest.config.ts.
# The 99% gate is added when this repository reaches its completion criteria.
```

**完成条件（§4）に到達した時点で、`vitest.config.ts` と CI の両方で有効化する。**

計測対象は `index.ts` / `domain/**` / `stages/**`（`coverage.include`）で、
テスト・設定ファイル・`.d.ts` は除外している。

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
