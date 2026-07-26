# mx-ui ドキュメント

`@nerima-games/mx-ui` は 16 リポジトリ構成の**体験モジュール**であり、ゲームが持つ DOM の面を全部所有する。
plan.md §5.3 が画面別分割を棄却している以上、このリポジトリは最終的に**すべての画面**を抱えることになる。
UI 全部を含むリポジトリは、import を 1 本足すだけでゲーム全部に依存するリポジトリになる。
本ドキュメント群はその 1 本を足させないための資料である。

上位仕様は `/Users/take/Documents/plan.md`（以下 plan.md）。
参照実装は `takeokunn/ts-minecraft`（凍結。仕様書 + テストオラクル）。
参照実装への言及にはすべて `path:line` を付ける。

## 索引

| ドキュメント | 内容 | 主な読者 |
| --- | --- | --- |
| [architecture.md](./architecture.md) | 4 階層、全 16 リポジトリの依存グラフ、**名詞/動詞ルール**、体験モジュール間ゼロエッジ、推移閉包禁止、画面別分割を採らない理由 | 最初に読む人 / 依存を足したくなった人 |
| [responsibility.md](./responsibility.md) | 責務と、**明示的な非スコープ**（それぞれ「では誰の資産か」つき） | mx-ui に何かを足したくなった人 |
| [public-api.md](./public-api.md) | stage 登録 + 将来の mount 面。全 export の 契約 / 内部(可視) 分類 | mc-compose を書く人 |
| [design-notes.md](./design-notes.md) | **設計注意 DN-UI-1 〜 DN-UI-10。** 参照実装の実測根拠と、それを守る回帰テストの名前 | 画面を実装する人 |
| [porting.md](./porting.md) | 移植元と**実測 LOC**、`input/` の境界訂正、移植順序 | 参照実装から持ってくる人 |
| [testing.md](./testing.md) | 検証ゲート、`it.effect` デッドロック、完成条件、99% ゲートの投入時期 | CI / テストを触る人 |
| [versioning.md](./versioning.md) | 0.x → 1.0.0 方針、GitHub Packages、アセット同梱と `files` の面倒 | リリース作業者 |

## 読む順序

- **初めて mx-ui を触る**: [architecture.md](./architecture.md) → [responsibility.md](./responsibility.md) → [public-api.md](./public-api.md)
- **最初の画面を実装する**: [design-notes.md](./design-notes.md)（**DN-UI-2 を必ず先に**）→ [porting.md](./porting.md) → [testing.md](./testing.md)
- **mx-ui に依存を足したくなった**: [architecture.md](./architecture.md) §5〜§7 → [responsibility.md](./responsibility.md) §3（非スコープ）
- **mc-compose から使う**: [public-api.md](./public-api.md) → [versioning.md](./versioning.md)

## ドキュメントの性質

- [design-notes.md](./design-notes.md) と [porting.md](./porting.md) だけは**参照実装の実測記録**であり、
  他と性質が違う。実装と食い違ったら実測が正しく、実装を直す。
- [porting.md](./porting.md) の LOC は 2026-07-26 に `wc -l` で取った実測値であり、
  **plan.md §3.13 の数字は概算である**。両者は一致しないので、区別して読むこと。
- 本ドキュメント群自体は oxlint の `ignore` に入っている（`oxlint.json` の `"docs/**"`）。
