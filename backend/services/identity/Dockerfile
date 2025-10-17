FROM alpine:3.19 as build
RUN apk add --no-cache build-base cmake ninja openssl-dev
WORKDIR /app
COPY . /app
RUN cmake -S . -B build && cmake --build build -j --target identity

FROM alpine:3.19
WORKDIR /app
COPY --from=build /app/build/services/identity/identity /usr/local/bin/identity
RUN apk add --no-cache libstdc++ libgcc openssl
CMD ["/usr/local/bin/identity"]
