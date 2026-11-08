# バージョニングと公開

出典: plan.md §6（Step 0 / Step 2 / Step 3）、§5.3、§4.1。

## 1. 現状

- **publish パイプラインが存在する。** `tsconfig.release.json` が
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

mount 面は実装済みだが、mc-compose が実際に消費してゲームを起動したという事実はまだない。
したがって、机上で 1.0.0 を切る根拠は無い。

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

`.npmrc` に `@nerima-games:registry=https://npm.pkg.github.com` の行がある。認証トークンは、
CI では workflow の `GITHUB_TOKEN` を `NODE_AUTH_TOKEN` として渡し、次のコマンドで設定する。
`pnpm config set --location=global //npm.pkg.github.com/:_authToken "$NODE_AUTH_TOKEN"`
ローカルでは GitHub Packages 用トークンを `~/.npmrc` の
`//npm.pkg.github.com/:_authToken` に設定する。

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

## 4. build / publish パイプライン（実装済み）

`package.json` を正とする現行の出荷面は次の通り:

1. `pnpm build` uses `tsconfig.release.json` to generate `dist/`
2. `main`, `types`, and `exports["."]` point to `dist/index.js` and `dist/index.d.ts`, respectively
3. `exports` publishes the root JavaScript and declarations plus `./assets/game-font.css`
4. `files` includes `dist`, `assets`, `LICENSE`, and `README.md`. `assets` contains the stylesheet, font, and font license; `docs/` is excluded
5. `pnpm package:verify` checks the packed tarball's export targets and font assets, then installs it in a consumer and verifies the root API at runtime and during type checking
6. The publish job in `.github/workflows/release.yaml` publishes to GitHub Packages

When updating the package, check the implementation in `package.json`, `scripts/verify-package.mjs`, and the workflow.
Do not duplicate the current package or dependency versions in this document.

### UI assets and DOM styling

The package includes the game UI font stylesheet, `PixelMplus12-Regular.ttf`, and the M+ Fonts license file in `assets/`.
Loading the stylesheet from the `@nerima-games/mx-ui/assets/game-font.css` package export applies the font to `[data-mx-ui]` elements.
Importing the root API does not load the stylesheet.

The stylesheet only declares the font face and UI font stack.
mx-ui continues to write palette values and layout through inline styles on the root and its elements, and it renders icons with Unicode glyphs.

The stylesheet and JavaScript have separate roles:

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
3. **Icons use Unicode glyphs.** `application/icon-element.ts` overlays hollow and solid `♡ ♥` (heart) and `○ ●` (shank) glyphs, then clips their width to show full, half, or empty states.
   UI text can use the bundled PixelMplus12 font; the icons do not need separate image assets.

`domain/accessibility.ts` owns the color-vision correction matrices.
`createColorVisionFilterController(root, target)` creates per-instance SVG filter definitions inside the mount root and applies an inline filter and `data-color-vision` attribute only to the supplied canvas.
`off` and `dispose()` restore the canvas attribute and inline filter captured when the controller was created.
This does not require another stylesheet asset.

`pnpm package:verify` checks the stylesheet export and font and license files in the package archive.
It also installs the packed package into a temporary consumer and verifies the root API's runtime and type exports and palette functions.
`test-browser/dom-surface.spec.ts` の
`the palette reaches the document as VALUES › every custom property is declared on an
mx-ui root and resolves` が同じ主張を実ブラウザで固定している。

## 5. ここでの「破壊的変更」の定義

| 変更 | 破壊的か |
| --- | --- |
| `StageRegistration` の形、`makeUiStages` / `makeUiFrameState` のシグネチャ | **はい** |
| `UI_STAGE_IDS` / `UPSTREAM_STAGE_IDS` の値の変更・削除 | **はい**（mc-compose の順序表が名前で参照する） |
| Changes to the `UiMount` / `UiMountOptions` / `makeUiMount` host integration contract | **Yes** |
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
