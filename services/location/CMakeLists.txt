cmake_minimum_required(VERSION 3.25)
project(carfleet_location LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(Protobuf CONFIG REQUIRED)
find_package(gRPC CONFIG REQUIRED)
find_package(GTest CONFIG REQUIRED)

# Generated contract code. Stubs are produced at build time from the shared
# proto/ directory and are never committed.
set(PROTO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../proto")
set(PROTO_GEN_DIR "${CMAKE_CURRENT_BINARY_DIR}/gen")
file(MAKE_DIRECTORY "${PROTO_GEN_DIR}")

set(MESSAGE_PROTOS
  "${PROTO_ROOT}/carfleet/common/v1/common.proto"
  "${PROTO_ROOT}/carfleet/location/v1/location_service.proto"
  "${PROTO_ROOT}/google/api/annotations.proto"
  "${PROTO_ROOT}/google/api/http.proto"
)
set(SERVICE_PROTOS
  "${PROTO_ROOT}/carfleet/location/v1/location_service.proto"
)

# Directory holding google/protobuf/*.proto, for well-known type imports.
get_target_property(PROTOBUF_IMPORT_DIR protobuf::libprotobuf INTERFACE_INCLUDE_DIRECTORIES)

add_library(carfleet_proto STATIC)
target_link_libraries(carfleet_proto PUBLIC protobuf::libprotobuf gRPC::grpc++)
target_include_directories(carfleet_proto PUBLIC "${PROTO_GEN_DIR}")

protobuf_generate(
  TARGET carfleet_proto
  PROTOS ${MESSAGE_PROTOS}
  IMPORT_DIRS "${PROTO_ROOT}" ${PROTOBUF_IMPORT_DIR}
  PROTOC_OUT_DIR "${PROTO_GEN_DIR}"
)
protobuf_generate(
  TARGET carfleet_proto
  PROTOS ${SERVICE_PROTOS}
  LANGUAGE grpc
  GENERATE_EXTENSIONS .grpc.pb.h .grpc.pb.cc
  PLUGIN "protoc-gen-grpc=\$<TARGET_FILE:gRPC::grpc_cpp_plugin>"
  IMPORT_DIRS "${PROTO_ROOT}" ${PROTOBUF_IMPORT_DIR}
  PROTOC_OUT_DIR "${PROTO_GEN_DIR}"
)

# Service implementation, shared by the server binary and the tests.
add_library(location_core STATIC src/location_service.cc)
target_include_directories(location_core PUBLIC src)
target_link_libraries(location_core PUBLIC carfleet_proto)

add_executable(location-service src/main.cc)
target_link_libraries(location-service PRIVATE location_core)

enable_testing()
add_executable(location_test test/location_service_test.cc)
target_link_libraries(location_test PRIVATE location_core GTest::gtest_main)
include(GoogleTest)
gtest_discover_tests(location_test)
