FROM docker.elastic.co/elasticsearch/elasticsearch:8.14.1-amd64

RUN elasticsearch-plugin install --batch analysis-kuromoji \
    && elasticsearch-plugin install --batch analysis-icu
