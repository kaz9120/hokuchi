# 振り返り

パスは、このスキルのフォルダ (`.claude/skills/writing-note/`) からの相対です。

公開して反応が見えたら、`references/voice.md` の末尾に学びを 1 行足します。いちばん効く材料は、Claude の原稿と公開版の差です。話者が直した箇所を読み、`ai-tells.md` の型に当たるものはそこへ、文体の規範に当たるものは `voice.md` の本文へ、記事の種類の約束は `structure.md` へ畳みます。学びの行が 10 を超えたら、畳む時期です。

数値を測り直すときは、`articles/note/` 全体に lint を回します。

```
hokuchi-note lint
```

公開済み記事が error を出さず、warn が改善余地として出る状態を保ちます。error が出るようになったら、閾値か規範のどちらかがずれています。
