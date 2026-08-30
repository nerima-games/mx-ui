# preview-screens

plan.md §3.13 が mx-ui に要求するもの——「**各画面を単体で起動できる状態モック付きプレビュー**」——である。
plan.md §6 Step 2 の完了条件は「テスト green **かつ** 内蔵プレビューが操作可能」であり、本アプリがその後半にあたる。

**これはパッケージではない。** plan.md §4.1 のとおり `apps/preview-*/` に置かれた dev アプリであり、
`index.ts` から export されず、他リポジトリから import できない。`pnpm verify` はこれを実行しない。

```console
$ pnpm preview                                    # 対話モード（HUD から）
$ pnpm preview --screen captions --captions 3     # 字幕画面を単体で起動
$ pnpm preview --stats                            # 数値レポート（下記「見つけたもの」の出所）
$ pnpm preview --once --ascii --screen hud --health 19 --width 100
$ pnpm preview --once --screen settings --color-vision protanopia --simulate
```

## 描画方式の選択：DOM ではなく端末に、ビューモデルを描く

mx-ui は 16 リポジトリ中で唯一 `lib` に "DOM" を持つ**DOM リポジトリ**である。
だからブラウザプレビューが自明な答えに見えるが、**今日の時点では違う。** 理由は 4 つ。

1. **プレビューすべき DOM コードが存在しない。** `index.ts` が export しているのは純粋な導出関数 4 つと
   stage 登録だけで、`domain/` に `document` は 1 度も現れない。
   ブラウザプレビューを作るには**まず DOM 層を書く**必要があり、それを `apps/` に書けば
   出荷されないコードのプレビューになる。プレビューがプレビュー自身を見ることになる。
2. **検証対象であるビューモデルは純粋関数である。** テストスイートが `environment: 'node'` で走るのは
   「体力 19 はハート 9 個半」が描画ではなく関数だからである（`domain/hud-view-model.ts:1-26`）。
   端末レンダラはその関数の**もう 1 つの独立した射影**であり、
   モデルについて分かったことはブラウザにそのまま移る。
3. **ブラウザプレビューはバンドラとブラウザとサーバを要求し、対価はレイアウト忠実度である。**
   レイアウトはどのビューモデルも主張していない部分である。
   `pnpm preview --once --ascii` は pipe でき、diff でき、issue に貼れる。スクリーンショットは grep できない。
4. **アクセシビリティは端末のほうが測りやすい。** コントラスト比も色覚シミュレーションも RGB 上の算術である。
   ここでやれば `--stats` が「どのモードでどの色対が潰れるか」の表を出せる。それは PR に貼れるものである。

### 失うものを明記する

このプレビューは、**ホットバーが 320px でははみ出すこと、字幕リストがクロスヘアに重なること、
フォーカスリングが無いこと、スクリーンリーダーが誤読すること**——を一切教えない。
どれも DOM の問いであり、DOM プレビューが要る。
最初の画面が書かれたとき、ブラウザプレビューは**これの代わりではなく隣に**置かれるべきである。
DOM プレビューのほうは「ビューモデルが NaN をどう畳むか、ハート列と `dead` フラグが
食い違っていないか」を決して見せてくれないからである。
（**実際にそれを見つけたのがこのプレビューである**——下記 F2。）

### 既存の保証を弱めていない

`tsconfig.build.json` は `types: []` を継承しており、`domain/` に Node のグローバルが混ざれば落ちる。
これが「mx-ui はブラウザ専用」の機械的な保証である（`tsconfig.base.json`:
「a `process.env` read must not typecheck」）。
本アプリは Node の stdio を使うので、**専用プロジェクト `tsconfig.preview.json`（`types: ["node"]`）**を持ち、
`tsconfig.build.json` には**一切触れていない**。保証は以前と同じ範囲でそのまま成立している。

## 何が見えるか

| 画面 | 駆動しているもの | 見えるもの |
| --- | --- | --- |
| `hud` | `hudViewModel` | ハート/肉/XP/ホットバー。**下に生のビューモデル値**（full/half/empty の個数、`dead`、選択 index） |
| `captions` | `receiveCaption` / `expireCaptions` / `captionLines` | 字幕行、方向矢印、`freshness`、仮想時計。`captionsEnabled` と `audioUnlocked` の非対称 |
| `settings` | `domain/accessibility.ts` 全部 | 色覚モードと `data-color-vision` 属性、フィルタ適用範囲、**色対のコントラスト表**、reduced-motion の解決、キーリマップ（衝突報告つき） |
| `inventory` | `domain/inventory-view-model.ts` + `domain/modal-stack.ts` | ホットバー / メイングリッド / クラフトグリッドの射影、**mc-sim が答えていないものが `unknown` として出ること**（防具・オフハンド・レシピ結果・合体可能スロット）、モーダルスタック、Escape の単一ハンドラ |

**Escape はこのプレビューの終了キーではない。** Escape は `domain/modal-stack.ts` が設計の中心に据えている
入力そのものなので、終了に使ってしまうと何も観察できない。終了は `x` か Ctrl-C である。

### 色覚まわりで混同してはならない 2 つの変換

- **`colorVision`（設定）** — `data-color-vision="protanopia"` を `<body>` に立て、CSS が canvas だけに
  スコープする（`COLOR_VISION_FILTER_TARGET`）。これは**補正（ダルトナイゼーション）**である。
- **`simulate`（プレビュー専用ツール、`V` キー）** — フレーム全体をその色覚特性で**見た通り**に描き直す。
  「HUD は protanopia で読めるか」に答えられるのはこちらだけである。
  ON のときは常に画面上部に `SIMULATING …` と出る。補正と取り違えたスクリーンショットは、
  スクリーンショットが無いより悪いからである。

## 見つけたもの

`pnpm preview --stats` は 2 つのリストを出す。

- **finding** — **実行時に測定**したもの。記録された期待値は 1 つも無く、直せば自動的に消える。
- **gap** — **無いもの**。走らせて測れないので、消えたことを検出できるのは**ピン留めしたテスト**だけである。
  各 gap はそのテスト名を自分で印字する。

区別は言葉遊びではない。finding は「壊れている」で、gap は「まだ書かれていない」である。
同じリストに混ぜると、前者を直しても件数が減らず、レポートが読まれなくなる。

### finding: 現在 0 件（初回実行時 4 件）

初回実行の 4 件はすべて修正され、**`test/view-model.test.ts` の assertion になっている**。
レポートは読まれなければ効かないが、テストは落ちる。

| # | 症状 | 直し方 | ピン留めしているテスト |
| --- | --- | --- | --- |
| F1 | **空スロットが耐久度を報告し続ける**。`{ itemId: undefined, count: 0, durability: 0.5 }` → `empty: true` かつ `durabilityPercent: 50`。「フィールドがあれば描く」と書いた DOM 層は**空スロットの下に耐久バーを描く**。道具が壊れた直後に到達する | `empty` ガードが 3 つ目のフィールドも消す | `REGRESSION: an empty slot reports NO durability — every field goes, not just the obvious two` |
| F2 | **NaN 体力で「空のハート列 + `dead: false`」になる**。`clamp` は `Math.min/Math.max` なので NaN を素通しし、`dead` は別式で `NaN <= 0` は false。**列は「体力ゼロ」と言い、フラグは「生存」と言う** | `clamp` を NaN 安全にし（NaN → 下限）、`dead` をハート列と**同じクランプ済みの値**から導出する。throw にはしない——DN-UI-7 がクランプを選んだ理由（バージョン境界）はそのまま生きている | `REGRESSION: NaN is clamped like any other bad value…` / `REGRESSION: NaN health makes the heart row and the \`dead\` flag agree` |
| F3 | **NaN の `selectedHotbarIndex` でどのスロットも選択されない**。同じ穴が別のフィールドで出る | F2 と同一の修正。NaN は -1 と同じく下限（スロット 0）になる | `REGRESSION: a NaN selected index still selects a slot, exactly as 9 and -1 do` |
| F4 | XP バーが 1 レベル早く 100% になる。`Math.round(0.999)` が 1 | `Math.floor`。隣のレベル表示と矛盾しない向きにだけ倒す | `REGRESSION: the XP bar does not read 100% one level early` |

同じ根（`clamp` が NaN 安全でない）から、レポートには出ていなかった 3 件も一緒に閉じた:
`count: NaN` が文字列 `"NaN"` として描かれる、`experienceLevel: NaN` が同じく `"NaN"` になる、
`maxHealthPoints: Infinity` が `Array.from({ length: Infinity })` で **RangeError を投げる**。
最後の 1 件は DN-UI-7 が唯一許していない結果である。

**F1〜F4 は既存の 20 本のビューモデルテストが 1 つも捕まえていなかった。**
どれも「境界を越えて来る値」に関するもので、テストは妥当な入力を渡すからである。

### gap: 1 件（かつて 2 件）

| # | 無いもの | 状態 |
| --- | --- | --- |
| ~~G1~~ | ~~mx-ui が色を 1 つも定義していない~~ | **閉じた。** `domain/palette.ts` がトークンを持ち、保証を宣言し、`surveyPalette()` がそれを測る。§5 の表は**このプレビューが発明した色ではなくパレットそのもの**を測っており、同じ導出を `test/view-model.test.ts` が assert している。下記「調査が見つけたもの」 |
| ~~G2~~ | ~~インベントリ／クラフトにビューモデルが無い~~ | **閉じた。** `domain/inventory-view-model.ts`。mc-sim の `Inventory` / `Slot` / `ItemStack` を `@nerima-games/mc-sim` から直接 import し（Wave 1, W1-M7 でミラーを撤去）、全スロットをホットバーと**同じ `slotView()`** で射影する。mc-sim が所有する問い（スタッキング・レシピ）は `unknown` を返す |
| **G1** | **パレットに消費者が無く、mc-sim にレシピモデルが無い** | 前より狭い。トークンを CSS にする層がまだ無いので保証は数値については証明済み・画面については未証明であり、`CraftingSnapshot.result` は mc-sim にレシピが無いので実際 `unknown` である。**どちらも本リポジトリの中では閉じられない** |

### 調査が見つけたもの — 参照実装の自動保存インジケータ

パレットを置くにあたって、値は参照実装から掘った（`index.html` と `packages/presentation/**`。
実測で生の色リテラルは `packages/presentation` だけで約 460 個、色のカスタムプロパティは 2 つだけ）。
**掘ってから測ったら 1 件出た。**

`index.html:159` は保存成功のインクを `#d7f7c2`、`:212` は**保存失敗**を `#ffd6d2` にしている。
シミュレートすると protanopia で **12**、deuteranopia で **22** しか離れていない（潰れ閾値 24）。
**赤緑色覚特性のプレイヤーは「保存しました」と「保存に失敗しました」を区別できない。**

参照実装の e2e アクセシビリティゲート（`e2e/ui/accessibility.e2e.ts`）には**構造上見えない**。
テキストノードの色を**自分の背景**と比べるだけで、**ある状態と別の状態**は比べないからである。
同じ穴で、ハート・肉・XP・選択スロットという意味を担う色は 1 つも検査されていない（塗りでありテキストではない）。

`domain/palette.ts` は輝度のはしご（OK 0.85 / BUSY 0.57 / ALERT 0.29）で直している。
二色覚は色相を圧縮し輝度はおおむね保存するので、**輝度で分けた集合は構成上生き残る**。
`HEART` と `ICON_EMPTY` も、参照実装の値がコントラスト下限に届かなかったので動かしてある。詳細は DN-UI-11。

### 補正行列をここに置いた理由（G1 の前半）

**スイッチだけを引き継ぐと、後ろに何も無いフックが残る。** `data-color-vision="protanopia"` は
CSS が指す先があって初めて意味を持ち、その先＝行列は参照実装の `index.html` にあった。
plan.md §3.13 の「引き継ぐ」は半分では満たされない。

- **このリポジトリがアクセシビリティを所有している。** canvas を所有するのは mc-render だが、
  設定を所有してはいない。置き場が無いままだと、最初にスタイルシートを書いた人が別の値を再導出する。
- **行列は算術なので、ここでならテストできる。** 参照実装ではマークアップだったので 1 度も検査されていない。
  `applyColorVisionMatrix` は他の導出と同じく `environment: 'node'` で走る。

**シミュレーションと取り違えないこと。** `apps/preview-screens/ansi.ts` の行列は
Viénot–Brettel–Mollon の**シミュレーション**（プレイヤーに何が見えるか）であり、
`domain/accessibility.ts` の行列は**補正**（何を描き直すか）である。入れ替えると、
設定が直そうとしている当のものを壊す。

## 制約

- `apps` は `SCAN_ROOTS` に入っている（`scripts/check-dependency-whitelist.ts`）。
  したがって import は他のソースと同様にゲートされる。**依存は 0 個**——色ライブラリすら足していない。
- **このディレクトリは色を 1 つも定義しない。** `apps/preview-screens/palette.ts` は
  `domain/palette.ts` へのエイリアスだけで、値は 1 つも持っていない。
  コントラスト・輝度・シミュレーションの算術も `domain/palette.ts` にあり、
  `ansi.ts` はそれを import する。**保証の算術が dev アプリにあるとテストにできない**からで、
  同時に「1 つの導出を 2 か所に置くとやがて食い違う」（DN-UI-7c）を避けている。
- `Date.now()` / `new Date()` / `performance.now()` 禁止も適用される。
  **エスケープハッチ (`mc-kernel-allow-time-source`) は使っていない。**
  時計は `state.ts` の中の数値で、キー入力だけが進める。
  これは横着ではなく、`domain/caption.ts` が「時刻を尋ねない」設計だからである（`:25-35`）——
  壁時計で字幕を expire させるプレビューは、出荷されるモジュールとは別のものを見ていることになる。
  副産物として、3 秒の寿命を 3 秒待たずに 0.25 秒刻みで観察できる（`t` / `T` キー）。
- 型検査は `tsconfig.preview.json`。`tsconfig.build.json` は**触っていない**。
- `--ascii` は色を落とすだけでなく**字形も差し替える**。色の無い出力で情報が落ちてはならないので、
  耐久バーは `#`/`.`、選択スロットの枠は `=`（非選択は `-`）になる。
  ハート・肉のアイコンが最初から 3 つの**字形**なのも同じ理由である。
