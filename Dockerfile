FROM docker.elastic.co/elasticsearch/elasticsearch:9.0.3
RUN elasticsearch-plugin install --batch analysis-kuromoji \
    && elasticsearch-plugin install --batch analysis-icu
