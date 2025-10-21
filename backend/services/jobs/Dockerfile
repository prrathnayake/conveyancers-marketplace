FROM debian:bookworm-slim as build
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
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
    && cmake --build build -j --target jobs

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=build /app/build/services/jobs/jobs /usr/local/bin/jobs
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libstdc++6 \
        libgcc-s1 \
        libssl3 \
        libpq5 \
        libpqxx-6.4 \
    && rm -rf /var/lib/apt/lists/*
EXPOSE 9002
CMD ["/usr/local/bin/jobs"]
