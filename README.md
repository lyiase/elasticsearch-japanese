# elasticsearch-japanese

elasticsearch公式のDockerイメージに日本語を扱う為のプラグインを導入済みのDockerイメージを作成するためのDockerfile

作成したイメージは[Dockerhub](https://hub.docker.com/r/lyiase/elasticsearch-japanese)で公開しています

## Dependabotによる自動リリース

GitHub Actionsの標準の `GITHUB_TOKEN` だけで、次の処理を行います。追加のPATやGitHub Appは不要です。

1. `main` 向けのPRをDockerビルドで検証します。この段階ではイメージを公開せず、Docker Hubの認証情報も使用しません。
2. 検証成功後、同じリポジトリのDependabot PRで、Dockerfileの公式Elasticsearchイメージのバージョンだけを更新している場合にスカッシュマージします。
3. 更新先が `9.5.6` なら、マージしたコミットを対象にタグ・タイトルがともに `v9.5.6` のReleaseを公開します。
4. `workflow_dispatch` で公開ワークフローをそのタグに対して起動し、Docker Hubへ `9.5.6` と `latest` を公開します。

自動化の対象は、安定版の数値バージョン（`X.Y.Z`）へのアップグレードです。パッチ・マイナー・メジャー更新を含み、プレリリース、ダウングレード、その他のファイルや命令の変更は自動マージしません。

`GITHUB_TOKEN` で公開したReleaseは `release: published` のワークフローを起動しないため、公開処理を明示的に呼び出しています。手動でReleaseを公開した場合は、従来どおり `release: published` で公開されます。

### 設定と再実行

- 既存のActions Secrets `DOCKER_USERNAME` と `DOCKER_PASSWORD` を使用します。
- `Release Elasticsearch update` はジョブに `contents: write`、`pull-requests: write`、`actions: write` を指定します。GitHub標準のAuto-mergeの有効化は不要です。
- 導入前から開いているDependabot PRは、Dependabotでリベースするなど、PRの更新によって検証を起動してください。
- Release作成や公開ワークフローの起動に失敗した場合は、対象PRの `Validate Docker image` を再実行すると、マージ済みの状態から再開できます。既存のタグが別のコミットを指している場合は停止します。
- Docker Hubへの公開が失敗した場合は、`Publish Docker image` の失敗した実行を再実行してください。Actionsの手動実行、または `gh workflow run publish-dockerhub.yaml --ref v9.5.6` でも再公開できます。手動実行では対象のバージョンタグを選択してください。

自動化の判定・再実行処理のテストは、Node.js 20以降で `node --test .github/scripts/release-elasticsearch.test.cjs` を実行します。

## ローカルでのビルド手順

1. このリポジトリをクローンします。

    ```
    git clone https://github.com/lyiase/elasticsearch-japanese.git
    ```

2. リポジトリのルートディレクトリに移動します。

    ```
    cd elasticsearch-japanese
    ```

3. Dockerイメージをビルドします。

    ```
    docker build -t elasticsearch-japanese .
    ```

## ローカルでのElasticsearch起動

1. Elasticsearchを起動します。

    ```
    docker run -d -p 9200:9200 -p 9300:9300 your-image-name
    ```

2. Elasticsearchが正常に起動したかどうかを確認します。

    ```
    curl http://localhost:9200/
    ```

    以下のようなレスポンスが返ってくれば、Elasticsearchが正常に起動しています。

    ```
    {
      "name" : "your-node-name",
      "cluster_name" : "elasticsearch",
      "cluster_uuid" : "your-cluster-uuid",
      "version" : {
         "number" : "x.x.x",
         "build_flavor" : "default",
         "build_type" : "docker",
         "build_hash" : "747e1cc71def077253878a59143c1f785afa92b9",
         "build_date" : "2021-01-13T00:42:12.435326Z",
         "build_snapshot" : false,
         "lucene_version" : "x.x.x",
         "minimum_wire_compatibility_version" : "x.x.x",
         "minimum_index_compatibility_version" : "x.x.x-beta1"
      },
      "tagline" : "You Know, for Search"
    }
    ```
