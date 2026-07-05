# talks — 発表資料

発表 1 本につきディレクトリ 1 つ。名前は `<YYYY-MM-slug>`（例: `2026-08-intent-driven-slides`）。

```
<YYYY-MM-slug>/
  deck.yaml    意図宣言型のソース (tools/slides/SPEC.md 準拠)
  assets/      実画像など
  out/         作業レンダリング。git 管理外
  final/       発表済みの凍結出力 (PNG 一式 + PDF)。コミットする
```

運用の規則は 2 つ。

- テーマは登壇の立場で選び、相対参照する（個人は `tools/slides/themes/hokuchi.yaml`、MOSH としては `tools/slides/themes/mosh.yaml`。ADR-0010）。コピーしない
- 発表が終わったら最終レンダリングを `final/` にコミットして凍結する。レンダラは進化するので、deck.yaml だけでは当時の見た目を再現できない (ADR-0009)

作り方は crafting-presentation skill（「スライド作って」で起動）を参照。
