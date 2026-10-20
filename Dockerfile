# Static host + same-origin API aggregator for the webui.
#
# Stage 1 builds the Svelte SPA from source (no committed dist). Stage 2 serves it
# with Caddy, which also reverse-proxies `/agent.v1.*` to the agent over h2c so the
# browser talks to its own origin for both the app and the RPC (no CORS, no domain
# entry). See Caddyfile.
#
# PORTABILITY: no internal artifact mirror, no proxy, no *.svc.cluster.local. The
# base images are the stock library/* images pulled from Docker Hub.
FROM node:26-alpine AS build
WORKDIR /src
COPY package.json .npmrc ./
COPY package-lock.json ./
# `npm ci` needs the lockfile (now committed) and refuses to resolve anything the
# lock does not already pin, so the image is reproducible and the build fails
# loudly when package.json and the lock have drifted.
RUN npm ci --no-audit --no-fund
COPY . ./
RUN npm run build

FROM caddy:2.11.7-alpine
COPY --from=build /src/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 8080
