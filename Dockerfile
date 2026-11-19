# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend-builder
WORKDIR /web

COPY web/package*.json ./
RUN npm ci

COPY web ./
RUN npm run build

FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS backend-builder
WORKDIR /src

ARG TARGETOS=linux
ARG TARGETARCH

COPY go.mod go.sum* ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal
RUN rm -rf ./internal/webembed/dist
COPY --from=frontend-builder /web/dist ./internal/webembed/dist

RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/linktive ./cmd/server

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata su-exec \
    && addgroup -S linktive \
    && adduser -S -G linktive linktive \
    && mkdir -p /data \
    && chown -R linktive:linktive /data

WORKDIR /app
COPY --from=backend-builder /out/linktive /usr/local/bin/linktive

ENV LINKTIVE_ADDR=:8080 \
    LINKTIVE_DATA_DIR=/data \
    LINKTIVE_DB_PATH=/data/linktive.db \
    LINKTIVE_ENV=production

VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/api/v1/health >/dev/null || exit 1

ENTRYPOINT ["/bin/sh", "-c", "mkdir -p \"$LINKTIVE_DATA_DIR\" && chown -R linktive:linktive \"$LINKTIVE_DATA_DIR\" && exec su-exec linktive /usr/local/bin/linktive \"$@\"", "--"]
