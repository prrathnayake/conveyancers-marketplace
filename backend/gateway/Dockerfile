FROM alpine:3.19 as build
RUN apk add --no-cache build-base cmake ninja
WORKDIR /app
COPY . /app
RUN cmake -S . -B build && cmake --build build -j
FROM alpine:3.19
WORKDIR /app
COPY --from=build /app/build/gateway /usr/local/bin/gateway
EXPOSE 8080
CMD ["/usr/local/bin/gateway"]
