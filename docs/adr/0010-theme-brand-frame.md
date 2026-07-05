# ADR-0010: テーマにブランド枠 (brand) を追加し、組織テーマの運用を始める

- ステータス: 承認
- 日付: 2026-07-05
- スコープ: tools/slides

## 文脈

登壇には個人としてのものと、所属組織 (MOSH) の人間としてのものがある。組織登壇では、会社のトンマナ——ロゴの常時表示、コピーライト表記、ブランドカラー、指定書体——に沿う必要がある。参照実装として MOSH の Marp テンプレート ([TheMoshInc/marp-slide-template](https://github.com/TheMoshInc/marp-slide-template)) があり、そこでは全スライドにロゴ (右上 24px) とコピーライト (右下) が置かれ、書体は Nunito、ブランドカラーは #FA6E78 と定義されている。

現行の theme スキーマ (0.1.0) は色・書体・グリッドのみを持ち、ロゴ・フッタといったブランド枠の語彙がない。SPEC §9 の logo-bumper lint も「ロゴを表す要素が未定義のため実質 no-op」と保留されていた。

ここには slide:ology との緊張がある。デュアルテはロゴをバンパー (opener/closer) に限ることを推奨する (p.137)。一方、企業テンプレートは全ページ常時表示を求める。どちらかを正とするのではなく、テーマが選べる必要がある。

## 選択肢

1. **theme に brand オブジェクトを追加する** — `brand.logo` (src / height / placement) と `brand.footer` (コピーライト文字列)、`type.webfonts` (Web フォント URL) を任意フィールドとして足す。ロゴの表示範囲は `placement: bumpers | all` でテーマが宣言する
2. **deck 側の要素としてロゴを書く** — 各スライドに logo 要素を置く。1 枚ごとに書くのは意図の重複であり、テーマ (共有基盤) に属すべき情報が deck に漏れる
3. **レンダラのハードコード** — MOSH 用レンダラ分岐を作る。テーマの意味 (差し替え可能な共有基盤) が壊れる

## 決定

1 を採用する。theme スキーマを 0.2.0 に上げ、次を任意フィールドとして追加する。

- `theme.brand.logo` — `{ src, src_invert?, height?, placement? }`。src はテーマファイルからの相対パス。src_invert は反転背景用の白版。placement は `bumpers` (既定) | `all`
- `theme.brand.footer` — 全スライド右下に置く短いテキスト (コピーライト等)
- `theme.brand.backgrounds` — role 群ごとの背景アート `{ bumper?, title?, transition?, content? }`。各エントリは `{ src, foreground? }` で、foreground: light は「この背景は濃色なので前景を白系に反転する」の宣言
- `theme.type.webfonts` — `<link>` で読み込む Web フォント URL の配列

MOSH の背景 SVG (cover / default / section-cover) は単色ではなくブランドアートそのものであり、logo と同格のトンマナ要素と判断して初版に含める。

`themes/mosh.yaml` を追加し、MOSH のトンマナ (Nunito / #FA6E78 / ライト背景 / ロゴ常時 / コピーライト) をこのスキーマで宣言する。ロゴ SVG は `themes/assets/` に置く。

デュアルテ推奨との緊張は placement の既定値で解く。既定は `bumpers` (p.137 準拠) とし、`all` は組織要件がある場合の明示的な逸脱とする。lint での警告はしない (テーマの宣言はデッキの逸脱ではなく組織の要件だから)。

## 撤退ライン

ブランド枠の要求が logo/footer/backgrounds/webfonts で収まらなくなったとき (ヘッダ帯、ページ番号、role 別パレットなど、さらに 3 つ以上増えたとき) は、brand を「テーマ部品 (パーシャル)」の仕組みに設計し直す。

## 影響

- theme.schema.json / SPEC §2 の更新 (0.2.0)
- レンダラにブランド枠の描画レイヤーが増える (舞台の外側、role 非依存)
- logo-bumper lint は引き続き「deck 内の logo 要素」用として保留のまま
