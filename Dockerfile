FROM docker.elastic.co/elasticsearch/elasticsearch:8.17.4
RUN elasticsearch-plugin install --batch analysis-kuromoji \
    && elasticsearch-plugin install --batch analysis-icu
