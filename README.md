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
（`oxlint.json` の冒頭に実測メモがある）。このルールは mx-ui で最も効く
— 字幕の失効、トーストのフェード、自動保存インジケータ、FPS カウンタの全部が時刻を欲しがる。

## 開発

### セットアップ

```console
$ direnv allow          # flake.nix の devShell で nodejs_22 + corepack が入る
$ pnpm install
```

Nix を使わない場合は Node.js 22 以上と pnpm 9.15.0（`corepack` 推奨）を用意する。

> **注意**: ツールチェーンは `devenv.nix` から `flake.nix` + `flake.lock` に移行済みである。
> `flake.lock` はコミットされているので、`nix develop`（`.envrc` は `use flake`）は
> 誰の手元でも同じ nixpkgs に解決される。`devenv.nix` / `devenv.lock` はもう存在しない。

### コマンド

| コマンド | 内容 |
| --- | --- |
| `pnpm typecheck` | `tsconfig.build.json` / `tsconfig.test.json` / `tsconfig.preview.json` を型検査 |
| `pnpm lint` | oxlint（このリポジトリ唯一の lint / format 設定。prettier も biome も .editorconfig も置かない）。**`--deny-warnings` 付きで走る**ため、`warn` のルールもビルドを落とす（`oxlint.json` は 5 カテゴリすべてと個別 67 ルールが `warn`、`error` は 4 つだけ。このフラグが無かった頃は実質その 4 つしかゲートになっていなかった） |
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
- **DOM コードはまだ 1 行も無い。** `tsconfig.base.json` は既に `"lib": ["ES2024", "DOM"]` を宣言している
  — 16 リポジトリ中 DOM を持つのはここだけである — が、これは「最初の画面を足すときに
  ビルド設定の変更を同時にやらなくて済むように」先に置いてあるだけで、現状 `domain/` は全て純粋な導出である。
  そのためテストは vitest の `environment: 'node'` で走る。`types: []` は継承しているので Node グローバルは入らない。
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
  残るのは **gap 2 件**——mx-ui が色を 1 つも定義していないこと（ただし `feColorMatrix` の
  補正行列は参照実装から引き継ぎ、算術をテストで固定した。DN-UI-1a）と、
  インベントリ／クラフトにビューモデルが無いこと。**どちらも「無い」ことを assert するテストで
  ピン留めしてある**ので、埋まればテストが落ちる（沈黙ではなく diff になる）。
- **build / publish パイプラインは無い。** `exports` は TypeScript ソースを直接指しており `noEmit: true`。
  `version` は `0.x` に留める（[docs/versioning.md](./docs/versioning.md)）。
- **カバレッジ閾値は未設定。** 計測とレポートは常に動かしており、99% ゲートは完成条件到達時に有効化する
  （`vitest.config.ts` に有効化する行がコメントで置いてある）。
- **`it.effect` デッドロックの規則が、それを必要とするテストより先に書いてある。**
  DOM イベントフローのテストは `it.effect` ではなくプレーン `it` + `Effect.runPromise` で書かなければならない
  （[docs/design-notes.md](./docs/design-notes.md) DN-UI-2）。まだそういうテストは 1 本も無いが、
  最初の 1 本を書く人が参照実装で確定済みの罠を踏み直さないよう、先に記録してある。

### 検証（2026-07-26 実測）

`pnpm install` と `pnpm verify` はいずれも 0 で終了する。

```
typecheck   tsc 3 プロジェクト（build / test / preview）ともエラーなし
lint        oxlint: 27 files, 97 rules, Found 0 warnings and 0 errors
check:deps  OK — 27 file(s) scanned, allowed direct dependencies:
            @nerima-games/mc-audio, @nerima-games/mc-sim
            (plus @nerima-games/mc-kernel, which every repository may import)
api:check   OK — api-lock.md matches the public API (70 entries)
test        vitest 3.2.7 — 6 files, 119 tests passed
```

数字はスケルトンが育つたびに動く。**再現は `pnpm verify` であり、本節はその時点のスナップショットである。**

## ドキュメント

**[docs/README.md](./docs/README.md) が索引。**

| ドキュメント | 内容 |
| --- | --- |
| [docs/architecture.md](./docs/architecture.md) | 4 階層、全 16 リポジトリの依存グラフ、名詞/動詞ルール、体験モジュール間ゼロエッジ、画面別分割を採らない理由 |
| [docs/responsibility.md](./docs/responsibility.md) | 責務と、**明示的な非スコープ**（それぞれの行き先つき） |
| [docs/public-api.md](./docs/public-api.md) | 公開 API。stage 登録 + 将来の mount 面、契約と「可視だが公開ではない」もの |
| [docs/design-notes.md](./docs/design-notes.md) | **設計注意 DN-UI-1 〜 DN-UI-10。** 参照実装の `path:line` と、それを守る回帰テスト名 |
| [docs/porting.md](./docs/porting.md) | 参照実装からの移植元と**実測 LOC**、`input/` の境界訂正、移植順序 |
| [docs/testing.md](./docs/testing.md) | 検証ゲート、`it.effect` デッドロック、完成条件、99% ゲートの投入時期 |
| [docs/versioning.md](./docs/versioning.md) | 0.x → 1.0.0 方針、GitHub Packages、mx-ui だけが抱えるアセット同梱の面倒 |

## License

MIT
