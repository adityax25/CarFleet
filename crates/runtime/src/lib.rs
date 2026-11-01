//! Process setup shared by every CarFleet Rust service.

use std::net::SocketAddr;

use tracing_subscriber::EnvFilter;

/// Port every service listens on inside its container.
pub const DEFAULT_LISTEN_ADDR: &str = "0.0.0.0:50051";

/// Installs JSON structured logging. The level comes from `RUST_LOG` and
/// defaults to `info`.
pub fn init_tracing() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(filter)
        .with_current_span(false)
        .init();
}

/// Address to serve gRPC on, from `LISTEN_ADDR` or the default.
pub fn listen_addr() -> Result<SocketAddr, std::net::AddrParseError> {
    std::env::var("LISTEN_ADDR")
        .unwrap_or_else(|_| DEFAULT_LISTEN_ADDR.to_owned())
        .parse()
}

/// Resolves when the process is asked to stop: SIGTERM, which ECS sends
/// before stopping a task, or Ctrl+C.
pub async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(error) = tokio::signal::ctrl_c().await {
            tracing::error!(%error, "failed to listen for Ctrl+C");
            std::future::pending::<()>().await;
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(error) => {
                tracing::error!(%error, "failed to listen for SIGTERM");
                std::future::pending::<()>().await;
            }
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {}
        () = terminate => {}
    }
    tracing::info!("shutdown requested, draining in-flight requests");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_listen_addr_parses() {
        let addr: SocketAddr = DEFAULT_LISTEN_ADDR.parse().expect("valid address");
        assert_eq!(addr.port(), 50051);
    }
}
