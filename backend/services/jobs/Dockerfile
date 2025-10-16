FROM alpine:3.19 as build
RUN apk add --no-cache build-base cmake ninja
WORKDIR /app
COPY . /app
RUN cmake -S . -B build && cmake --build build -j --target jobs

FROM alpine:3.19
WORKDIR /app
COPY --from=build /app/build/services/jobs/jobs /usr/local/bin/jobs
EXPOSE 9002
CMD ["/usr/local/bin/jobs"]
