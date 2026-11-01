//! Ride Service: fare quotes and the ride lifecycle.

use carfleet_proto::ride::v1::ride_service_server::{RideService, RideServiceServer};
use tonic::transport::Server;

/// Implements `carfleet.ride.v1.RideService`. Methods not yet implemented
/// return `UNIMPLEMENTED`.
#[derive(Debug, Default)]
struct RideApi;

impl RideService for RideApi {}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    carfleet_runtime::init_tracing();
    let addr = carfleet_runtime::listen_addr()?;

    let (health_reporter, health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_serving::<RideServiceServer<RideApi>>()
        .await;

    tracing::info!(%addr, "ride service listening");
    Server::builder()
        .add_service(health_service)
        .add_service(RideServiceServer::new(RideApi))
        .serve_with_shutdown(addr, carfleet_runtime::shutdown_signal())
        .await?;

    Ok(())
}
