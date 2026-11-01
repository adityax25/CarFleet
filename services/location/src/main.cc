// Location Service entry point: serves the gRPC API and the standard health
// protocol until SIGTERM or SIGINT, then drains in-flight calls.

#include <signal.h>

#include <chrono>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <string>

#include <grpcpp/grpcpp.h>
#include <grpcpp/health_check_service_interface.h>

#include "location_service.h"

namespace {

constexpr char kDefaultListenAddr[] = "0.0.0.0:50051";
constexpr auto kShutdownGracePeriod = std::chrono::seconds(10);

std::string ListenAddr() {
  const char* value = std::getenv("LISTEN_ADDR");
  return value != nullptr ? value : kDefaultListenAddr;
}

}  // namespace

int main() {
  // Block termination signals before gRPC starts its threads, so they inherit
  // the mask and only the sigwait below receives them.
  sigset_t stop_signals;
  sigemptyset(&stop_signals);
  sigaddset(&stop_signals, SIGTERM);
  sigaddset(&stop_signals, SIGINT);
  pthread_sigmask(SIG_BLOCK, &stop_signals, nullptr);

  grpc::EnableDefaultHealthCheckService(true);

  carfleet::location::LocationServiceImpl service;
  const std::string addr = ListenAddr();

  grpc::ServerBuilder builder;
  builder.AddListeningPort(addr, grpc::InsecureServerCredentials());
  builder.RegisterService(&service);
  std::unique_ptr<grpc::Server> server = builder.BuildAndStart();
  if (!server) {
    std::cerr << R"({"level":"ERROR","message":"failed to start server","addr":")"
              << addr << "\"}" << std::endl;
    return EXIT_FAILURE;
  }

  server->GetHealthCheckService()->SetServingStatus(
      carfleet::location::v1::LocationService::service_full_name(), true);
  std::cout << R"({"level":"INFO","message":"location service listening","addr":")"
            << addr << "\"}" << std::endl;

  int received = 0;
  sigwait(&stop_signals, &received);

  std::cout << R"({"level":"INFO","message":"shutdown requested, draining in-flight requests"})"
            << std::endl;
  server->GetHealthCheckService()->Shutdown();
  server->Shutdown(std::chrono::system_clock::now() + kShutdownGracePeriod);
  return EXIT_SUCCESS;
}
