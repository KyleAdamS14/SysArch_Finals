# Frontend: static files served by an unprivileged (non-root) Nginx
FROM nginxinc/nginx-unprivileged:1.27-alpine

# The build number is passed in by docker-compose / Jenkins and shown in the page footer
ARG BUILD_NUMBER=dev

USER root
COPY index.html edit.html style.css validate.js form-check.js data.json kalos-map.png /usr/share/nginx/html/
RUN echo "{\"build\":\"${BUILD_NUMBER}\"}" > /usr/share/nginx/html/version.json \
    && chmod -R a+rX /usr/share/nginx/html
USER 101

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://localhost:8080/ >/dev/null || exit 1
