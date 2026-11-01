# CarFleet 🚕

**A cloud-native, real-time geospatial ride-sharing backend on AWS.**

[![CI](https://github.com/adityax25/CarFleet/actions/workflows/ci.yml/badge.svg)](https://github.com/adityax25/CarFleet/actions/workflows/ci.yml)

CarFleet is the matching engine behind a ride-sharing app. It tracks the live position of every active driver, finds the nearest available drivers for a rider in milliseconds, offers the ride to one driver at a time, and guarantees that no ride is ever assigned to two drivers, even when services crash mid-match.

> **Status: early development.** The [Current Status](#current-status) section tracks exactly what is built versus planned. Nothing in this document describes capability that does not exist.

## The Problem

A ride-sharing platform has two workloads with opposite shapes. Driver location is a firehose: every active driver reports a position every few seconds, so tens of thousands of writes per second that are only valuable for a few seconds each. Rides are the opposite: comparatively rare, long-lived, and correctness-critical, because a rider charged twice or a driver sent to two pickups is a real-world failure.

A single database serving both does neither well. Location data needs to live in memory and be spatially indexed. Ride state needs durable, conditional writes. And the step that connects them, matching a rider to a driver, has to coordinate across both while services restart, messages are redelivered, and drivers ignore offers.

## The Solution

CarFleet splits the system along those lines. A latency-critical location service keeps driver positions in a sharded in-memory geospatial index. A ride service owns the durable ride lifecycle. Matching runs asynchronously off a queue, so a traffic spike delays matches rather than dropping requests. Each service owns its data, and services talk to each other only through typed gRPC contracts.

## Architecture

Planned architecture for the development environment:

```
        Rider app                              Driver app
            │      REST (HTTPS) + WebSocket        │
            └──────────────────┬───────────────────┘
                               ▼
                 ┌──────────────────────────┐
                 │  CloudFront              │
                 └────────────┬─────────────┘
                              ▼
                 ┌──────────────────────────┐
                 │  Envoy edge proxy        │
                 │  JWT auth, rate limits,  │
                 │  REST to gRPC            │
                 └──┬───────────┬────────┬──┘
              gRPC  │           │ gRPC   │ WebSocket
                    ▼           ▼        ▼
         ┌────────────┐ ┌────────────┐ ┌────────────┐
         │    Ride    │ │  Location  │ │    Push    │
         │  (Rust)    │ │   (C++)    │ │  Gateway   │
         │            │ │            │ │  (Rust)    │
         └──┬──────┬──┘ └─────┬──────┘ └─────▲──────┘
            │      │          │              │ offers,
            │      │          ▼              │ live ETAs
            │      │   ┌──────────────┐      │
            │      │   │ Valkey       │      │
            │      │   │ Cluster      │◀──┐  │
            │      │   │ (hot data)   │   │  │
            │      ▼   └──────────────┘   │  │
            │   ┌──────────┐        ┌─────┴──┴───┐
            │   │ RabbitMQ │───────▶│  Matching  │
            │   │  queue   │        │  (Rust)    │
            │   └──────────┘        └────────────┘
            ▼
   ┌─────────────────┐
   │ MongoDB         │
   │ (cold data)     │
   └─────────────────┘
```

| Component | Role |
| :- | :- |
| **Location Service** (C++) | The hot path. Ingests driver location updates and answers nearest-driver queries from a geospatial index sharded by H3 cell. |
| **Ride Service** (Rust) | Owns fares and the ride lifecycle. Every state transition is a conditional write, so a ride can only move forward from the state it is actually in. |
| **Matching Service** (Rust) | Consumes match requests, ranks nearby drivers, and offers the ride to one driver at a time with a timeout. |
| **Push Gateway** (Rust) | Holds WebSocket connections to rider and driver apps and delivers offers and live driver positions. |
| **Envoy** | The single public entry point. Verifies tokens, enforces rate limits, and translates REST calls into gRPC. |
| **Valkey Cluster** | Redis-compatible in-memory store for driver positions, presence, and offer locks. |
| **RabbitMQ** | Durable match queue with dead-lettering, so a crashed matcher never loses a request. |
| **MongoDB** | Durable store for riders, drivers, fares, rides, and trip history. |

## How a Ride Works

```
                       ┌─────────────── driver cancels: rematch ───────────────┐
                       ▼                                                       │
 REQUESTED ──▶ MATCHING ──▶ DRIVER_ASSIGNED ──▶ DRIVER_ARRIVED ──▶ IN_PROGRESS ──▶ COMPLETED
                  │                │                  │
                  ▼                └──────────────────┴──▶ CANCELLED (rider cancels or no-show)
          NO_DRIVERS_FOUND
```

1. The rider requests a fare quote. The price is computed and stored server side with an expiry, so the client never supplies a price.
2. The rider confirms. The Ride Service records the ride and places a match request on the queue.
3. The Matching Service finds nearby available drivers and ranks them by estimated time to pickup.
4. It locks the best candidate and pushes them an offer. A decline or a timeout moves on to the next driver.
5. On acceptance, the Ride Service assigns the driver with a conditional write. This write, not the lock, is what guarantees a ride is never assigned twice, and a unique index guarantees a driver never holds two active rides.
6. If the assigned driver cancels, the ride returns to matching and the rider is rematched automatically, up to a fixed number of attempts.

## Design Decisions

| Decision | Rationale |
| :- | :- |
| **Services own data, not callers** | Boundaries follow the data each service is responsible for (live positions, ride lifecycle), so each store can be chosen and scaled for its own access pattern. |
| **C++ on the hot path, Rust for services** | Location ingest is the highest-volume path and is written in C++. Ride, Matching, and Push have complex concurrent state and use Rust for compile-time memory and thread safety. Neither uses a garbage collector, so tail latency stays predictable. |
| **Geo index sharded by H3 cell** | A Redis geospatial set is a single key and therefore lives on a single shard. Splitting it per H3 cell spreads drivers across the cluster, and a nearby search reads only the rider's cell and its neighbors. |
| **The lock is an optimization, the database is the guarantee** | Offer locks expire, and a paused process can outlive its lock. Ride assignment is a conditional write on the ride's current state, which fences out any stale matcher. |
| **One contract, two protocols** | External REST endpoints are generated from the same Protocol Buffer definitions as the internal gRPC services, so the public API cannot drift from the internal one. |
| **Cloud native and cost aware** | Everything runs on AWS from day one, with no local environment. The development environment uses ECS on Graviton EC2 with Spot capacity and avoids fixed-cost services such as NAT Gateways and load balancers. |

## Tech Stack

| Layer | Technology |
| :- | :- |
| **Services** | C++20 (Location), Rust (Ride, Matching, Push Gateway) |
| **Internal APIs** | gRPC, Protocol Buffers, Buf |
| **External APIs** | REST via Envoy gRPC-JSON transcoding, WebSockets |
| **Hot storage** | Valkey Cluster (Redis compatible), H3 geospatial indexing |
| **Cold storage** | MongoDB Atlas |
| **Messaging** | RabbitMQ (quorum queues, dead-letter exchanges) |
| **Auth** | Amazon Cognito |
| **Compute** | Amazon ECS on EC2 (Graviton, Spot), ECS Service Connect |
| **Edge** | Amazon CloudFront, Envoy |
| **Infrastructure as code** | Terraform |
| **CI/CD** | GitHub Actions, Amazon ECR |
| **Observability** | OpenTelemetry, Prometheus, Grafana, Jaeger |
| **Routing (optional)** | OSRM |

## Current Status

### Completed

- Repository initialized
- Domain model and ride state machine
- API contracts in Protocol Buffers, with REST mappings for the public API, linted with Buf
- Service skeletons: every service builds against the contracts and serves the standard gRPC health protocol
- CI on arm64 runners: contract lint and breaking change checks, Rust format, lint, and tests, C++ build and tests, and container images

### In Progress

- AWS foundation: cost guardrails, networking, ECS cluster, and CI driven deployments

### Upcoming

- Location Service: H3 sharded ingest and nearest-driver search on Valkey Cluster
- Load simulator and observability, with a first benchmark
- Ride Service: fares and the ride lifecycle on MongoDB
- Matching Service: RabbitMQ consumers, offer locks, and fault injection
- Edge: Envoy, Cognito authentication, WebSocket push, CloudFront
- Full trip lifecycle and trip history
- Load and failure testing, with measured results published here
- Optional OSRM routing, then a web frontend for end-to-end testing

## Getting Started

CarFleet runs entirely on AWS and is provisioned with Terraform through GitHub Actions; nothing runs locally. Setup instructions will be added once the development environment can be provisioned.

## License

MIT. See [LICENSE](LICENSE).
