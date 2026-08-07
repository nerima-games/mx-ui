# バージョニングと公開

出典: plan.md §6（Step 0 / Step 2 / Step 3）、§5.3、§4.1。

## 1. 現状

- **バージョン: `0.3.8`。**
- **publish パイプラインは無い。** `package.json` の `exports` は TypeScript ソースを直接指しており、
  `tsconfig.base.json` は `noEmit: true`。したがって `dist/` は存在しない。
- **実行時依存は `effect` と `@nerima-games/mc-kernel@0.2.18`。** mc-sim と mc-audio はまだ
  `dependencies` に無く、未publish パッケージを依存に追加しない方針は維持する（§3）。
- 開発中は `mc-dev-meta` workspace による `workspace:*` 解決でモノレポ同等の DX を得る（plan.md §6 Step 0-2）。

## 2. 0.x に留める方針

**mc-compose が実際にこの契約を消費するまで、`0.x` から出ない。**

`1.0.0` は**機能が揃ったという宣言ではなく、界面が使われたという宣言**である。
mx-ui の場合それは具体的に「mc-compose が `makeUiStages` を stage 順序表に組み込み、
mount 面（[public-api.md](./public-api.md) §4-1）でルート要素を渡し、
それで実際にゲームが起動した」という事実を指す。

現状 mount 面は存在すらしていないので、机上で 1.0.0 を切る根拠が無い。

plan.md §6 Step 3(歴史的な記録。当時の「APIロック4週間無変更」ゲートは
その後 API_STANDARD.md §4 / RELEASE_STANDARD.md §4 により廃止され、
maintainer の裁量判断に置き換えられている):

> 界面が安定した(APIロック4週間無変更)リポジトリから GitHub Packages 等へ npm 公開 + changesets 運用に切り替え。
> それまでは dev-meta workspace 統合で開発。

plan.md §8 のリスク表も同じことを別角度から:

> **新規構築初期は全界面が高churn** → npm公開を遅らせ dev-meta workspace で開発。bump連鎖を構造的に回避

## 3. 公開先とボトムアップ publish-then-pin

### 公開先

**GitHub Packages**（`https://npm.pkg.github.com`、`access: restricted`）。
`package.json` の `publishConfig` に設定済みだが、**publish 自体はまだ実行されない**。

```json
"publishConfig": {
  "registry": "https://npm.pkg.github.com",
  "access": "restricted"
}
```

`.npmrc` にレジストリ設定は入っていない。現在の `.npmrc` は `fast-check` / `pure-rand` の
hoist 設定だけであり、`@nerima-games:registry=` の行と認証トークンの受け渡しは
publish パイプラインを追加するときに足す。

### 構築順（plan.md §6 Step 2）

```
kernel
  → noise / meshing / physics / save / audio （相互独立、並行可）
  → worldgen
  → sim
  → render
  → kit
  → gameplay / redstone （並行可）
  → ui
  → multiplayer
  → compose
```

**mx-ui はこの順序の遅い方にいる。** 結果として 1 つ良いことがある:
**mx-ui は安定した mc-sim を消費することになり、mc-sim と一緒に揺れずに済む。**

mc-sim は plan.md §8 が「依存ハブでありAPIが揺れる」とリスクに挙げているリポジトリで、
mx-ui が着手する頃には mc-render と mx-gameplay / mx-redstone が先に消費して界面を固めている。
mx-ui は最初の消費者ではない。

それまでは `mc-dev-meta` の `workspace:*` 解決で開発する（plan.md §6 Step 0）。
**旧来の「API ロック 4 週間無変更で凍結」という日数計測ベースの自動ゲートは廃止された。**
`1.0.0` への昇格は自動化された指標や計測期間による代替ゲートを設けず、maintainer(take)による
裁量判断のみで行う(RELEASE_STANDARD.md §4.2)。判断材料は「上位階層である mc-compose が
実際にこの契約を消費し、動作確認を終えたか」であり、それを踏まえて maintainer が 1.0.0 昇格の
changeset(`major` bump)を書く運びになる。

## 4. build / publish パイプラインは完成時に追加する

完成条件（[testing.md](./testing.md) §4）に到達した時点で追加する:

1. `tsconfig.build.json` を emit ありに変更し、`dist/` を生成する
2. `package.json` の `main` / `types` / `exports` を `dist/` に向ける
3. `files` を差し替える
4. GitHub Actions に publish job を追加する（tag push トリガ）
5. changesets を導入する

**先にやらない理由**: ビルド成果物を介すと型エラーがビルド時にしか出なくなり、
16 リポジトリを 1 つの workspace で開発している間の DX が落ちる。

### mx-ui だけが抱える面倒 — アセットが JS ではない

**他の 2 つの体験モジュールに無い問題が mx-ui にはある。** plan.md §5.3:

> 独立アセットリポジトリ → アセットは消費者に同梱（テクスチャ→render、音声→audio）

§7 の対応表は 3 つ目を挙げている:「アセットファイル → 消費者に同梱（render / audio / **ui**）」。

mx-ui が同梱することになるのは **CSS とフォント / アイコン**である。
つまり `tsc` の出力だけでは `dist/` が完成しない。具体的に効いてくるのは:

- **`files`**: 現在は `["index.ts", "domain", "stages", "tsconfig.base.json", "LICENSE", "README.md"]`。
  スタイルシートとアセットのディレクトリを足す必要がある。
  **これを忘れると、publish は成功して消費者側でスタイルだけが消える** — 最も気づきにくい壊れ方である。
- **`exports`**: JS の入口に加えて `"./styles.css"` のようなサブパスが要る。
  `exports` を書いた時点でサブパスは列挙式になるので、書き忘れたファイルは import 不能になる。
- **ビルドパイプライン**: `tsc` 以外の何か（CSS のバンドル / コピー）が要る。
  16 リポジトリのうち**ここだけ**である。

DN-UI-1a の SVG `feColorMatrix` フィルタも同じ系統の資産である。
参照実装ではフィルタ定義が `index.html` に置かれていた
（`packages/presentation/hud/color-vision.ts:1-3`）。
`index.html` は mc-compose の資産なので、mx-ui は
**フィルタ定義を出荷物として渡す形**に設計し直す必要がある。今は未決である。

## 5. ここでの「破壊的変更」の定義

| 変更 | 破壊的か |
| --- | --- |
| `StageRegistration` の形、`makeUiStages` / `makeUiFrameState` のシグネチャ | **はい** |
| `UI_STAGE_IDS` / `UPSTREAM_STAGE_IDS` の値の変更・削除 | **はい**（mc-compose の順序表が名前で参照する） |
| 将来の mount 面 | **はい** |
| ビューモデルの型・`iconRow` の戻り値 | いいえ |
| 字幕キューの内部・`MAX_VISIBLE_CAPTIONS` の値 | いいえ |
| モーダルスタック・アクセシビリティ関数 | いいえ |
| 画面そのものの内部構造 | いいえ |

**下段が「可視だが公開ではない」が買っているものである**（[public-api.md](./public-api.md) §6）。
mc-compose はこれらを使わない。使わないものを変えても mc-compose は壊れないので、MINOR bump で済む。

これは mx-ui の性質上ありがたい。**変更頻度が最も高いのは画面の中身**であり、
そこが公開 API に入っていたら bump が止まらなくなる。

`UI_STAGE_IDS` が破壊的変更の側にいるのは、mc-compose の順序表が
`'ui:hud-sync'` という**文字列**で mx-ui を参照するからである。
文字列は import ゲートに見えない（DN-UI-8）が、消費者からは見える。

## 6. 型が置き換わる 2 か所

### 6-1. mc-kernel の frame 契約は直接 pin する

mc-kernel の frame 契約のローカル再掲は削除済みであり、mx-ui の実装とテストは
`@nerima-games/mc-kernel@0.2.18` の `StageId`、`DeltaTimeSecs`、`StageRegistration`、
`GameModule`、`FrameServices` を直接参照する。

`FrameServices` は kernel の `ClockPort` である。テストでは kernel の `FixedClockLayer` に
`MonotonicTimeSecs(0)` と `EpochMillis(0)` を渡し、空の環境で契約を隠すことなく決定的な時計を提供する。
kernel の語彙は mx-ui の barrel から再公開しないため、所有していない型の削除を mx-ui の破壊的変更にしない。

**ローカルファイルで kernel 型を再掲することは禁止**である。
例えば `BlockType` の 2 つ目のローカルコピーは代替ではなく語彙のフォークであり、
kernel の存在意義（語彙の home は 1 つ、plan.md §3.1）が消える。

### 6-2. `InputAction` は mc-render の型に置き換わる

`domain/accessibility.ts` の `InputAction` union（`moveForward` 〜 `chat` の 10 個）は暫定である。
権威あるアクション一覧は実行時入力サービスと一緒にあり、それは mc-render にある（plan.md §2.3-2、§3.9）。

**これは mx-ui が非親リポジトリから型を受け取る唯一の場所になる。**

矛盾していない。届き方が違うからである:

```
mc-render （バインディングの正）
   ↓ 設定として保存
mc-sim.SettingsService （mx-ui の親）
   ↓ 読む
mx-ui （リマップ画面）
```

**新しい依存エッジは生まれない。** mx-ui は mc-render を import せず、
mc-sim の設定状態を通してアクション型を受け取る。
`test/check-dependency-whitelist.test.ts` の
`REGRESSION: mc-render is not a parent, even though mx-ui and mc-render share a screen`
がこの境界を固定しており、置き換えの際もこのテストは落ちてはならない。

## 7. bump の判断基準

`0.x` の間:

| 変更 | bump |
| --- | --- |
| §5 の「破壊的」に該当 | MINOR（`0.1.0` → `0.2.0`） |
| §5 の「破壊的でない」に該当、機能追加 | MINOR |
| バグ修正・ドキュメント | PATCH |

`1.0.0` 以降は通常の semver に切り替える。その前提条件は §2 の通り
「mc-compose が実際に消費した」であって、画面が全部揃ったことではない。
