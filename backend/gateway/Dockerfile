FROM alpine:3.19 as build
# hadolint ignore=DL3018
RUN apk add --no-cache build-base cmake ninja openssl-dev
WORKDIR /app
COPY . /app
RUN rm -rf build \
    && cmake -S . -B build \
    && cmake --build build -j --target gateway

FROM alpine:3.19
WORKDIR /app
# hadolint ignore=DL3018
RUN apk add --no-cache libstdc++ libgcc openssl
COPY --from=build /app/build/gateway/gateway /usr/local/bin/gateway
EXPOSE 8080
CMD ["/usr/local/bin/gateway"]
