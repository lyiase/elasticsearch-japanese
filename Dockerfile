FROM docker.elastic.co/elasticsearch/elasticsearch:9.0.1
RUN elasticsearch-plugin install --batch analysis-kuromoji \
    && elasticsearch-plugin install --batch analysis-icu
