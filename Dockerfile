# ---------- ADAudit Work Hours viewer ----------
# Pure HTML/CSS/JS served by nginx. No build step.

FROM nginx:alpine

# Copy site into nginx's web root
COPY . /usr/share/nginx/html

# Strip deploy/meta files that don't belong in the served root
RUN rm -rf \
  /usr/share/nginx/html/Dockerfile \
  /usr/share/nginx/html/.dockerignore \
  /usr/share/nginx/html/docker-compose.dev.yml \
  /usr/share/nginx/html/docker-compose.local.yml \
  /usr/share/nginx/html/docker-compose.prod.yml \
  /usr/share/nginx/html/.git \
  /usr/share/nginx/html/.github \
  /usr/share/nginx/html/.gitignore \
  /usr/share/nginx/html/README.md \
  /usr/share/nginx/html/DEPLOY.md \
  /usr/share/nginx/html/Update-Departments.ps1 \
  /usr/share/nginx/html/nginx.conf \
  2>/dev/null || true

# Custom nginx config (gzip, caching, fallback)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
