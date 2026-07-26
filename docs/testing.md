# 検証とテスト

出典: plan.md §3.13（検証: 「DOMテスト + 状態モック付きプレビュー(各画面を単体起動して操作)」）、§6 Step 2、§8。

## 1. 検証ゲート

```console
$ pnpm verify        # typecheck && lint && check:deps && test。CI と同じ内容
```

| ゲート | 何を捕まえるか |
| --- | --- |
| `pnpm typecheck` | `tsconfig.build.json`（出荷ソース）と `tsconfig.test.json`（テスト + ツール）の両方。**出荷ソースには Node 型が無い** — `types: []` を継承しているので、画面の中で `process.env` を読むと落ちる |
| `pnpm lint` | oxlint。**このリポジトリ唯一の lint / format 設定**。prettier も biome も `.editorconfig` も置かない。**`--deny-warnings` 付きで走る**ため、`warn` のルールもビルドを落とす（`oxlint.json` は 5 カテゴリすべてと個別 67 ルールが `warn`、`error` は 4 つだけ。このフラグが無かった頃は実質その 4 つしかゲートになっていなかった） |
| `pnpm check:deps` | 依存ホワイトリスト / 循環 / 推移閉包 / kit の実行時混入 / **壁時計の直読み**（DN-UI-10） |
| `pnpm test` | vitest |
| `pnpm test:coverage` | カバレッジ計測。**閾値は未設定**（§5） |

`pnpm` は `corepack` 経由で 9.15.0（`package.json` の `packageManager` でピン留め）。

`check:deps` が壁時計禁止まで見ているのは oxlint 0.12 が該当ルールを実装していないためで、
経緯は `oxlint.json` の冒頭と DN-UI-10 にある。

## 2. 現状の suite（2026-07-26 実測）

```
vitest 3.2.7
 ✓ test/public-api.test.ts                 (6 tests)
 ✓ test/stage-registration.test.ts         (12 tests)
 ✓ test/accessibility.test.ts              (17 tests)
 ✓ test/view-model.test.ts                 (20 tests)
 ✓ test/check-dependency-whitelist.test.ts (20 tests)

 Test Files  5 passed (5)
      Tests  75 passed (75)
   Duration  485ms
```

**この数字はスケルトンが育つたびに動く。** 権威は `pnpm verify` の出力であって本節ではない。
本節が古くなっていたら、それは suite が増えたということである。

| ファイル | 守っているもの |
| --- | --- |
| `test/view-model.test.ts` | DN-UI-6（ハーフハート）/ DN-UI-7（クランプ）/ DN-UI-3（字幕） |
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
| 3 | **各画面のプレビューが単体で起動し操作できる** | ❌（プレビューは 1 本も無い） |
| 4 | アクセシビリティ資産 4 つが目視で確認済み | ❌ |
| 5 | 99% カバレッジゲートが有効 | ❌（完成時に有効化、§5） |

### プレビューの条件

- 各画面が**単体で**起動する。背後にゲームが要らない。
- **mc-playground-kit を使わない**（DN-UI-5、plan.md §3.13:「kit 不要(DOMのみで起動)」）。
- 置き場は `apps/preview-*/`（plan.md §4.1: 「プレビューは契約に含めない(各リポジトリ内の dev アプリ)」）。
- 状態はモックである。`domain/hud-view-model.ts` の `spawnSnapshot` がその最小形で、
  「リテラルを渡せば HUD が出る」ようにビューモデルが純粋関数であることがこれを可能にしている。

`ui:overlay-sync` が mc-sim の状態を一切読まないのは、この条件のための構造である
（[responsibility.md](./responsibility.md) §1）。

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
