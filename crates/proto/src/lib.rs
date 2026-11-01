//! Generated CarFleet contract types and gRPC stubs.
//!
//! The module tree mirrors the protobuf package names, which the generated
//! code relies on to resolve references between packages.

#![allow(clippy::all, clippy::pedantic)]

pub mod carfleet {
    pub mod common {
        pub mod v1 {
            tonic::include_proto!("carfleet.common.v1");
        }
    }

    pub mod events {
        pub mod v1 {
            tonic::include_proto!("carfleet.events.v1");
        }
    }

    pub mod location {
        pub mod v1 {
            tonic::include_proto!("carfleet.location.v1");
        }
    }

    pub mod push {
        pub mod v1 {
            tonic::include_proto!("carfleet.push.v1");
        }
    }

    pub mod ride {
        pub mod v1 {
            tonic::include_proto!("carfleet.ride.v1");
        }
    }
}

pub use carfleet::{common, events, location, push, ride};
