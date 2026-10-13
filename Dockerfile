# Static host + same-origin API aggregator for the webui.
#
# Stage 1 builds the Svelte SPA from source (no committed dist). Stage 2 serves
# it with Caddy, which also reverse-proxies `/agent.v1.*` to the agent over h2c
# so the browser talks to its own origin for both the app and the RPC (no CORS,
# no domain entry). See Caddyfile.
#
# Base images are the OFFICIAL library/* images, pulled through the in-cluster
# artifact mirror (buildkitd: [registry."docker.io"] mirrors=[artifact...]).
ARG NODE_IMAGE=docker.io/library/node:26-alpine
ARG CADDY_IMAGE=docker.io/library/caddy:2.11.7-alpine

FROM ${NODE_IMAGE} AS build
ARG HTTP_PROXY
ARG HTTPS_PROXY
ENV HTTP_PROXY=${HTTP_PROXY} HTTPS_PROXY=${HTTPS_PROXY} \
    NO_PROXY=localhost,127.0.0.1,.svc,.svc.cluster.local,artifact.worker.svc.cluster.local
WORKDIR /src
COPY package.json .npmrc ./
RUN npm install --no-audit --no-fund --no-package-lock
COPY . ./
RUN npm run build

FROM ${CADDY_IMAGE}
COPY --from=build /src/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 8080
