FROM postgres:16-alpine
# Schema + seed data run on first start (baked into the image, no bind mount needed)
COPY init.sql /docker-entrypoint-initdb.d/init.sql
