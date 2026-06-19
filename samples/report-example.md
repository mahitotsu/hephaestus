# デプロイメントレポート

## サマリー

| 項目 | 値 |
|------|-----|
| スタック | hephaestus-app |
| リージョン | ap-northeast-1 |
| ステータス | ✅ 成功 |
| デプロイ日時 | 2026-06-19T15:59:57Z |
| スタック更新時間 | 約17秒 (15:59:57 → 16:00:16) |
| パイプライン実行時間 | 約1分23秒 (ビルド開始 16:00:53Z から最終イベント 16:00:16Z までの逆算で測定) |
| 変更サマリー | 更新 1件 |

> **変更の要旨:** Lambda関数ハンドラー（Handler886CB40B）がNode.js 20.xで実行されるコードに更新されました。説明文に「(v2)」バージョン指標が追加され、新しいデプロイメントコードが反映されました。

---

## ビルド情報

| 項目 | 値 |
|------|-----|
| ビルドID | PipelineAppRunClaudeCode07F-8nQLtl1BtRRU:a5d2b930-1f04-401c-8120-d4d23b9f3a16 |
| ビルド番号 | 11 |
| コミット | 281852c0b59b3f101076e59fdbea6f3bc2d8845c |
| 実行者 | codepipeline/hephaestus |
| リポジトリ | https://github.com/mahitotsu/hephaestus |

---

## リソース変更詳細

### 追加されたリソース（Action: Add）

変更なし

### 更新されたリソース（Action: Modify）

| 論理リソースID | リソースタイプ | 変更されたプロパティ | 置換の有無 |
|---------------|--------------|------------------|----------|
| Handler886CB40B | AWS::Lambda::Function | Description (v2 追加), Code (S3キー更新) | なし |

### 削除されたリソース（Action: Remove）

変更なし

---

## ⚠️ セキュリティ・IAM 変更

セキュリティ関連の変更はありません。Lambda関数の更新は既存のIAMロール（HandlerServiceRoleFCDC14AE）を使用し、ポリシー変更はなく、ランタイムのアップグレードもありません。

---

## スタック出力

| 出力キー | 値 | 説明 |
|---------|-----|------|
| FunctionUrl | https://&lt;function-url-id&gt;.lambda-url.ap-northeast-1.on.aws/ | Lambda関数URL（パブリックHTTPエンドポイント） |
| ReportsBucketName | hephaestus-reports-&lt;account-id&gt; | デプロイメントレポート保存用S3バケット |

---

## スタックパラメータ

| パラメータ | 値 |
|-----------|-----|
| BootstrapVersion | /cdk-bootstrap/hnb659fds/version |

---

## デプロイメントイベントタイムライン

| タイムスタンプ (UTC) | 論理リソースID | ステータス | メッセージ |
|--------------------|--------------|---------:|---------|
| 2026-06-19T15:59:57.255Z | hephaestus-app | UPDATE_IN_PROGRESS | User Initiated |
| 2026-06-19T16:00:01.355Z | Handler886CB40B | UPDATE_IN_PROGRESS | Lambda関数更新開始 |
| 2026-06-19T16:00:13.885Z | Handler886CB40B | UPDATE_COMPLETE | Lambda関数更新完了（v2） |
| 2026-06-19T16:00:15.970Z | hephaestus-app | UPDATE_COMPLETE_CLEANUP_IN_PROGRESS | スタック更新クリーンアップ進行中 |
| 2026-06-19T16:00:16.968Z | hephaestus-app | UPDATE_COMPLETE | ✅ スタック更新完了 |

---

## リソースインベントリ（デプロイ後の全リソース一覧）

| リソースタイプ | 件数 |
|-------------|------|
| AWS::Lambda::Function | 2 |
| AWS::IAM::Role | 2 |
| AWS::S3::Bucket | 1 |
| AWS::Lambda::Url | 1 |
| AWS::IAM::Policy | 1 |
| AWS::Lambda::Permission | 2 |
| AWS::S3::BucketPolicy | 1 |
| AWS::CDK::Metadata | 1 |
| Custom::S3AutoDeleteObjects | 1 |

**合計: 12 リソース**

---

## リスク評価

**リスクレベル: 🟢 低**

このデプロイメントは低リスクです。変更内容はLambda関数コードの更新のみで、以下の理由から影響は限定的です：

1. **リソース置換なし** — 既存リソースはすべて更新のみで、IDの変更や削除はありません。
2. **IAM変更なし** — ロール・ポリシーの変更がないため、権限や信頼関係に影響なし。
3. **ランタイム変更なし** — Node.js 20.xは継続使用され、バージョンアップグレードではありません。
4. **インフラ構成変更なし** — ネットワーク、ストレージ、セキュリティグループの変更なし。

デプロイ中のダウンタイムは数秒のコード置き換え時間に限定されます。

---

## デプロイ後の確認事項

- [ ] Lambda関数ハンドラーが正常に呼び出せることを確認（`FunctionUrl`へのHTTPリクエスト送信）
- [ ] 関数ログにエラーがないことを確認（CloudWatch Logs）
- [ ] S3バケット（hephaestus-reports-&lt;account-id&gt;）への読み取り・書き込みが正常に機能することを確認
- [ ] デプロイレポートが正常に生成・保存されていることを確認
