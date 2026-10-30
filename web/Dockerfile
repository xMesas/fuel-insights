# syntax=docker/dockerfile:1
# One build, two images: "web" (nginx with the static files) and "ssr" (Node rendering the pages). The context is
# the repository root, because the legal pages are built from docs/legal (see Dockerfile.dockerignore).
FROM node:24-alpine AS build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY web/ ./
COPY docs/legal/ /app/docs/legal/
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30-alpine AS web
COPY web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist/web/browser /usr/share/nginx/html
EXPOSE 8080

# The server bundle carries its dependencies (Express included), so no node_modules are copied.
FROM node:24-alpine AS ssr
WORKDIR /app
ENV NODE_ENV=production PORT=4000
COPY --from=build --chown=node:node /app/web/dist/web ./dist/web
USER node
EXPOSE 4000
CMD ["node", "dist/web/server/server.mjs"]
