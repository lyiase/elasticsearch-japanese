# elasticsearch-japanese

elasticsearch公式のDockerイメージに日本語を扱う為のプラグインを導入済みのDockerイメージを作成するためのDockerfile

作成したイメージは[Dockerhub](https://hub.docker.com/r/lyiase/elasticsearch-japanese)で公開しています

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
