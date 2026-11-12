FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /vanaaki-api ./cmd/api

FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -H vanaaki
USER vanaaki
COPY --from=build /vanaaki-api /vanaaki-api
EXPOSE 8090
ENTRYPOINT ["/vanaaki-api"]
