ARG DEBIAN_IMAGE=debian:bookworm-slim
FROM ${DEBIAN_IMAGE} as build
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        cmake \
        ninja-build \
        libssl-dev \
        libpq-dev \
        libpqxx-dev \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . /app
RUN rm -rf build \
    && cmake -S . -B build \
    && cmake --build build -j --target payments

FROM ${DEBIAN_IMAGE}
ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        tini \
        libstdc++6 \
        libgcc-s1 \
        libssl3 \
        libpq5 \
        libpqxx-6.4 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --home-dir /home/appuser --shell /usr/sbin/nologin appuser
RUN install -d -o appuser -g appuser /app
COPY --from=build --chown=appuser:appuser /app/build/services/payments/payments /usr/local/bin/payments
USER appuser

EXPOSE 9103

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PAYMENTS_PORT:-9103}/health" || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/payments"]
