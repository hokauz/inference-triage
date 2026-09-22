FROM oven/bun:1.3.14 AS build

WORKDIR /app
COPY runtimes/typescript/package.json runtimes/typescript/bun.lock ./runtimes/typescript/
WORKDIR /app/runtimes/typescript
RUN bun install --frozen-lockfile
RUN bun pm trust --all && bun install --frozen-lockfile
WORKDIR /app
COPY . .
RUN cd runtimes/typescript && bun run build

FROM node:25-bookworm-slim

WORKDIR /app
COPY --from=build /app/runtimes/typescript/dist ./runtimes/typescript/dist
COPY --from=build /app/runtimes/typescript/node_modules ./runtimes/typescript/node_modules
COPY --from=build /app/assets ./assets
COPY --from=build /app/platform ./platform

ENTRYPOINT ["node", "runtimes/typescript/dist/src/commands/v0.js"]
