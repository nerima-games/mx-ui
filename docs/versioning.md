# バージョニングと公開

出典: plan.md §6（Step 0 / Step 2 / Step 3）、§5.3、§4.1。

## 1. 現状

- **publish パイプラインが存在する（組織のツールチェーン凍結、Wave 0）。** `tsconfig.release.json` が
  `tsc -p tsconfig.release.json` で `dist/` を emit し、`package.json` の `main` / `types` / `exports` は
  `dist/` を指す。`pnpm build` → `pnpm package:verify`（packed tarball を実際にインストールして
  `exports` を検証）→ `.github/workflows/release.yaml` の publish job（`pnpm publish --no-git-checks`）が
  一直線に繋がっている。
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

**GitHub Packages**（`https://npm.pkg.github.com`、`access: public`）。パッケージが public 化されたため
（下流 CI が 403 にならないよう）`restricted` ではなく `public` を使う。

```json
"publishConfig": {
  "registry": "https://npm.pkg.github.com",
  "access": "public"
}
```

`.npmrc` に `@nerima-games:registry=https://npm.pkg.github.com` の行がある。認証トークンは
CI では `pnpm config set --location=user //npm.pkg.github.com/:_authToken` で、ローカルでは
`NODE_AUTH_TOKEN=$(gh auth token)` で渡す。

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

### mx-ui だけが抱える面倒だった話 — 決着済み、CSS ファイルは無い

**この節はもともと plan.md §5.3 / §7 を根拠に「mx-ui は CSS とフォント/アイコンを
同梱しなければならない」と書いていた。** その前提は
`application/palette-css.ts` と `application/accessibility-dom.ts` が実装される前の
scaffold 時点（2026-07-26）のもので、実装（2026-08-03）の後も更新されていなかった。
以下が実装の到達点であり、上の前提を置き換える。

**結論: mx-ui は外部スタイルシートもフォントもアイコン画像も同梱しない。全スタイリングが
`dist/` の JS そのものである。** `files` に足すディレクトリは無く、`exports` にサブパスは
要らない — [public-api.md](./public-api.md) §5 の一覧そのものが唯一の出荷物である。

理由は 3 つの独立した設計判断で、どれも「後で足す」ではなく「最初から JS 側でやる」を選んだ:

1. **色（パレット）はスタイルシートではなくカスタムプロパティを、mount された root に
   実行時に書く。** `application/palette-css.ts` 冒頭の "THE DECISION" が理由を書いている
   — 生成した `<style>` は `document.head` を要求し、それは
   [public-api.md](./public-api.md) §4-1 制約 1（`document` を自分で探しに行かない、
   複数の mx-ui インスタンスが同一ページに同居できる必要がある）に反する。
   `declarePalette(root)` が mount ごとに 1 回、23 個の `--mx-ui-*` カスタムプロパティを
   `root.style.setProperty` で書き、以後の状態変化はどの変数を参照するかを切り替えるだけで
   色そのものは書かない。
2. **レイアウトも同じ経路。** `application/*.ts` 全体が座標・grid・サイズを
   `element.style.setProperty(...)` で直接書いており（`hud-view.ts` / `slot-element.ts` /
   `crosshair-view.ts` 他）、`application/dom-surface.ts` の `DomStyle` 型が
   `setProperty` / `removeProperty` しか持たない。クラス名でスタイルを当てる経路
   （`classList` 経由の外部 CSS）はそもそも `DomElement` の契約に存在しない
   （`dom-surface.ts` の型定義コメントが `classList` を明示的に「無い」ものとして挙げている）。
3. **アイコンは画像でもアイコンフォントでもなく Unicode グリフである。** `♡ ♥`（heart）
   と `○ ●`（shank）を hollow/solid の 2 レイヤーに重ね、幅を clip して満タン/半分/空を表現する
   （`application/icon-element.ts`）。ホストページのフォントをそのまま使うので、
   同梱すべきフォントファイルが存在しない。

**DN-UI-1a の SVG `feColorMatrix` フィルタも、この節が書かれた時点では未決だったが、
実装時に決着している。** 参照実装と同じ分担を採った:
このリポジトリが決めるのは**値**（`domain/accessibility.ts` の `colorVisionMatrix` /
`colorVisionMatrixValues` / `COLOR_VISION_FILTER_COLOR_SPACE`、いずれもプレーンな JS
export）で、`<filter><feColorMatrix values="…"/></filter>` という **defs ブロックそのもの**と
それを canvas だけに効かせる CSS ルールは mc-compose 側の資産のままである
（[design-notes.md](./design-notes.md) DN-UI-1a、`application/accessibility-dom.ts` 冒頭コメント）。
mx-ui がここで defs を組み立てるには `createElementNS` が要り、
それは自分が所有していないドキュメントの中に defs ブロックを持つことになる —
`applyColorVision` が `DomAttributeTarget`（属性 1 個だけ書ける最小の受け口）しか
受け取らない理由はこれである。行列を JS で export した時点で「値を出荷物として渡す」は
すでに満たされており、渡し方として SVG マークアップを追加で出荷する必要は無い。

**検証済みの到達性。** `declarePalette` と `PALETTE_VAR` は
[public-api.md](./public-api.md) §5 のバレルから export されており、`pnpm pack` で作った
実アーカイブをインストールしてこの 2 つを呼ぶと、実際の `#rrggbb` / `rgba(...)` 文字列が
返る（`scripts/verify-package.mjs` の runtime probe と同じ形の追加確認で実測済み）。
`test-browser/dom-surface.spec.ts` の
`the palette reaches the document as VALUES › every custom property is declared on an
mx-ui root and resolves` が同じ主張を実ブラウザで固定している。

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

### 6-1. `domain/frame-contract.ts` は mc-kernel の publish で削除する

このファイルは mc-kernel の `domain/frame.ts` / `domain/identifiers.ts` / `domain/quantities.ts` の
ローカル再掲であり、**削除日が決まっている**。

```typescript
// mc-kernel が publish された時点で、これに置き換える
import type { StageRegistration } from '@nerima-games/mc-kernel'
```

`StageRegistration` とブランドの述語・エラーメッセージは**意図的に文字単位で同一**にしてあるので、
置き換えは import 文の差し替えで済む。

**この削除が MINOR で済むのは、`index.ts` がこのファイルを re-export していないからである。**
`export *` していた時期があり、その形のままだと `StageId` / `DeltaTimeSecs` / `StageRegistration` が
「所有していないパッケージの公開 API」になり、**約束済みの削除がそのまま MAJOR**に化けていた。
今は `index.ts` の末尾コメントがファイルの存在と削除予定だけを記し、名前は 1 つも出していない
（`test/public-api.test.ts` の
`REGRESSION: does not republish mc-kernel’s vocabulary as its own` が固定している）。
mc-sim / mc-render / mc-playground-kit のバレル、および mx-gameplay / mx-redstone も同じ形である。

唯一の意図的な乖離は `FrameServices` で、kernel は `ClockPort` の別名にしているが
ここでは `never` である。`ClockPort` を再掲すると kernel と同じ文字列 ID を持つ**別の**
`Context.Tag` ができてしまい、見分けがつかない 2 つのタグは狭すぎる型よりはるかに悪い。
`Effect<void, never, never>` は `Effect<void, never, ClockPort>` が欲しい場所に代入できるので、
**このファイルに対して書かれた stage は差し替え後も型検査を通り続ける**。

**このファイル以外が kernel 型を再掲することは禁止**である。
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
