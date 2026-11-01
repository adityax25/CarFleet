//! Generates Rust types and gRPC stubs from the contracts in `proto/`.
//!
//! A vendored `protoc` binary is used so that builds need no system
//! installation of the protobuf compiler.

const PROTO_ROOT: &str = "../../proto";

const PROTOS: &[&str] = &[
    "carfleet/common/v1/common.proto",
    "carfleet/events/v1/matching_events.proto",
    "carfleet/location/v1/location_service.proto",
    "carfleet/push/v1/push_service.proto",
    "carfleet/ride/v1/ride_service.proto",
];

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut config = prost_build::Config::new();
    config.protoc_executable(protoc_bin_vendored::protoc_bin_path()?);

    let well_known_types = protoc_bin_vendored::include_path()?;
    let includes = [std::path::PathBuf::from(PROTO_ROOT), well_known_types];
    let protos: Vec<_> = PROTOS
        .iter()
        .map(|file| std::path::Path::new(PROTO_ROOT).join(file))
        .collect();

    tonic_prost_build::configure()
        // Unimplemented methods return UNIMPLEMENTED until a service
        // provides them, so skeleton services compile against the full
        // contract.
        .generate_default_stubs(true)
        .compile_with_config(config, &protos, &includes)?;

    println!("cargo:rerun-if-changed={PROTO_ROOT}");
    Ok(())
}
