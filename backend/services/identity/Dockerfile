FROM alpine:3.19 as build
# hadolint ignore=DL3018
RUN apk add --no-cache build-base cmake ninja openssl-dev postgresql-dev libpqxx-dev pkgconf
WORKDIR /app
COPY . /app
RUN rm -rf build \
    && cmake -S . -B build \
    && cmake --build build -j --target identity

FROM alpine:3.19
WORKDIR /app
COPY --from=build /app/build/services/identity/identity /usr/local/bin/identity
# hadolint ignore=DL3018
RUN apk add --no-cache libstdc++ libgcc openssl libpq libpqxx
CMD ["/usr/local/bin/identity"]
