# Overrides vcpkg's default arm64 Linux triplet to build release binaries
# only. Debug builds of dependencies are never used in images and would
# double the dependency build time.
set(VCPKG_TARGET_ARCHITECTURE arm64)
set(VCPKG_CRT_LINKAGE dynamic)
set(VCPKG_LIBRARY_LINKAGE static)
set(VCPKG_CMAKE_SYSTEM_NAME Linux)
set(VCPKG_BUILD_TYPE release)
