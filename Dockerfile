FROM docker.elastic.co/elasticsearch/elasticsearch:8.16.1
RUN elasticsearch-plugin install --batch analysis-kuromoji \
    && elasticsearch-plugin install --batch analysis-icu
