FROM docker.elastic.co/elasticsearch/elasticsearch:9.5.2
RUN elasticsearch-plugin install --batch analysis-kuromoji \
    && elasticsearch-plugin install --batch analysis-icu
