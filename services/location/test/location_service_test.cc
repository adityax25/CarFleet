#include <memory>

#include <grpcpp/grpcpp.h>
#include <gtest/gtest.h>

#include "location_service.h"

namespace carfleet::location {
namespace {

class LocationServiceTest : public ::testing::Test {
 protected:
  void SetUp() override {
    grpc::ServerBuilder builder;
    builder.RegisterService(&service_);
    server_ = builder.BuildAndStart();
    ASSERT_NE(server_, nullptr);
    stub_ = v1::LocationService::NewStub(server_->InProcessChannel(grpc::ChannelArguments()));
  }

  void TearDown() override { server_->Shutdown(); }

  LocationServiceImpl service_;
  std::unique_ptr<grpc::Server> server_;
  std::unique_ptr<v1::LocationService::Stub> stub_;
};

TEST_F(LocationServiceTest, UnimplementedMethodsReturnUnimplemented) {
  grpc::ClientContext context;
  v1::FindNearbyRequest request;
  v1::FindNearbyResponse response;

  const grpc::Status status = stub_->FindNearby(&context, request, &response);

  EXPECT_EQ(status.error_code(), grpc::StatusCode::UNIMPLEMENTED);
}

}  // namespace
}  // namespace carfleet::location
