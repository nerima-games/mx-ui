# 責務と非スコープ

出典: plan.md §3.13、§7（機能カバレッジ対応表）、§3.14。

## 1. 責務

**ゲームが持つ DOM の面を全部。** plan.md §3.13 の列挙:

| 領域 | 内容 |
| --- | --- |
| HUD | ホットバー / 体力 / 空腹 / XP |
| メニュー | タイトル / ポーズ / ワールド選択・作成 |
| インベントリ | インベントリ画面 / クラフト画面 |
| 設定 | グラフィックス / 音量 / 操作 / アクセシビリティ |
| 実績・統計 | 実績画面 / 統計画面 |
| 字幕 | サウンド字幕の表示 |
| 進行表示 | ローディング表示 / セーブ表示 |

plan.md §7 の対応表が、§3.13 の箇条書きに載っていない 2 件をここに追加している:

| 領域 | 対応表の割り当て | 補足 |
| --- | --- | --- |
| マルチプレイヤー**画面** | ui | §3.14 が明示: 「参照実装のメインメニュー導線・マルチプレイヤー画面は mx-ui 側。ここ（mx-multiplayer）はトランスポートとプロトコルに限定」 |
| クラフト・かまど・醸造・金床・エンチャントの**画面** | sim（レシピ/状態）+ **ui（画面）** | レシピ表も精錬の進行状態も mc-sim の資産。mx-ui はそれを操作する面だけを持つ |

同じ表で「実績・統計」も `sim（記録）+ ui（画面）` と分けられている。
**この「記録は sim / 画面は ui」という切り方が、責務表の全行に一貫して効いている。**

### 2 つの stage

現状の実装（`stages/stage-ids.ts`）は責務を「何を読むか」で 2 本に割っている。

| StageId | 読むもの | `after` |
| --- | --- | --- |
| `ui:hud-sync` | mc-sim の状態（体力 / 空腹 / XP / ホットバー） | `sim:physics` |
| `ui:overlay-sync` | mx-ui 自身のモーダルスタックと字幕キュー | `ui:hud-sync` |

`ui:overlay-sync` はシミュレーション状態を一切必要としない。
**これが「各画面プレビューが背後にゲームなしで走れる」ことの構造的な理由**である（plan.md §3.13）。

## 2. 親は 2 つ

| 親 | 理由 |
| --- | --- |
| `mc-sim` | 表示するものの正がここにある。体力 / 空腹 / XP / インベントリ / 実績 / 統計 / 設定 / 時間 |
| `mc-audio` | **`CaptionEventStream` だけ**（plan.md §3.13「audio(字幕購読)」、§4.3） |
| `mc-kernel` | 全リポジトリ共通の例外。共有語彙 |

### mc-audio が親である唯一の理由

plan.md §3.13 の依存の書き方は「sim / audio(字幕購読)」であり、括弧の中身がそのまま範囲である。

**mx-ui は音を鳴らさない。** `SoundCuePort`（`play(cueId, options)`）を呼ぶのは mx-gameplay であり、
mx-ui が触るのは `CaptionEventStream` の購読側だけである。
理由は聞こえない側にある — 音が出せない状態でも字幕は出なければならない（plan.md §3.6、[design-notes.md](./design-notes.md) DN-UI-3）。

`test/check-dependency-whitelist.test.ts` の
`mc-audio is a parent for exactly one reason: the caption event stream` がこの意図を記録している。

## 3. 非スコープ（明示）

以下は mx-ui には**無い**。それぞれ行き先を書く。

| 非スコープ | 行き先 | 根拠 |
| --- | --- | --- |
| **ゲーム状態のすべて** — 体力 / 空腹 / XP / インベントリ / 実績 / 統計 / 設定 / 時間 | `mc-sim` | plan.md §3.8、§2.3-1（名詞は基盤） |
| **実行時入力サービスとキーバインディングそのもの** — キーボード / マウス / ポインタロック / タッチ / リマッピング | `mc-render` | plan.md §2.3-2、§3.9、§7 |
| **音声再生・キューレジストリ・字幕イベントの発生源** | `mc-audio` | plan.md §3.6。mx-ui は購読するだけ |
| **ネットワークトランスポートとプロトコル** | `mx-multiplayer` | plan.md §3.14。**画面はこちら、通信はあちら** |
| **表示されているものの背後にあるルール** — 採掘 / Mob AI / ドロップ / 流体 / 昼夜、レッドストーンの電力伝播 | `mx-gameplay` / `mx-redstone` | plan.md §3.11、§3.12。エッジはゼロ（[architecture.md](./architecture.md) §5） |
| **stage の全順序表・Layer 配線・セッションライフサイクル（タイトル⇄ゲーム）** | `mc-compose` | plan.md §2.3-3、§3.15 |
| **ブランデッド型・座標・ブロック能力モデル・契約型** | `mc-kernel` | plan.md §3.1。現状 `domain/frame-contract.ts` が仮に再掲している（[versioning.md](./versioning.md) §6） |
| **世界の canvas そのもの・マテリアル・ポストFX・パーティクル** | `mc-render` | plan.md §3.9 |

### 3-1. 入力の境界がいちばん間違えやすい

キーリマッピング画面は mx-ui にある。キーバインディングは mc-render にある。同じ機能に見えるが別物である。

| ここ（mx-ui） | あちら（mc-render） |
| --- | --- |
| リマップ画面の DOM、フィールドのフォーカス、競合の表示 | `InputService`、実際のキー登録、ポインタロック |
| 「Escape と Backspace はバインドせずクリアする」というルール | `window` にリスナを張るという実装 |
| `domain/accessibility.ts` の `rebind` | バインディングの実体 |

`domain/accessibility.ts` の `InputAction` union は暫定であり、
「the authoritative action list belongs with the runtime input service, which plan.md §2.3-2 puts in mc-render」
と明記してある。mc-render が publish された時点でこの型は mc-render のものに置き換わるが、
**mc-render が親になるわけではない** — 設定値は mc-sim の設定状態を経由して届く（[versioning.md](./versioning.md) §6）。

参照実装側も同じ境界を持っている。`packages/presentation/input/`（6 ファイル 681 LOC、実測）は
ディレクトリ上は presentation の中にあるが、**行き先は mc-render である**。
移植で最も重要な境界訂正であり、[porting.md](./porting.md) §3 で扱う。

### 3-2. mc-playground-kit は不要

plan.md §3.13:「kit 不要(DOMのみで起動)」。

kit は「ミニ平地ワールド + カメラ + レンダラ + 入力を 1 秒で束ねる糊」（plan.md §3.10）であり、
プレビューに**ゲーム世界の背後**が要るリポジトリのための道具である。
mx-ui のプレビューは各画面を状態モックで単体起動するので、背後に世界が無い。したがって糊も要らない。

ただし plan.md §2.3-2 の**組織全体のルールはここでも生きている**:

> kit は devDependency 専用のため、kit に入力を置くと本番ゲームから入力が消える

`scripts/check-dependency-whitelist.ts` の rule 6（`DEV_ONLY_PACKAGES`）は mx-ui のコピーにもそのまま入っており、
`test/check-dependency-whitelist.test.ts` が 5 本のテストで固定している:

- `mx-ui needs no kit at all — its previews boot from the DOM alone`
- `REGRESSION: kit in "dependencies" would still be an error here, because the rule is org-wide`
- `REGRESSION: importing kit from shipped source is an error even if it is declared correctly`
- `kit remains allowed from tooling, should a preview ever want a world behind it`
- `REGRESSION: `stages/` counts as shipped source, not as tooling`

最後の 1 本が地味に効いている。`isToolingOrTestPath` が `stages/` を tooling 側に分類してしまうと、
**このプロジェクトが最も禁じたい import が 1 つ静かに合法化される**。

## 4. アセット

plan.md §7 の最終行:「アセットファイル → 消費者に同梱（render / audio / **ui**）」、
§5.3 の棄却理由:「アセットは消費者に同梱（テクスチャ→render、音声→audio）。リソースパック機能を作る時に再検討」。

mx-ui は 16 リポジトリで唯一 **CSS とフォント / アイコンを出荷するリポジトリ**になる。
現状 1 バイトも無いが、これは publish パイプラインに影響する（[versioning.md](./versioning.md) §4）。
