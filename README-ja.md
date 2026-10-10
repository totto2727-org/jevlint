# jev-lint: カスタムルール専用

この [mizchi/jev-lint](https://github.com/mizchi/jev-lint) のフォークは、自然言語 lint の汎用エンジンとルール作成機能を維持しますが、本番用ルールを同梱しません。
リポジトリは `totto2727-org/jevlint`、パッケージ名は `@totto2727/jevlint`、CLI 名は `jev-lint` です。
比較対象の upstream リビジョンと運用上の変更は [フォーク差分](docs/upstream-differences.md) を参照してください。
Node.js 24 以降が必要です。

## 明示的なルール

`jev-lint init` は `rules: {}` を含む有効な `.jev-lint.yaml` を作成します。
`.jev-lint/rules/` に独自ルールを作成し、設定でその ID を有効にしてください。
`-R` と設定の `rulePaths` を指定しない場合、選択した設定ファイルの隣、または設定がない場合は現在のディレクトリにある `.jev-lint/rules/` だけがルールの読み込み元になります。
単なる `./rules/`、upstream のルール集、テスト用 fixture は自動的に読み込みません。
`jev-lint rules --json` は利用可能なルールを表示し、ルールがなければ空の一覧を返します。
利用可能なルールがない check は、問題なしとは判定せず、案内と終了コード 2 を返します。

分離した文書処理では、設定ファイルに `rulePaths: [./custom-rules]` と明示的な `rules` 選択を記述し、`jev-lint check --config /path/to/job.yml /path/to/actual.md` を直接実行してください。
`rulePaths` と任意の共有資料 `context: [./conventions.md]` は設定ファイルからの相対パスとして解決され、`rulePaths` は暗黙的なルール探索を無効にします。CLI の `-R` が指定されていればそちらが優先されます。
資料のサイズ制限と `split` を省略したファイル全体の Text ルールは [設定リファレンス](docs/reference.md#selection-and-configuration) を参照してください。
明示的な設定と `-R` を指定するか、`--no-config -R` と明示的な対象パスを使用する方法も利用できます。
`--no-config` だけでは `.jev-lint/rules/` の検索を無効にしないため、リポジトリのルールを探索したくない処理では必ず `-R` を指定してください。

```bash
npm ci
npm run build
node dist/cli.js check --no-config -R /path/to/custom-rules /path/to/targets --dry-run --cache none
node dist/cli.js check --config /path/to/job.yml -R /path/to/custom-rules --transport cloudflare --model typesafe/jev --json
```

## Cloudflare AI Gateway

`--transport cloudflare`、設定の `transport: cloudflare`、または `JEV_LINT_TRANSPORT=cloudflare` で選択します。
CLI 引数、設定、環境変数の順に優先されます。
この経路の既定モデルは `typesafe/jev` で、`--model`、設定の `model`、`JEV_LINT_MODEL` で変更できます。
CLI と汎用 runner は Cloudflare が既定です。直接通信には `--transport typesafe` の明示、またはプログラムから直接通信用 `new Jev()` クライアントの指定が必要です。
低レベルの `Jev` SDK コンストラクターは upstream の直接通信の既定値を維持します。
Cloudflare 接続が失敗しても直接接続に切り替えません。

認証情報を追跡対象ファイルに書かず、次の環境変数で指定してください。

- `CLOUDFLARE_ACCOUNT_ID`: Workers AI アカウント ID。
- `CLOUDFLARE_AI_GATEWAY_ID`: 既存 Gateway の ID。
- `CLOUDFLARE_AI_GATEWAY_API_KEY`: Workers AI 推論権限を持つ bearer token。

Cloudflare は `POST https://api.cloudflare.com/client/v4/accounts/<account>/ai/run` に `Authorization: Bearer <token>` と `cf-aig-gateway-id` を付けて送信します。
本文は `{model, input: {state, questions}}` であり、OpenAI chat リクエストでもネイティブ `@cf/typesafe/jev` URL でもありません。
`baseUrl` と `TYPESAFE_BASE_URL` は Typesafe 直接接続だけに適用されます。
設定の `apiKeyEnv` で別の認証環境変数名を指定できますが、`apiKey` の直接記載はできません。
完了した universal レスポンスの `result.result` を正規化し、不正、失敗、保留、不完全なレスポンスは判定なしになります。

Gateway リクエストは内容由来の `cf-aig-cache-key`、`cf-aig-cache-ttl: 2592000`、`cf-aig-skip-cache: false` でキャッシュを有効にします。
キーは endpoint、Gateway、ハッシュ化した認証スコープ、モデル、外部 state と criteria を含む完全な正規化済みリクエストを反映します。
Gateway キャッシュは best-effort で、exactly-once を保証せず、失敗後にリクエストを再試行することがあります。
リダイレクトは拒否します。Account ID は 32 桁の 16 進文字列、Gateway ID は英数字で始まる英数字、アンダースコア、ハイフンのみの文字列である必要があります。
Gateway レポートの `spent.usd` は入力 100 万トークン当たり $0.042 の Typesafe 参考見積もりと明記し、Cloudflare の実請求額ではありません。
ローカル判定キーも経路、モデル、収集した全ソース、グラフ、関連テスト、context 文書の内容を反映します。
スキーマ 5 は以前の安全でないキャッシュを無効化し、無関係な変更でも保守的な無効化によってミスが増えることがあります。
鮮度が必要な場合は `--force` または `--cache none` を使用してください。ただし Gateway キャッシュは無効になりません。

公式資料: [Workers AI REST setup](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)、[Gateway REST API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/)、[Gateway caching](https://developers.cloudflare.com/ai-gateway/features/caching/)。

## 作成と検証

ルールは AST ノード、テキストブロック、コミット、変更を対象にできます。
各ルールは自然言語の質問、criteria または score levels、context 文書、調整済み threshold を指定します。
継承、カスタム文法、batching、diff filtering、replay、calibration、レポート、git hook 補助機能は維持されています。
このフォークは任意の独自ルールを提供しません。
フィールドと例は [作成リファレンス](docs/reference.md) を参照してください。

```bash
node dist/cli.js eval --no-config -R /path/to/custom-rules --dry-run
node dist/cli.js eval --no-config -R /path/to/custom-rules --accept
node dist/cli.js eval --no-config -R /path/to/custom-rules --replay
npm run ci
npm run test:dist
npm pack --dry-run
```

`test/fixtures/rules/` の回帰テスト専用スイートは公開パッケージに含めません。
upstream の過去の測定や実験は、独自ルールや Gateway アカウントの動作を保証しません。
