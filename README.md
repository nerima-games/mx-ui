# @nerima-games/mx-ui

## 責務

ゲームが持つ **DOM の面を全部**（plan.md §3.13）。

HUD（ホットバー / 体力 / 空腹 / XP）、メニュー（タイトル / ポーズ / ワールド選択・作成）、
インベントリ・クラフト画面、設定画面（グラフィックス / 音量 / 操作 / アクセシビリティ）、
実績・統計画面、字幕表示、ローディング / セーブ表示。
これに plan.md §7 が明示的に割り当てているマルチプレイヤー**画面**と、
クラフト・かまど・醸造・金床・エンチャントの**画面**の側が加わる。

**ゲーム状態は一切持たない。** 体力も空腹も XP もインベントリも実績も統計も設定も mc-sim の資産であり、
mx-ui が所有するのは「19 点の体力はハート 9 個と半分である」という**導出**だけである。

## 依存

`mc-sim` と `mc-audio`（プラス `mc-kernel`。これは全リポジトリ共通の例外）。

**mc-audio は 1 つの理由だけで親である** — `CaptionEventStream`（plan.md §3.13「audio(字幕購読)」、§4.3）。
mx-ui は音を鳴らさない。字幕イベントを購読するだけであり、鳴らす側は mc-audio が所有する。

**mc-playground-kit は不要**（plan.md §3.13:「kit 不要(DOMのみで起動)」）。
各画面は自分の状態モックだけで起動するので、背後にミニ世界を用意する糊がいらない。
実装された `apps/preview-screens/` は依存 0 個で動いており、この主張は現に検証済みである。
ただし「kit は devDependency 専用」という組織全体のルールはここでも生きている
（`test/check-dependency-whitelist.test.ts` の `§2.3-2: mc-playground-kit is devDependency-only`）。

この境界は機械的に強制されている。しかも**穴の種類が違う 2 か所**で強制されている:

| ゲート | 捕まえるもの | 見えないもの |
| --- | --- | --- |
| `scripts/check-dependency-whitelist.ts` | `import` — 未許可パッケージ、推移閉包、宣言漏れ、kit の実行時混入、壁時計直読み | stage `after` の文字列 |
| `test/stage-registration.test.ts` | stage `after` に書かれた `StageId` 文字列 | import |

`StageId` は文字列なので、`after: [StageId('gameplay:interactions')]` は import ゲートを素通りする。
2 つ目のゲートはその穴のためだけに存在する（[docs/design-notes.md](./docs/design-notes.md) DN-UI-8）。

## このリポジトリの位置づけ

4 階層アーキテクチャ（plan.md §2.2）の**体験モジュール層** = **動詞**。
基盤（mc-sim / mc-worldgen / mc-render）が名詞、体験（mx-gameplay / mx-redstone / mx-ui / mx-multiplayer）が動詞である。

**体験モジュール間の依存エッジはゼロ。** 「採掘したらホットバーに入る」は mx-gameplay → mx-ui のエッジではない。
mx-gameplay が mc-sim の `InventoryService` に書き、mx-ui が同じサービスを読む、という 2 本の別々の関係である。
mx-ui は**採掘という機能が存在することをコンパイル時に一切知らない**。

そして mx-ui は、その線を保つのが 4 つの中で最も難しい場所である。
UI の要素はほぼ全て「どこか他のモジュールのルールが出した結果」を表示しているからで、
誘惑は具体的にこう見える — 「ホットバーは採掘の後に更新されてほしい」。
これは `gameplay:` に対する順序制約のように読めるが、実際にはシミュレーションに対する制約である。
詳細は [docs/architecture.md](./docs/architecture.md)。

## 依存ルール（16 リポジトリ共通）

| ルール | 内容 |
| --- | --- |
| ハード失敗 | 違反があれば CI は必ず非ゼロ終了する。警告で済ませない |
| 循環禁止 | 循環依存は一切許可しない。「co-evolution ペア」のような例外リストは設けない |
| 推移閉包の禁止 | A→B、B→C のとき A は C を import できない。依存は直接依存のみが import 許可を意味する |
| kernel は例外 | mc-kernel はどこからでも import 可。**これが唯一の例外** |
| 宣言と実体の一致 | import する `@nerima-games/*` は `package.json` に記載されていなければならない |
| mc-playground-kit は devDependency 専用 | `dependencies` に入れてはならない。実行時依存になると、出荷ビルドから入力処理が消える |
| 壁時計の直読み禁止 | 時刻はすべて注入された Clock Port から取得する |

`scripts/check-dependency-whitelist.ts` は 16 リポジトリ共通のテンプレートであり、
ファイル冒頭で囲ってある `REPOSITORY_POLICY` 定数だけがこのリポジトリ固有である。
`REPOSITORY_POLICY.dependencyGraph` には plan.md §2.1 の**全 16 リポジトリ**が転記されているので、
このリポジトリのコピーだけで組織全体の循環を検出でき、推移閉包違反にも経路つきの説明が出せる。

壁時計直読み禁止が oxlint ではなくスクリプト側にあるのは、oxlint 0.12 が `no-restricted-syntax` も
`no-restricted-properties` も実装しておらず、`no-restricted-globals` も一覧に出るだけで実装されていないため
（`.oxlintrc.json` の冒頭に実測メモがある）。このルールは mx-ui で最も効く
— 字幕の失効、トーストのフェード、自動保存インジケータ、FPS カウンタの全部が時刻を欲しがる。

## 開発

### Browser mount shortcuts

`makeUiMount` の browser session では F1 でデバッグ HUD、F10 で設定画面を切り替える。
設定画面は Escape でも閉じられる。デバッグ値は `updateDebug`、設定の外部同期は
`updateSettings`、ユーザー操作の反映は `settingsCallbacks` を使う。

インベントリを開いている間は矢印キーでスロット間を移動し、Enter / Space で選択中の
スロットを起動できる。ゲームパッドを所有するホストは、方向入力を
`moveInventoryFocus('up' | 'down' | 'left' | 'right')`、決定入力を
`activateInventoryFocus()` に渡す。同じフォーカス状態を共有するため、入力方式を切り替えても
roving tabindex とスクリーンリーダー向けラベルは同期したままになる。

### セットアップ

```console
$ direnv allow          # flake.nix の devShell で nodejs_24 + corepack が入る
$ pnpm install
```

Nix を使わない場合は Node.js 24 以上と pnpm 11（`corepack` 推奨）を用意する。

> **注意**: ツールチェーンは `devenv.nix` から `flake.nix` + `flake.lock` に移行済みである。
> `flake.lock` はコミットされているので、`nix develop`（`.envrc` は `use flake`）は
> 誰の手元でも同じ nixpkgs に解決される。`devenv.nix` / `devenv.lock` はもう存在しない。

### コマンド

| コマンド | 内容 |
| --- | --- |
| `pnpm typecheck` | `tsconfig.build.json` / `tsconfig.test.json` / `tsconfig.preview.json` を型検査 |
| `pnpm lint` | oxlint（このリポジトリ唯一の lint / format 設定。prettier も biome も .editorconfig も置かない）。**`--deny-warnings` 付きで走る**ため、`warn` のルールもビルドを落とす（`.oxlintrc.json` は 5 カテゴリすべてと個別 67 ルールが `warn`、`error` は 4 つだけ。このフラグが無かった頃は実質その 4 つしかゲートになっていなかった） |
| `pnpm lint:fix` | oxlint の自動修正 |
| `pnpm test` | vitest（`@effect/vitest` の `it.effect` が主 API） |
| `pnpm test:watch` | vitest watch |
| `pnpm test:coverage` | カバレッジ計測（閾値は未設定。[docs/testing.md](./docs/testing.md) §5） |
| `pnpm check:deps` | 依存ホワイトリスト + 循環検査 + 壁時計直読み禁止の検査 |
| `pnpm preview` | 各画面プレビュー（[apps/preview-screens/](./apps/preview-screens/README.md)）。**`pnpm verify` には入れていない** |
| `pnpm verify` | `typecheck && lint && check:deps && api:check && test`。CI と同じ内容 |

## 現状

**実装前の叩き台である。** 何が無いかを正直に書く。

- **`effect` だけが実行時依存。** mc-sim も mc-audio も mc-kernel も `package.json` に入っていない。
  組織のどのパッケージもまだ publish されておらず（ボトムアップの publish-then-pin、plan.md §6 Step 2）、
  install できない依存を宣言すればビルドの通らないスケルトンが残るだけだからである。
  `REPOSITORY_POLICY` と `test/check-dependency-whitelist.test.ts` は、依存が**存在するようになったとき**の
  規則を先に固定してある。
- **`domain/frame-contract.ts` は mc-kernel の型のローカル再掲であり、削除日が決まっている。**
  mc-kernel が publish された時点で消し、`import type { StageRegistration } from '@nerima-games/mc-kernel'` に置き換える。
  ここに再掲してよいのは frame 契約だけで、他の kernel 型を 2 つ目のコピーとして持つことは禁止
  （語彙の home は 1 つ、plan.md §3.1）。
  **このファイルは `index.ts` から re-export していない。** 所有していない語彙（`StageId` /
  `DeltaTimeSecs` / `StageRegistration`）を公開 API に載せると、上記の削除が
  すべての消費者にとっての破壊的変更になるためである。
- **`application/` が DOM 層である**（HUD / 字幕 / インベントリ / 自動保存インジケータ）。`domain/` の射影を要素にし、
  `domain/` を import する——**逆は無い**（`test/dom-surface.test.ts` が固定）。
  `domain/` は今も全て純粋な導出なので、テストは vitest の `environment: 'node'` のままである。
  jsdom も `@vitest-environment` プラグマも入れていない: レンダラは `HTMLElement` ではなく
  `application/dom-surface.ts` の**構造型**に対して書かれているので、90 行の偽 document が
  **キャスト無しで**それを満たす。実 `Document` / `HTMLElement` も同じ型を満たすことは、
  実 `lib.dom.d.ts` に対して fixture をコンパイルして診断 0 件を assert している（DN-UI-13）。
  その面に `addEventListener` は**無い**——だから DN-UI-4「Escape の所有者は 1 つ」は規律ではなく語彙の問題である。
  パレットの 23 トークンは mx-ui 自身のルートにカスタムプロパティとして宣言され、
  どの要素も色リテラルを持たない。**モデルが変わらない再描画は DOM を 1 回も触らない**（plan.md §5.2）。
  `types: []` は継承しているので Node グローバルは入らない。
- **各画面プレビューは動く**（`pnpm preview`、[apps/preview-screens/](./apps/preview-screens/README.md)）。
  plan.md §6 Step 2 の完了条件「テスト green + **内蔵プレビューが操作可能**」の後半は、これで満たしている
  （[docs/testing.md](./docs/testing.md) §4）。
  HUD / インベントリ / 設定 / 字幕の 4 画面が `--screen` で**単体起動**し、状態はモック、依存は 0 個、
  壁時計の読み取りも 0 箇所（時計はキーで進む数値である）。
  **DOM ではなく端末にビューモデルを描いている。** 理由は「プレビューすべき DOM コードがまだ無い」ことと
  「検証対象のビューモデルが純粋関数であること」で、詳細と**失うもの**（レイアウト崩れ・フォーカスリング・
  スクリーンリーダーは一切見えない）は `apps/preview-screens/main.ts` 冒頭に書いてある。
  `tsconfig.build.json` は**触っていない**——プレビューは専用プロジェクトで型検査するので、
  「出荷ソースに Node 型が無い」保証はそのまま残っている。
  **初回実行で 4 件の欠陥を出した**（`pnpm preview --stats`）。
  空スロットが耐久度を報告し続ける / NaN 体力で「空のハート列 + `dead: false`」になる /
  NaN の選択 index でどのスロットも選択されなくなる / XP バーが 1 レベル早く 100% になる——
  **4 件とも既存の 20 本のビューモデルテストが捕まえていなかった**。
  どれも「バージョン境界を越えて来る値」の話で、テストは妥当な入力を渡すからである。
  **4 件とも修正し、`test/view-model.test.ts` の assertion にした**（DN-UI-7a〜7d）。
  現在 finding は 0 件である。
  **gap 2 件は埋めた。**
  **`domain/palette.ts`** がパレットを持つ（旧 G1）。値は参照実装から掘ってあるが、
  掘ってから測って**2 つ動かし、1 件の実際の欠陥を見つけた**——参照実装の自動保存インジケータは
  成功 `#d7f7c2` と失敗 `#ffd6d2` が protanopia で 12 しか離れておらず（潰れ閾値 24）、
  **赤緑色覚特性のプレイヤーは保存の成否を区別できない**。参照実装の e2e ゲートは
  テキストを自分の背景とだけ比べるので構造上これを見られない。
  保証は狭く言ってある: **テキスト 4.5:1 / アイコン 3:1、mx-ui 自身の面に対して、
  スクリムについてはあり得る最悪の世界ピクセルの上で**。世界の上のグリフには何も主張しない（DN-UI-11）。
  **`domain/inventory-view-model.ts`** がインベントリ／クラフトを射影する（旧 G2）。
  mc-sim の形はミラーで写し（provisional、`test/inventory-mirror.test.ts` が pin）、
  スロットはホットバーと**同じ `slotView()`** を通り、
  **mc-sim が所有する問い（スタッキング・レシピ）は `unknown` を返して当てずっぽうを言わない**（DN-UI-12）。
  **そしてその欠陥は、いまは画面の上で直っている。** 長らく `STATUS_OK` と `STATUS_BUSY` は
  **どの要素も参照しないトークン**で（`FOCUS_RING` と合わせて 3 つ）、
  つまり**調査の目玉の修正が値のままでどこにも描かれていなかった**。
  `application/save-indicator.ts` が自動保存インジケータであり、
  4 状態（idle / saving / saved / failed）を**それぞれ独立した要素**で建てる——
  `⟳ Saving world…` / `✔ World saved` / `✖ Save failed`。
  **区別はグリフと言葉が担い、色は 3 本目の信号である**（`saved` / `saving` は deuteranopia で 1.11:1 しかない）。
  **`failed` は失効しない**: 確認は領収書だが失敗は警告で、3 秒のトーストはそれを最も見逃す人を落とす（DN-UI-13h）。
  `FOCUS_RING` はホットバーを roving `tabindex` の**1 タブストップ**にして埋めた。
  リングはスロットごとの専用要素（金 3px / 暗色 5px）で、`SLOT_SELECTED` とは**別の要素**である——
  「ゲームが使っているスロット」と「キーボードがいるコントロール」は別の問いだからである。
  **DOM 面は 1 メンバも広げていない**（`focus()` も `addEventListener` も足していない）。
  **まだ mc-render のものである半分**は、フォーカスを動かすキーストロークとその通知である（DN-UI-13i）。
  残る gap は **mc-sim にレシピモデルが無い**こと。このリポジトリの中では閉じられない。
- **build / publish パイプラインは無い。** `exports` は TypeScript ソースを直接指しており `noEmit: true`。
  `version` は `0.x` に留める（[docs/versioning.md](./docs/versioning.md)）。
- **カバレッジ閾値は未設定。** 計測とレポートは常に動かしており、99% ゲートは完成条件到達時に有効化する
  （`vitest.config.ts` に有効化する行がコメントで置いてある）。
- **`it.effect` デッドロックの規則が、それを必要とするテストより先に書いてある。**
  DOM イベントフローのテストは `it.effect` ではなくプレーン `it` + `Effect.runPromise` で書かなければならない
  （[docs/design-notes.md](./docs/design-notes.md) DN-UI-2）。まだそういうテストは 1 本も無いが、
  最初の 1 本を書く人が参照実装で確定済みの罠を踏み直さないよう、先に記録してある。

### 検証（2026-07-27 実測）

`pnpm install` と `pnpm verify` はいずれも 0 で終了する。

```
typecheck   tsc 3 プロジェクト（build / test / preview）ともエラーなし
lint        oxlint: 48 files, 97 rules, Found 0 warnings and 0 errors
check:deps  OK — 48 file(s) scanned, allowed direct dependencies:
            @nerima-games/mc-audio, @nerima-games/mc-sim
            (plus @nerima-games/mc-kernel, which every repository may import)
api:check   OK — api-lock.md matches the public API (207 entries)
test        vitest 3.2.7 — 12 files, 198 tests passed
```

数字はスケルトンが育つたびに動く。**再現は `pnpm verify` であり、本節はその時点のスナップショットである。**

## ドキュメント

**[docs/README.md](./docs/README.md) が索引。**

| ドキュメント | 内容 |
| --- | --- |
| [docs/architecture.md](./docs/architecture.md) | 4 階層、全 16 リポジトリの依存グラフ、名詞/動詞ルール、体験モジュール間ゼロエッジ、画面別分割を採らない理由 |
| [docs/responsibility.md](./docs/responsibility.md) | 責務と、**明示的な非スコープ**（それぞれの行き先つき） |
| [docs/public-api.md](./docs/public-api.md) | 公開 API。stage 登録 + 将来の mount 面、契約と「可視だが公開ではない」もの |
| [docs/design-notes.md](./docs/design-notes.md) | **設計注意 DN-UI-1 〜 DN-UI-13。** 参照実装の `path:line` と、それを守る回帰テスト名 |
| [docs/porting.md](./docs/porting.md) | 参照実装からの移植元と**実測 LOC**、`input/` の境界訂正、移植順序 |
| [docs/testing.md](./docs/testing.md) | 検証ゲート、`it.effect` デッドロック、完成条件、99% ゲートの投入時期 |
| [docs/versioning.md](./docs/versioning.md) | 0.x → 1.0.0 方針、GitHub Packages、mx-ui だけが抱えるアセット同梱の面倒 |

## License

MIT
