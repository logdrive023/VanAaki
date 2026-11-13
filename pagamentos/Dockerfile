# Serviço de pagamentos do VanAaki (Asaas). Imagem pequena, sem shell de build.
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /pagamentos ./cmd/servidor

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata && adduser -D -u 10001 app
USER app
COPY --from=build /pagamentos /pagamentos
EXPOSE 8095
ENTRYPOINT ["/pagamentos"]
