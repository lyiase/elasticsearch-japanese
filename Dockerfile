FROM docker.elastic.co/elasticsearch/elasticsearch:9.3.2
RUN elasticsearch-plugin install --batch analysis-kuromoji \
    && elasticsearch-plugin install --batch analysis-icu
