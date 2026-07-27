# 参照実装 DOM ユニットテスト 63 ファイルの triage

[testing.md](./testing.md) §4 の完成条件 2 は「参照実装の DOM テスト資産
（63 ファイル / 10,862 LOC、`input/` 除く）をオラクルとして移植」である。
この文書は **63 ファイルを 1 つずつ判定したもの**である。

`docs/e2e-triage.md`（mc-compose）が E2E 70 本に対してやったことと同じで、
理由も同じである。**部分的な移植より、完全な triage のほうが価値がある。**
どれが今できて、どれが画面待ちで、どれが新アーキテクチャで意味を失ったかが
分かっていれば、画面が 1 つ建つたびに「次はこれ」が引ける。

**これは `docs/e2e-triage.md` とは別の資産である。** あちらは Playwright E2E 70 本
（43 本を降ろし、うち 39 本が mx-ui 行き）。こちらは `packages/presentation/**` の
**ユニットテスト**で、量にして 10 倍あり、今まで誰も triage していなかった。

## 0. 数え方（再現可能）

**[porting.md](./porting.md) §4-1 の 63 ファイル / 10,862 LOC は実測と一致した。**
このリポジトリは「間違った測り方で正当化された数字」を 6 件記録しているので、
引き写さずに取り直した。取り直した結果、今回は動かす必要が無かった。

```console
$ cd <reference-impl>/packages/presentation
$ find . -name '*.test.ts' -not -path './input/*' | wc -l
63
$ find . -name '*.test.ts' -not -path './input/*' -print0 | xargs -0 wc -l | tail -1
 10862 total
```

**10,862 は `wc -l` の生の行数で、空行とコメント行を含む。** 内訳を測ると:

| 測り方 | 行数 |
| --- | ---: |
| `wc -l`（porting.md §4-1 が載せている数字） | **10,862** |
| 空行を除く | 9,400 |
| 空行と行頭コメント（`//` `/*` `*`）を除く | **9,188** |

差は 1,674 行（15%）である。**規模の議論には 10,862 を使ってよい**が、
「実装 10,116 LOC とほぼ同量」（porting.md §4-1）という比較は
**両辺とも `wc -l` なので成立している**。片辺だけコード行数に直すと崩れる。

### 本数は 456 本で、ファイル数からは推測できない

triage の単位はファイルだが、重みはテスト本数で見る必要がある。

```console
$ find . -name '*.test.ts' -not -path './input/*' -print0 \
    | xargs -0 grep -hcoE "^\s*(it|test)(\.[a-zA-Z]+)?\(" | paste -sd+ | bc
456
```

`it.effect` だけを数えると **128 本しか見えない**。実際には
`it(` 252 / `it.scoped(` 139 / `it.effect(` 128 / `it.each(` 1 で、
**`it.scoped` が 3 割を占める**。`grep 'it.effect'` で規模を測ると
`hud/hotbar-three.test.ts`（775 LOC / 27 本）や
`settings/settings-overlay-sync.test.ts`（11 本）が
**0 本のファイルに見える**。porting.md §4-2 の「15 ファイルが `it.effect` を使う」は
`it.effect` に限れば正しいが、書き換え対象の総量としては足りない。

分布は極端である。上位 5 ファイル（`inventory-renderer` 28 / `hotbar-three` 27 /
`debug-overlay-utils` 20 / `crosshair` 19 / `main-menu-handlers` 17）で 111 本、
全体の 24% を占める。

## 1. 判定の語彙

| 判定 | 意味 |
| --- | --- |
| **PORTABLE-NOW** | 今日 mx-ui の中だけで書ける。移植先を列に書く |
| **NEEDS-SCREEN** | 主張は mx-ui のものだが、**その画面／モジュールがまだ無い**。何が要るかを書く |
| **ELSEWHERE** | mx-ui のものではない。所有者（mc-render / mc-sim / mx-multiplayer）を書く |
| **ANSWERED-DIFFERENTLY** | **mx-ui が構造的に別の答えを出しており、主張がそのままでは成立しない。** DN 番号を書く |
| **NO-CLAIM** | 守っているものが無い（レイヤ供給、`should be defined`、カバレッジ稼ぎ） |

判定はファイル単位の**主**判定である。混在するファイルは主判定を書き、
分かれ方を理由の列に書いた。

## 2. 集計

| 判定 | ファイル | 本数 | 本数の割合 |
| --- | ---: | ---: | ---: |
| PORTABLE-NOW | **8** | 71 | 16% |
| NEEDS-SCREEN | **29** | 176 | 39% |
| ELSEWHERE | **19** | 135 | 30% |
| ANSWERED-DIFFERENTLY | **6** | 68 | 15% |
| NO-CLAIM | **1** | 6 | 1% |
| **合計** | **63** | **456** | |

### この集計の一番重要な結論

**mx-ui に来ないものが 25 ファイル / 203 本（45%）ある。**
ELSEWHERE 19 + ANSWERED-DIFFERENTLY 6 で、
「63 ファイルを移植する」を目標に置くと**半分近くが行き場のない作業になる**。
porting.md §4-3 のエリア順は移植の順序としては正しいが、
`highlight/`（5 ファイル 37 本）と `inventory/` の大半は
**順番の問題ではなく所有者の問題**である。

**NEEDS-SCREEN が 29 ファイル / 176 本で最大である。**
これは失敗ではなく、このリポジトリの残作業がそのまま出ている。
settings（3 ファイル 28 本）が porting.md §4-3 で 1 番目に来ているのに
まだ無いこと、debug overlay が 5 ファイル 37 本あることが、次にやる価値の順に読める。

**PORTABLE-NOW は 8 ファイル / 71 本しかない。** そのうち 5 ファイル分は
**既に守られている**（crosshair / main-menu / loading の既存オラクル）。
今回新しく移植したのは 11 本で、内訳は §4 にある。

## 3. 判定表

### 3-1. PORTABLE-NOW（8 ファイル / 71 本）

| 参照実装のファイル | 本 | 移植先 | 理由 |
| --- | ---: | --- | --- |
| `hud/crosshair.test.ts` | 19 | `test/crosshair.test.ts`（**済**） | 19 本中 18 本は既存オラクルが持っている。`pulse` の 3 本は DN-UI-10 で「時刻は引数」に書き換え済み。**残る 1 本「should preserve the current HUD scale after pulse reset」は HUD スケールが mx-ui に無いので NEEDS-SCREEN**（下記 `hud-scale`） |
| `test/sound-captions.test.ts` | 9 | `test/caption-oracle.test.ts`（**今回 7 本**） | **欠陥を 1 件出した。** §5 |
| `loading/loading-screen.test.ts` | 12 | `test/loading-screen.test.ts`（**今回 4 本**） | 12 本中 7 本は SSR ガードとレイヤ供給で NO-CLAIM 相当。「showError は textContent で描き HTML を注入しない」は生きており、mx-ui では**構造的に強い形**になる（§4） |
| `inventory/inventory-renderer-helpers.test.ts` | 10 | `domain/inventory-view-model.ts` | `getSlotColor` の未知ブロック既定、`collectAvailableCounts`、`getSlotImageStyle` の AIR→null。DN-UI-12 の `unknown` 射影と同じ問い。**未移植** |
| `menu/main-menu-utils.test.ts` | 9 | `domain/main-menu.ts` | `generateWorldId` の重複しないこと、`formatLastPlayed` の不正日付フォールバック。**`cycleGameMode` の 3 本は移植できない** — 下記 §6-2 |
| `menu/main-menu-dom.test.ts` | 5 | `application/main-menu-view.ts` | 「必須要素が欠けたら undefined」「壊れたセーブ行の削除リカバリ」。**壊れたセーブ行は mx-ui に表現が無い**（`unknown` はあるが `corrupt` は無い）。クリック挙動の 2 本は DN-UI-4。**未移植** |
| `menu/main-menu.test.ts` | 5 | `test/main-menu.test.ts`（**済**） | `MainMenuChoice` が**値**であること（newWorld が worldId/mode/seed を運ぶ）は既存オラクルの「遷移は値であってリスナではない」がそのまま。`multiplayer` の 1 本は画面が無い |
| `inventory/inventory-renderer-dom.test.ts` | 2 | `application/slot-element.ts`（**一部済**） | 「dataset index と基本スタイルを持つスロット要素」は `slot-element.ts` が持っている。オーバーレイ DOM の append 挙動は `test/screen-mount.test.ts` の親=引数と重なる |

### 3-2. NEEDS-SCREEN（29 ファイル / 176 本）

| 参照実装のファイル | 本 | 何が要るか |
| --- | ---: | --- |
| `settings/settings-overlay-sync.test.ts` | 11 | **設定画面。** porting.md §4-3 が 1 番目に置いているもの。アクセシビリティ資産 4 つのうち 3 つがここ（DN-UI-1）。フォーカス系の 2 本は DN-UI-4 |
| `settings/settings-overlay-toggle.test.ts` | 11 | 同上。11 本中 5 本が Tab / Escape / focus で DN-UI-4 に当たる |
| `settings/settings-overlay.test.ts` | 6 | 同上。「音量スライダに読めるパーセント名を付ける」は生きた主張 |
| `test/debug-overlay-utils.test.ts` | 20 | **デバッグオーバーレイ。** `facingFromYaw` / `formatNumber` は純粋導出で、画面が建てば `domain/` に直行する |
| `hud/debug-overlay.test.ts` | 11 | 同上。`facingFromYaw` の 5 本は上と重複している |
| `hud/debug-overlay-dom.test.ts` | 2 | 同上。Escape で検索欄をクリアするのは DN-UI-1c と同じ形 |
| `hud/debug-overlay-metrics.test.ts` | 2 | 同上 |
| `hud/debug-overlay-panel-state.test.ts` | 2 | 同上 |
| `fps-counter.test.ts` | 15 | **FPS カウンタ。** DN-UI-10 で「時刻を引数」に書き換えが要る（porting.md §5）。`Effect.Metric` gauge の 3 本は計測基盤の問題 |
| `test/multiplayer/chat-panel.test.ts` | 10 | **チャット画面。** トランスポートは mx-multiplayer、画面はここ（plan.md §3.14） |
| `test/multiplayer/connection-panel.test.ts` | 9 | 同上 |
| `test/multiplayer/player-list-panel.test.ts` | 4 | 同上 |
| `menu/confirm-dialog.test.ts` | 10 | **確認ダイアログ。** DN-UI-2 の出典そのもの（`:88-97` `:128-132`）。**移植すると DN-UI-4 と正面衝突する**（§6-1） |
| `trading.test.ts` | 8 | **取引画面。** mc-sim の取引モデル待ちでもある |
| `trading-edge-cases.test.ts` | 8 | 同上 |
| `inventory/inventory-renderer-refresh.test.ts` | 8 | **レシピブック。** ツールチップと持ち手カーソルは今日書けるが、レシピ検索と「作れないものを暗くする」は mc-sim の `Recipe` 待ち（testing.md §4） |
| `menu/pause-menu-achievements.test.ts` | 5 | **実績パネル。** `ScreenId` に `achievements` はあるがレンダラが無い。実績レジストリ自体は mc-sim |
| `menu/pause-menu-dom.test.ts` | 2 | **ポーズメニュー** |
| `menu/death-screen.test.ts` | 4 | **死亡画面。** `hud-view.ts` に `deathHidden` はあるが画面は無い |
| `menu/death-screen-dom.test.ts` | 2 | 同上 |
| `hud/controls-hint.test.ts` | 4 | **操作ヒント。** 30 秒自動非表示は DN-UI-10 で継続時間に書き換え |
| `hud/damage-overlay.test.ts` | 4 | **被弾オーバーレイ** |
| `hud/achievement-toast.test.ts` | 1 | **実績トースト。** 775 LOC 中 1 本。キュー drain がタイマー依存で DN-UI-10 |
| `test/weather-visibility.test.ts` | 5 | **天候表示。** `classList` は面に無いので `hidden` / 属性で建て直す |
| `test/hud-visibility.test.ts` | 4 | **HUD 全体の表示切替（F1）。** `hud-view.ts` に無い。`classList` ではなく属性で |
| `hud/hotbar-responsive.test.ts` | 3 | **HUD スケール。** mx-ui に概念ごと無い（§6-3） |
| `hud/hud-scale.test.ts` | 1 | 同上 |
| `hud/screenshot-key.test.ts` | 3 | **スクリーンショット。** ファイル名整形は純粋（DN-UI-10）、`triggerDownload` の anchor クリックは面に無い動詞 |
| `test/ending-credits.test.ts` | 1 | **エンディングクレジット** |

### 3-3. ELSEWHERE（19 ファイル / 135 本）

| 参照実装のファイル | 本 | 所有者 | 理由 |
| --- | ---: | --- | --- |
| `hud/hotbar-three.test.ts` | 27 | **mc-render** | THREE.js の renderer / camera / material。`document` と `window` をトップレベルで差し替えている |
| `inventory/inventory-cursor-click.test.ts` | 11 | **mc-sim** | 持ち手スタックの取得・配置・統合・交換。**インベントリの変更**であって射影ではない（DN-UI-12「射影しかしない。解釈はしない」） |
| `inventory/inventory-renderer-recipe.test.ts` | 9 | **mc-sim** | かまど・レシピの経路。plan.md §2.3-1 |
| `highlight/block-highlight-qa-override.test.ts` | 9 | **mc-render** | raycast とワイヤフレームメッシュ |
| `inventory/inventory-renderer-craft-action.test.ts` | 6 | **mc-sim** | `craft` の呼び出しと戻り |
| `test/attack-swing.test.ts` | 6 | **mc-render** | 一人称の腕の姿勢。イージングは純粋だが持ち主は held-item |
| `highlight/block-highlight.test.ts` | 15 | **mc-render** | `THREE.LineSegments` / `EdgesGeometry` |
| `highlight/block-highlight-update.test.ts` | 7 | **mc-render** | 同上 |
| `hud/hotbar-count-badge.test.ts` | 5 | **mc-render** | canvas に数字を描く。**ただし「1 個のときバッジを出さない」だけは mx-ui のもので、`hud-view-model.ts:209` が既に持っている**（`count <= 1 ? undefined`） |
| `crafting-grid.test.ts`（`inventory/`） | 5 | **mc-sim** | 定形レシピ照合と消費 |
| `hud/touch-controls.test.ts` | 5 | **mc-render** | `keydown` / pointer のリスナと解除。porting.md §3 |
| `hud/input-guidance.test.ts` | 5 | **mc-render** | `matchMedia` による入力能力判定 |
| `hud/hotbar-three-state.test.ts` | 5 | **mc-render** | THREE のスナップショット差分。**差分で描くという主張自体は DN-UI-13d として `test/hud-view.test.ts` が持っている** |
| `hud/first-person-held-item.test.ts` | 4 | **mc-render** | scene / camera の同一性と dispose |
| `inventory/inventory-renderer-click-handler.test.ts` | 4 | **mc-sim** | shift クリックの移動先優先順位 |
| `highlight/block-highlight-fluid.test.ts` | 3 | **mc-render** | 水中カメラの voxel 経路 |
| `highlight/block-highlight-integration.test.ts` | 3 | **mc-render** | 同上 |
| `inventory/inventory-renderer-crafting.test.ts` | 3 | **mc-sim** | `getChunk` で作業台・かまどを探す |
| `hud/touch-controls-styles.test.ts` | 3 | **mc-render** | スタイルシート id と coarse-pointer ゲート |

### 3-4. ANSWERED-DIFFERENTLY（6 ファイル / 68 本）

**mx-ui が構造的に別の答えを出しているもの。移植すると既存の保証と衝突する。**

| 参照実装のファイル | 本 | DN | mx-ui の答え |
| --- | ---: | --- | --- |
| `inventory/inventory-renderer.test.ts` | 28 | **DN-UI-4** | 「Enter と Space でセルを起動」「Tab をインベントリ内に閉じ込める」「前のフォーカスを復元」。**`application/dom-surface.ts` に `addEventListener` も `focus()` も無い。** 記録済みの矛盾（スロットに `role="button"` を付けず focusable にもしない）はこのファイルが出所である。`sortInventory` は mc-sim |
| `menu/main-menu-handlers.test.ts` | 17 | DN-UI-4 / DN-UI-2 | `Deferred` をクリックリスナが解決する形。mx-ui では**遷移は値**で、`prompt()` も面に無い。セーブ一覧の取得は mc-save |
| `test/dom-focus-utils.test.ts` | 12 | **DN-UI-4** | `asFocusableElement` / `trapDialogFocus` / `restoreFocusIfConnected` / `currentActiveElement`。**12 本すべてが面に無い動詞についての主張である。** フォーカスリング（DN-UI-13i）は描画としてはあるが、移動を知る手段は意図的に無い |
| `menu/pause-menu-focus.test.ts` | 5 | DN-UI-4 | Tab の巻き戻し。同上 |
| `hud/crosshair-integration.test.ts` | 3 | DN-UI-13 | show/hide のサイクル。**参照実装は「document に付いているか」が可視性モデル**で、mx-ui は `removeChild` を持たず `hidden` 属性が可視性である。`test/crosshair.test.ts` が両方を分けて問うている |
| `test/color-vision.test.ts` | 3 | **DN-UI-1a** | 参照実装は `document.body` に属性を付ける。**mx-ui は canvas にしか付けない** — 文書全体に掛けると UI クロームのコントラストを壊すのが DN-UI-1a の失敗モードで、`test/accessibility.test.ts` が「属性は canvas だけ」を既に守っている |

### 3-5. NO-CLAIM（1 ファイル / 6 本）

| 参照実装のファイル | 本 | 理由 |
| --- | ---: | --- |
| `test-utils-coverage.test.ts` | 6 | **テストヘルパ自身を叩いてカバレッジを上げるだけのファイル。** 「inventory renderer service fixture の no-op メソッドを実行する」など、守っている挙動が無い。99% ゲート（testing.md §5）を課した副作用がそのまま形になっている。移植しない |

なお、他のファイルにも `should be defined` / `Layer as provision without error` /
`Effect composition` 系の**本数だけあって主張の無いテスト**が散っている（実測 30 本前後）。
ファイル主判定には影響しないが、**456 本を目標本数として読むべきでない**理由の 1 つである。

## 4. 今回移植したもの（11 本）

| 移植元 | 移植先 | 本 |
| --- | --- | ---: |
| `test/sound-captions.test.ts` | `test/caption-oracle.test.ts`（新規） | 7 |
| `loading/loading-screen.test.ts` | `test/loading-screen.test.ts`（追記） | 4 |

**11 本すべてについて、狙っている実装を壊して赤になることを確認してある。**
突然変異は 8 通り:

| # | 壊した場所 | 落ちたテスト |
| ---: | --- | ---: |
| M1 | `applyCaptionSettings` を恒等関数に（＝欠陥そのもの） | 4 |
| M2 | `applyCaptionSettings` が常に空を返す | 2 |
| M3 | `ui:overlay-sync` が設定を適用しない | 1 |
| M4 | `caption-view` が `MAX_VISIBLE_CAPTIONS + 1` 個の行を作る | 1 |
| M5 | `caption-view` が `writeText` を経由せず毎回書く | 1 |
| M6 | 失敗理由を textContent に入れる前に HTML エスケープする | 1 |
| M7 | 失敗理由を `aria-label` にも複写する | 3 |
| M8 | 失敗状態を離れるとき理由を消さない | 2 |

### なぜ 11 本なのか

`test/sound-captions.test.ts` の 9 本のうち、**5 本は既に守られていた**
（`view-model.test.ts` の字幕 6 本と `screen-views.test.ts`）。
2 本は面に無い（`document === undefined` ガード、ラベル表の網羅）。
**残った 1 本が欠陥だった**ので、それを 7 本に割って書いた。

`loading/loading-screen.test.ts` の 12 本のうち、
**7 本は SSR ガードとレイヤ供給**で守っているものが無く、
1 本は既存オラクルが持っている。生きていたのは HTML 注入の 1 本で、
mx-ui では**より強い形**になる —
参照実装の `DomOperationsService` は `setInnerHTML` を持っており
（取引画面とインベントリが実際に呼んでいる）、だから
「この呼び出し箇所は textContent を使った」は次の呼び出し箇所が破れる主張である。
`application/dom-surface.ts` には `innerHTML` も `insertAdjacentHTML` も無いので、
**その面に対して書かれたレンダラは注入を表現できない** — DN-UI-4 が
`addEventListener` について立てているのと同じ論である。
残ったのは「理由が本当にテキストとして運ばれ、途中で属性に漏れないこと」で、
それが移植した 4 本である。

## 5. 移植が出した欠陥 — 字幕を切っても消えない

**`test/sound-captions.test.ts:124`「clears all rows when captions are turned off」に
対応する挙動が mx-ui に無かった。**

`receiveCaption` は**受け入れ**を閉じる。だから
「字幕が切ってある状態で字幕が届いた」には答えるが、
**「字幕が出ている状態で字幕を切った」には構造上答えられない。**
そして後者がプレイヤーが実際に作る状況である —
設定を開いて字幕を切る理由は、**その瞬間に字幕が邪魔だから**である。

直す前の挙動: 表示中の字幕は設定を無視して残り、`expireCaptions` でしか減らない。
つまり `CAPTION_LIFETIME_SECS`（3 秒）の残りぶんだけ画面に残り、
**`dt` が来ていない間は無期限に残る。**

### 既存テストが「守っているように見えて」守っていなかった

`test/view-model.test.ts` の

> `the player turning captions off DOES suppress them, because that is an explicit choice`

は `emptyCaptionQueue` を渡している。**空のキューしか観測していないので、
消すべきものがある場合を一度も通らない。**
このテストは正しく、弱めてもいない。名前が示唆するより狭い問いを立てているだけである。

### 直したもの

- `domain/caption.ts` に `applyCaptionSettings(queue, settings)` を追加。
  切ってあれば空を返し、入っていればキューを**同一性で**返す（毎フレーム走るため）。
- `stages/registration.ts` の `UiFrameState` に `captionSettings: Ref` を追加し、
  `ui:overlay-sync` が**失効より先に**適用する。
  ドメイン関数だけ足して誰も呼ばなければ欠陥はそのままなので、
  `test/caption-oracle.test.ts` は実際の stage を駆動して確かめている。

これは DN-UI-11b（参照実装の自動保存インジケータ）、
`application/crosshair-view.ts`（`mix-blend-mode: difference` が中間調で消える）に続く
**3 件目の、参照実装との突き合わせが出した実挙動の問題**である。
ただし前 2 件と向きが逆で、**今回は参照実装のほうが正しかった。**

## 6. 移植できない・形が変わるもの（個別）

### 6-1. `confirm-dialog.test.ts` は DN-UI-4 と正面衝突する

参照実装の確認ダイアログは自分で `keydown` を持ち、Enter を cancel に割り当て、
閉じるときにフォーカスを復元する。**mx-ui の面にはその動詞が 1 つも無い。**
`domain/modal-stack.ts` が単一の決定で、`test/modal-flows.test.ts` が
フロー側からそれを守っている。

**これは記録済みの矛盾（インベントリスロットの `role="button"`）と同じ形で、
2 件目である。** 移植するなら「ダイアログが何を返すか」を値として書き、
キーの解釈は mc-render に置くことになる。

### 6-2. `cycleGameMode` は 3 値ではなく 2 値である

参照実装は survival → creative → spectator → survival の 3 値巡回で、
`main-menu-utils.test.ts` の 3 本がそれを守っている。
**mx-ui の `GameMode` は survival | creative の 2 値**である。

`domain/main-menu.ts` は「3 つ目を足したらここが型エラーになるように
索引ではなく網羅的な入れ替えで書いた」と書いており、**設計としては正しい**が、
**spectator を落とした理由はどこにも書かれていない。**
ゲームモードは mc-sim の状態なので、`GameMode` の値域は最終的に mc-sim が決める。
**この 3 本は mc-sim の publish 待ちであって、書けないのではなく決まっていない。**

### 6-3. HUD スケールは概念ごと存在しない

`hud/hud-scale.test.ts`、`hud/hotbar-responsive.test.ts`、
`hud/crosshair.test.ts` の「pulse 後も HUD スケールを保つ」の計 5 本が
`applyHudScale` / `resolveHotbarViewportLayout` を前提にしている。
mx-ui には**スケールという語が 1 つも無い**（`grep -ri 'hudscale\|uiScale'` が空）。

参照実装ではスケールが `transform: scale()` として crosshair の pulse と
**同じプロパティを取り合っており**、だから「pulse の後にスケールが戻るか」という
テストが要る。mx-ui の crosshair は中央寄せ変換を root に、pulse を内側の要素に
分けているので（`application/crosshair-view.ts`）、**同じ衝突は起きない。**
スケールを入れるときはこの分離を壊さないこと。

## 7. 次にやると価値が高い順

1. **`settings/`（3 ファイル 28 本）** — porting.md §4-3 の 1 番目。
   アクセシビリティ資産 3 つ（DN-UI-1）が乗り、完成条件 4 に直接効く。
   フォーカス系 7 本は DN-UI-4 で落ちるので、**実質 21 本**である。
2. **`inventory/inventory-renderer-helpers.test.ts`（10 本）** —
   PORTABLE-NOW で唯一まとまった未移植。DN-UI-12 の `unknown` 射影と同じ問いなので、
   画面を待たずに `domain/` に入る。
3. **`test/hud-visibility.test.ts`（4 本）** — F1 の HUD 非表示。
   `hidden` 属性で建て直すだけで、既存の `hud-view.ts` に載る。
4. **debug overlay（5 ファイル 37 本）** — 本数は多いが `facingFromYaw` と
   `formatNumber` が純粋導出で、画面より先に `domain/` へ降ろせる。
