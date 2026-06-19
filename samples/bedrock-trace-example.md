# LLM動作追跡レポート — デプロイレポート生成時のBedrockログ分析

このドキュメントは、`reports/20260619T160206Z.md`（[report-example.md](report-example.md) として収録）が生成された際に、LLMが何を行っていたかをBedrockモデル呼び出しログとCodeBuildログから追跡した調査結果です。

---

## 調査概要

| 項目 | 値 |
|------|-----|
| 対象レポート | `reports/20260619T160206Z.md` |
| 対象ビルドID | `PipelineAppRunClaudeCode07F-8nQLtl1BtRRU:a5d2b930-1f04-401c-8120-d4d23b9f3a16` |
| ビルド番号 | 11 |
| 使用モデル | `jp.anthropic.claude-haiku-4-5-20251001-v1:0`（クロスリージョン推論プロファイル） |
| 呼び出しリージョン | `ap-northeast-1` |
| LLM動作時間 | 2026-06-19T16:00:55Z 〜 16:02:02Z（**約70秒**） |
| 総呼び出し回数 | **10回** |

### ログソース

| ログ種別 | ロケーション |
|---------|------------|
| Bedrockモデル呼び出しログ | CloudWatch Logs: `/aws/bedrock/invocations`（`ap-northeast-1`） |
| CodeBuildログ | CloudWatch Logs: `/aws/codebuild/PipelineAppRunClaudeCode07F-8nQLtl1BtRRU` |

---

## CodeBuildの実行フロー

```
16:00:34Z  コンテナ起動
16:00:34Z  install.sh — Claude Code・uv インストール
16:00:52Z  pre_build.sh — Bedrock Prompt Management からプロンプト取得
16:00:53Z  build.sh — claude -p 実行開始
            ↓  (LLM 10回呼び出し・約70秒)
16:02:06Z  report.md 生成完了
16:02:07Z  S3 アップロード完了
```

---

## LLM呼び出しの詳細タイムライン

### 呼び出し #1 — セッションタイトル生成（16:00:55Z）

| 項目 | 値 |
|------|-----|
| リクエストID | `<request-id-1>` |
| 入力トークン | 2,650 tok（キャッシュなし） |
| 出力トークン | 30 tok |
| stop_reason | `end_turn` |

**内容:**  
Claude Code SDKの内部処理として、セッション一覧表示用のタイトルを自動生成する呼び出し。タスクプロンプトを読んで以下を返した。タスク本体の実行とは独立している。

```json
{
  "title": "Review hephaestus-app CloudFormation deployment"
}
```

---

### 呼び出し #2 — タスク開始・MCPツール検索（16:00:55Z）

| 項目 | 値 |
|------|-----|
| リクエストID | `<request-id-2>` |
| 入力トークン | 9 tok + cache書き込み 25,018 tok |
| 出力トークン | 400 tok |
| stop_reason | `tool_use` |

**テキスト出力（抜粋）:**
> I'll collect deployment data from CloudFormation and generate a comprehensive report. Let me start by fetching the AWS tool schemas, then systematically gather the required information.

**ツール呼び出し:**
```
ToolSearch(query='+cloudformation', max_results=10)
```

プロンプトに沿ってAWS APIを呼ぶ前に、AWS MCP ServerのCloudFormation系ツールのスキーマをロードしようとした。

---

### 呼び出し #3 — MCPツール再検索（16:01:04Z）

| 項目 | 値 |
|------|-----|
| リクエストID | `<request-id-3>` |
| 入力トークン | 4 tok + cache読み取り 20,491 tok + cache書き込み 4,709 tok |
| 出力トークン | 98 tok |
| stop_reason | `tool_use` |

**テキスト出力（抜粋）:**
> The AWS MCP server is still connecting. Let me wait briefly and search again for the CloudFormation tools.

**ツール呼び出し:**
```
ToolSearch(query='aws cloudformation', max_results=10)
```

AWS MCPサーバーがまだ接続中と判断し、異なるクエリで再試行した（MCP接続の遅延を自律的に検知して対処している）。

---

### 呼び出し #4 — Step 1: ListChangeSets（16:01:06Z）

| 項目 | 値 |
|------|-----|
| リクエストID | `<request-id-4>` |
| 入力トークン | 9 tok + cache読み取り 25,018 tok + cache書き込み 6,595 tok |
| 出力トークン | 366 tok |
| stop_reason | `tool_use` |

**テキスト出力（抜粋）:**
> Now I'll systematically collect the deployment data from CloudFormation. Starting with Step 1 — finding and describing the most recent change set.

**ツール呼び出し:**
```
aws cloudformation list-change-sets --stack-name hephaestus-app --region ap-northeast-1
```

タスクプロンプトの手順通り、チェンジセット一覧の取得を試みた。

---

### 呼び出し #5 — Step 2: DescribeStacks（16:01:20Z）

| 項目 | 値 |
|------|-----|
| リクエストID | `<request-id-5>` |
| 入力トークン | 3 tok + cache読み取り 25,200 tok + cache書き込み 6,818 tok |
| 出力トークン | 112 tok |
| stop_reason | `tool_use` |

**テキスト出力（抜粋）:**
> No change sets were found. Let me check the stack status and events directly to understand the current deployment state.

**ツール呼び出し:**
```
aws cloudformation describe-stacks --stack-name hephaestus-app --region ap-northeast-1
```

`ListChangeSets` の結果が空だったため、チェンジセット経由での変更情報取得を断念し、スタック全体の状態確認に切り替えた（自律的な手順の修正）。

---

### 呼び出し #6 — DescribeStackEvents（16:01:25Z）

| 項目 | 値 |
|------|-----|
| リクエストID | `<request-id-6>` |
| 入力トークン | 3 tok + cache読み取り 32,018 tok + cache書き込み 614 tok |
| 出力トークン | 127 tok |
| stop_reason | `tool_use` |

**テキスト出力（抜粋）:**
> Good, the stack exists. Now let me fetch the stack events to find those after the build start time (2026-06-19T16:00:53Z).

**ツール呼び出し:**
```
aws cloudformation describe-stack-events --stack-name hephaestus-app --region ap-northeast-1
```

スタックの存在を確認し、ビルド開始時刻（16:00:53Z）以降のイベントを絞り込むためにイベント履歴を取得した。

---

### 呼び出し #7 — ListStackResources（16:01:30Z）

| 項目 | 値 |
|------|-----|
| リクエストID | `<request-id-7>` |
| 入力トークン | 2 tok + cache読み取り 32,632 tok + cache書き込み 21,348 tok |
| 出力トークン | 125 tok |
| stop_reason | `tool_use` |

**テキスト出力（抜粋）:**
> I can see the stack events. Let me now fetch the stack resources to complete the inventory, and extract the change details using a Python script to process the data efficiently.

**ツール呼び出し:**
```
aws cloudformation list-stack-resources --stack-name hephaestus-app --region ap-northeast-1
```

スタックイベントからデプロイ内容を把握し、リソースインベントリセクション用にリソース一覧を取得した。これでデータ収集フェーズが完了。

---

### 呼び出し #8・#9・#10 — レポート本文生成（16:01:36Z〜16:02:02Z）

| 呼び出し | 時刻 | cache読み取り | 出力トークン |
|---------|------|------------|------------|
| #8 | 16:01:36Z | 53,980 tok | 1,073 tok |
| #9 | 16:01:45Z | 55,504 tok | 1,977 tok |
| #10 | 16:02:02Z | 56,676 tok | 207 tok |

収集したすべてのAPIレスポンスをもとにMarkdownレポートを生成した。3回に分かれているのはストリーミング応答のチャンク分割ではなく、Claude Codeが内部的にターンを分けたためと考えられる。

**注意:** これら3件の呼び出しは出力サイズが大きく（合計3,257トークン）、CloudWatchログの1イベントあたりのサイズ上限を超えたため `outputBodyJson` が記録されていない。レポートの実際の内容は [report-example.md](report-example.md) を参照。

---

## キャッシュ利用の推移

プロンプトキャッシュが会話を通じて積み上がり、AWS APIのレスポンスが蓄積されるたびに新規入力トークンがほぼゼロに圧縮されていく様子が確認できる。

```
呼び出し  新規入力   cache読み取り  cache書き込み
#1        2,650       0              0
#2            9       0             25,018
#3            4      20,491          4,709
#4            9      25,018          6,595
#5            3      25,200          6,818
#6            3      32,018            614
#7            2      32,632         21,348   ← stack-eventsのレスポンスが大きい
#8            —      53,980              —
#9            —      55,504              —
#10           —      56,676              —
```

最終的に約57,000トークンのコンテキスト（タスクプロンプト＋会話履歴＋AWS APIレスポンス）を保持しながら、毎回のLLM呼び出し時の実課金入力は数トークン〜十数トークンに留まった。

---

## 特筆すべき挙動

### 1. チェンジセット未取得への自律的対処

タスクプロンプトは `ListChangeSets` → `DescribeChangeSet` の順でチェンジセットから変更内容を取得する手順を指示していた。しかし実際にはチェンジセットが存在しなかったため、LLMはこれを `DescribeStackEvents` で代替し、イベント履歴（`15:59:57Z`〜`16:00:16Z`）から変更内容（`Handler886CB40B` のコード更新）を自分で読み解いた。

### 2. MCP接続遅延の自律的リトライ

呼び出し #2 でMCPサーバーへの接続待ちを検知し、呼び出し #3 で自動的に再試行した。エラーハンドリングの指示はプロンプトにない。

### 3. 呼び出し #1 はClaude Code SDKの内部処理

最初の呼び出しはレポート生成タスクとは独立した、Claude Code SDKによるセッションタイトルの自動生成である。システムプロンプトにSDKが挿入した「3〜7語のタイトルを生成せよ」という指示に応答している。

---

## 呼び出し元の確認

Bedrockログの `identity.arn` フィールドから、すべての呼び出しがCodeBuildの実行ロールから行われていることが確認できた。

```
arn:aws:sts::<account-id>:assumed-role/HephaestusPipelineStack-PipelineAppRunClaudeCodeRol-<suffix>/AWSCodeBuild-a5d2b930-...
```

---

## コスト概算

[Amazon Bedrock 料金ページ](https://aws.amazon.com/bedrock/pricing/)に基づいて算出。Geo クロスリージョン推論プロファイル（`jp.*`）には **x1.1 の係数**が適用される。

### 使用料金（Claude Haiku 4.5、オンデマンド + Geo クロスリージョン x1.1）

| トークン種別 | 基本単価 | Geo x1.1 後 |
|-----------|---------|------------|
| 入力（新規） | $1.00 / 100万トークン | $1.10 / 100万トークン |
| プロンプトキャッシュ書き込み（TTL 5分、1.25倍） | $1.25 / 100万トークン | $1.375 / 100万トークン |
| プロンプトキャッシュ読み取り（0.1倍） | $0.10 / 100万トークン | $0.11 / 100万トークン |
| 出力 | $5.00 / 100万トークン | $5.50 / 100万トークン |

### トークン数と費用内訳

| トークン種別 | トークン数 | 単価（x1.1後） | 費用 |
|-----------|----------|------------|------|
| 新規入力（#1〜#7） | 2,680 tok | $1.10/1M | $0.0029 |
| cache書き込み（#1〜#7） | 65,102 tok | $1.375/1M | $0.0895 |
| cache読み取り（#1〜#10） | 301,519 tok | $0.11/1M | $0.0332 |
| 出力（#1〜#10） | 4,515 tok | $5.50/1M | $0.0248 |
| **合計** | | | **$0.150** |

> **約 $0.15 USD**
>
> 円換算は AWS が請求書発行時に適用するレート（非公開）により変動する。実際の円額は請求書 PDF または AWS コンソールの Billing で確認できる。

**内訳の傾向:** コストの約60%がキャッシュ書き込みで、キャッシュ読み取りは22%に留まる。キャッシュ書き込みコストが相対的に大きいのは、会話の各ターンでコンテキスト全体をキャッシュに格納するためで、読み取りコストが低いからこそプロンプトキャッシュ全体での節約効果が高い。

**注記:** 呼び出し #8〜#10 の新規入力トークン数とキャッシュ書き込みトークン数はログの制限（`outputBodyJson` 欠落）により取得不能。ただしキャッシュ読み取り量の推移（#7: 32,632 → #8: 53,980）から、#7 のキャッシュ書き込み（21,348 tok）が正確に引き継がれており、#8〜#10 の新規入力はほぼゼロと推定される。実際の総コストは算出値と誤差1%未満と考えられる。
