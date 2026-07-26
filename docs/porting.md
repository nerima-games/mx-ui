# 参照実装からの移植

移植元は `takeokunn/ts-minecraft`（凍結。仕様書 + テストオラクル、plan.md 前文）。
mx-ui に来るのは `packages/presentation/` である。

## 1. 計測条件

**本書の LOC はすべて 2026-07-26 に `wc -l` で取った実測値である。**
plan.md §3.13 の数字（`hud 3.1k / menu 2.2k / inventory 2.2k / settings 0.9k / multiplayer画面 0.6k / loading 0.2k / highlight 0.3k` ~10k）は
**概算**であり、実測ではない。混同しないこと。

除外したもの:

- `*.test.ts` / `*.spec.ts`
- `packages/presentation/test/`（8 ファイル）
- `dist/` / `node_modules/`
- `trading-test-utils.ts`（174 LOC）— ルート直下にあるが `import { vi } from 'vitest'` を持つテスト用ヘルパである

再現コマンド:

```console
$ cd packages/presentation
$ find . -name '*.ts' -not -name '*.test.ts' -not -name '*.spec.ts' \
    -not -name 'trading-test-utils.ts' \
    -not -path './test/*' -not -path './dist/*' -not -path './node_modules/*' \
    -not -path './input/*' | wc -l          # => 79
$ find . ... -exec cat {} + | wc -l          # => 10116
```

## 2. 移植元と実測 LOC

| 移植元 | ファイル数 | LOC |
| --- | ---: | ---: |
| `hud/` | 30 | 3,118 |
| `menu/` | 17 | 2,226 |
| `inventory/` | 10 | 2,190 |
| `settings/` | 5 | 915 |
| `multiplayer/` | 4 | 592 |
| `highlight/` | 3 | 305 |
| `loading/loading-screen.ts` | 1 | 185 |
| ルート直下 | 9 | 585 |
| **合計（`input/` を除く）** | **79** | **10,116** |

ルート直下の内訳:

| ファイル | LOC |
| --- | ---: |
| `trading.ts` | 181 |
| `ending-credits.ts` | 152 |
| `trading-dom.ts` | 59 |
| `dom-focus-utils.ts` | 55 |
| `fps-counter.ts` | 53 |
| `trading-styles.ts` | 32 |
| `trading.config.ts` | 22 |
| `trading-types.ts` | 17 |
| `index.ts` | 14 |
| 小計（`trading*.ts` 5 ファイルで 311） | **585** |

### plan.md の概算との照合

plan.md §3.13 の「~10k」は実測 10,116 とよく合っている。
一方で**エリア別の数字は丸められており、ルート直下の 585 LOC が抜けている**。

| plan.md §3.13 | 実測 | 差 |
| --- | ---: | --- |
| hud 3.1k | 3,118 | ほぼ一致 |
| menu 2.2k | 2,226 | ほぼ一致 |
| inventory 2.2k | 2,190 | ほぼ一致 |
| settings 0.9k | 915 | ほぼ一致 |
| multiplayer画面 0.6k | 592 | ほぼ一致 |
| loading 0.2k | 185 | ほぼ一致 |
| highlight 0.3k | 305 | ほぼ一致 |
| （記載なし） | 585 | **ルート直下が抜けている** |
| 列挙の合計 | 9,531 | |
| 実際の合計 | **10,116** | 列挙の合計より 585 多い |

抜けている 585 LOC の中身は、取引 UI（`trading*.ts`）、エンディングクレジット、
フォーカスユーティリティ、FPS カウンタである。
**エリアの合計だけを見積もると 6% 足りない。** 見積もりを立てるときはこの行を足すこと。

## 3. `packages/presentation/input/` は **mc-render** に行く（境界訂正）

| 移植元 | ファイル数 | LOC | 行き先 |
| --- | ---: | ---: | --- |
| `packages/presentation/input/` | 6 | 681 | **`mc-render`（ここではない）** |

**これは移植で最も重要な境界訂正である。**

ディレクトリ構成上は `packages/presentation/` の中にあるので、
「presentation は mx-ui」という素直な読み方だとそのまま持ってきてしまう。持ってこない。

plan.md §2.3-2:

> **実行時入力サービスは mc-render が所有。** kit は devDependency 専用のため、
> kit に入力を置くと本番ゲームから入力が消える

plan.md §3.9 の mc-render の移植元にも明記されている:

> `packages/rendering`(meshing以外、~7k)+ `packages/worker` のプール実装 + **`packages/presentation/input`(681 LOC)**

§7 の機能カバレッジ表も同じ:「実行時入力(キーボード/マウス/ポインタロック/タッチ/リマッピング) → render」。

mx-ui に来るのは**キーリマッピングの画面**（`settings/settings-overlay.ts:170-184`、DN-UI-1c）であって、
バインディングそのものではない。バインディングは mc-sim の設定状態を経由して mx-ui に届く。

`test/check-dependency-whitelist.test.ts` の
`REGRESSION: mc-render is not a parent, even though mx-ui and mc-render share a screen`
がこの境界を機械的に固定している。

なお `input/` は入力の**サービス**であって、DN-UI-4 の対になる半分
（`input-service.ts:172-178` の `window` バブルフェーズ設計）もここにある。
mx-ui に持ってこないが、**読む必要はある**。

## 4. 移植順序

### 4-1. まずテストを移植する（plan.md §6 Step 2、§8）

> 各Stepで参照実装の対応テスト・fixture・E2Eシナリオをオラクルとして移植し、
> 既知バグ(§3各所の設計注意)の再発を防ぐ

plan.md §8 のリスク表も同じことを言っている:

> 参照実装を仕様書として使い、テスト資産を各Stepで**先に**移植。ゼロから仕様を再発明しない

参照実装の DOM テスト資産の規模（実測、`input/` 除く）:

| | ファイル数 | LOC |
| --- | ---: | ---: |
| `packages/presentation/**/*.test.ts` | 63 | 10,862 |

**テストが実装とほぼ同じ量ある**（10,862 対 10,116）。
これは負担ではなく資産である。実装を書く前にこれを読めば、
参照実装が数ヶ月かけて発見した不変条件がそのまま仕様になる。

### 4-2. 移植しながら `it.effect` → `it` + `Effect.runPromise` に書き換える

**移植したテストをそのままの形で持ってこない。** DN-UI-2 の書き換えを移植と同時にやる。

参照実装の `packages/presentation/` のテスト（`input/` 除く 63 ファイル）は、実測で
15 ファイルが `it.effect` を、8 ファイルが `Effect.runPromise` を使っている。

そして **`Deferred` を使う 3 ファイルは 3 つとも `it.effect` を 1 度も使っていない** —
`menu/death-screen.test.ts` / `menu/confirm-dialog.test.ts` / `menu/main-menu-handlers.test.ts` は
全部プレーン `it` + `Effect.runPromise` である
（`grep -n 'it\.effect' ` の唯一のヒットが `confirm-dialog.test.ts:128` の**その理由を書いたコメント**）。
偶然ではなく、`confirm-dialog.test.ts:88-97` と `:128-132` に経緯が書いてある。

判断基準:

| テストが触るもの | 書き方 |
| --- | --- |
| 純粋な導出だけ（ビューモデル、字幕キュー、モーダルスタック） | `it.effect` + `Effect.sync`（現状の 5 ファイル全部がこれ） |
| **DOM イベントリスナが `Deferred` を解決する** | **プレーン `it` + `Effect.runPromise`** |

詳細と before/after のスケッチは [testing.md](./testing.md) §3。

### 4-3. エリアの順序

依存の少ない順に:

1. **`settings/`（915 LOC / 5 ファイル）** — アクセシビリティ資産 4 つのうち 3 つがここにある（DN-UI-1）。
   `domain/accessibility.ts` は既にその純粋部分を持っているので、DOM 層を足すだけで最初の画面になる。
   `settings-overlay.ts:167-168` の `aria-label` 修正と `:174-178` のクリアキーを落とさないこと。
2. **`loading/loading-screen.ts`（185 LOC / 1 ファイル）** — 最小。DOM フローのテストを初めて書く場所として適している。
   ここで DN-UI-2 の書き方を確立する。
3. **`hud/`（3,118 LOC / 30 ファイル）** — `domain/hud-view-model.ts` の消費側。
   色覚モードの `color-vision.ts` もここにある。
4. **`menu/`（2,226 LOC / 17 ファイル）** — `Deferred` を使う 3 ファイルのうち 3 つ全部がここ。DN-UI-2 の本番。
5. **`inventory/`（2,190 LOC / 10 ファイル）** — mc-sim の `InventoryService` が必要になるので、mc-sim の publish 待ち。
6. **`multiplayer/`（592 LOC / 4 ファイル）** — 画面はここ、トランスポートは mx-multiplayer（plan.md §3.14）。
7. **`highlight/`（305 LOC / 3 ファイル）** — ブロックハイライト。mc-render との境界を要確認。
8. **ルート直下（585 LOC / 9 ファイル）** — 取引 UI、エンディングクレジット、フォーカスユーティリティ、FPS カウンタ。
   `fps-counter.ts` は DN-UI-10 に触れる（時刻を引数で受け取る形に直す）。

各エリアの完了条件は plan.md §6 Step 2 の共通条件と同じ:
**テスト green + そのエリアのプレビューが単体で操作可能**（[testing.md](./testing.md) §4）。

## 5. 移植しない / 形を変えるもの

| 参照実装 | 扱い |
| --- | --- |
| `packages/presentation/input/`（6 ファイル 681 LOC） | **mc-render へ。** §3 |
| `Date.now()` / `performance.now()` の直読み（FPS カウンタ、トースト、字幕） | **時刻を引数にする形へ書き換え。** DN-UI-10 |
| `it.effect` で書かれた DOM フローテスト | **`it` + `Effect.runPromise` へ書き換え。** DN-UI-2 |
| ブロック名の名指し判定（右クリック UI ルーティング等） | mc-kernel の能力フラグ監査 §6-1 が「意味は mx-ui 側にある」としている。`interactionId` で受ける |
| `trading-test-utils.ts`（174 LOC） | テスト用ヘルパ。移植先のテスト構成に合わせて書き直す |
