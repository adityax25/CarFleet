//! Matching Service: consumes match requests and offers rides to drivers.
//!
//! Matching exposes no gRPC API of its own; it is driven by the RabbitMQ
//! matching queues. It still serves the standard gRPC health protocol so the
//! orchestrator can tell whether it is alive.

use tonic::transport::Server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    carfleet_runtime::init_tracing();
    let addr = carfleet_runtime::listen_addr()?;

    let (health_reporter, health_service) = tonic_health::server::health_reporter();
    // The empty service name reports the health of the process as a whole.
    health_reporter
        .set_service_status("", tonic_health::ServingStatus::Serving)
        .await;

    tracing::info!(%addr, "matching service listening for health checks");
    Server::builder()
        .add_service(health_service)
        .serve_with_shutdown(addr, carfleet_runtime::shutdown_signal())
        .await?;

    Ok(())
}
