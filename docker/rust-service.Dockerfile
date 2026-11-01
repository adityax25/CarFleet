# Builds one Rust service from the workspace.
#   docker build -f docker/rust-service.Dockerfile --build-arg SERVICE=carfleet-ride .

FROM rust:1-bookworm AS build
ARG SERVICE
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked --package "${SERVICE}" \
    && cp "target/release/${SERVICE}" /usr/local/bin/service

FROM debian:bookworm-slim
# CA certificates are required for TLS connections to managed services.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 carfleet
COPY --from=build /usr/local/bin/service /usr/local/bin/service
USER 10001
EXPOSE 50051
ENTRYPOINT ["/usr/local/bin/service"]
