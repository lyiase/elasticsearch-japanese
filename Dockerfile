FROM docker.elastic.co/elasticsearch/elasticsearch:9.4.0
RUN elasticsearch-plugin install --batch analysis-kuromoji \
    && elasticsearch-plugin install --batch analysis-icu
