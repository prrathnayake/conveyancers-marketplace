FROM alpine:3.19 as build
RUN apk add --no-cache g++ cmake
WORKDIR /app
COPY . /app
RUN cmake -S . -B build && cmake --build build -j
FROM alpine:3.19
WORKDIR /app
COPY --from=build /app/build/jobs /usr/local/bin/jobs
EXPOSE 9002
CMD ["/usr/local/bin/jobs"]
