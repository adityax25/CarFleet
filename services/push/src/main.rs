//! Push Gateway: delivers server-initiated events to connected apps.

use carfleet_proto::push::v1::push_service_server::{PushService, PushServiceServer};
use tonic::transport::Server;

/// Implements `carfleet.push.v1.PushService`. Methods not yet implemented
/// return `UNIMPLEMENTED`.
#[derive(Debug, Default)]
struct PushApi;

impl PushService for PushApi {}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    carfleet_runtime::init_tracing();
    let addr = carfleet_runtime::listen_addr()?;

    let (health_reporter, health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_serving::<PushServiceServer<PushApi>>()
        .await;

    tracing::info!(%addr, "push gateway listening");
    Server::builder()
        .add_service(health_service)
        .add_service(PushServiceServer::new(PushApi))
        .serve_with_shutdown(addr, carfleet_runtime::shutdown_signal())
        .await?;

    Ok(())
}
