# Builds the Location Service. Run from the repository root:
#   docker build -f services/location/Dockerfile .

FROM debian:bookworm AS toolchain
RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
       build-essential ca-certificates cmake curl git ninja-build pkg-config tar unzip zip \
    && rm -rf /var/lib/apt/lists/*
# vcpkg ships no prebuilt tools for arm64 Linux, so it uses the system ones.
ENV VCPKG_FORCE_SYSTEM_BINARIES=1
ARG VCPKG_COMMIT=9eec002df1cd109f8f104cd966a763daf9751489
RUN git clone https://github.com/microsoft/vcpkg.git /opt/vcpkg \
    && git -C /opt/vcpkg checkout "${VCPKG_COMMIT}" \
    && /opt/vcpkg/bootstrap-vcpkg.sh -disableMetrics

# Dependencies are installed in their own layer, keyed only on the manifest,
# so the slow gRPC build is reused until the dependency list changes.
FROM toolchain AS deps
COPY services/location/vcpkg.json /deps/vcpkg.json
COPY services/location/triplets /deps/triplets
RUN /opt/vcpkg/vcpkg install \
    --x-manifest-root=/deps \
    --x-install-root=/opt/vcpkg_installed \
    --overlay-triplets=/deps/triplets \
    --clean-after-build

FROM deps AS build
WORKDIR /src
COPY proto proto
COPY services/location services/location
RUN cmake -S services/location -B build -G Ninja \
       -DCMAKE_BUILD_TYPE=Release \
       -DCMAKE_TOOLCHAIN_FILE=/opt/vcpkg/scripts/buildsystems/vcpkg.cmake \
       -DVCPKG_MANIFEST_INSTALL=OFF \
       -DVCPKG_INSTALLED_DIR=/opt/vcpkg_installed \
       -DVCPKG_OVERLAY_TRIPLETS=/src/services/location/triplets \
    && cmake --build build \
    && ctest --test-dir build --output-on-failure

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 carfleet
COPY --from=build /src/build/location-service /usr/local/bin/location-service
USER 10001
EXPOSE 50051
ENTRYPOINT ["/usr/local/bin/location-service"]
