FROM docker.elastic.co/elasticsearch/elasticsearch:9.3.4
RUN elasticsearch-plugin install --batch analysis-kuromoji \
    && elasticsearch-plugin install --batch analysis-icu
