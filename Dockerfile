# Use pre-built static frontend (dist/ already built in repo)
FROM caddy:2-alpine
COPY dist /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
