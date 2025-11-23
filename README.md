# 🚕 Car Fleet: Geospatial Ride-Sharing Engine

**Car Fleet** is a distributed backend system designed to simulate the core infrastructure of ride-sharing platforms like Uber or Lyft. The system is engineered to handle high-throughput, real-time driver location streams and perform low-latency geospatial proximity searches.

> *Note: This project is currently under active development. The "Current Progress" section below tracks the latest implemented features.*

## Architecture Overview

The system is designed around a **Microservices** architecture using a "Hot/Cold" data storage strategy:

* **Communication:** Services communicate via **gRPC** (Protocol Buffers) for low-latency, strict-contract messaging.
* **Hot Storage (Redis):** Uses Redis Geospatial Indexing (`GEOADD`, `GEOSEARCH`) for sub-millisecond driver tracking and proximity queries.
* **Cold Storage (MongoDB):** Handles persistent data like driver profiles, trip history, and user metadata.
* **Infrastructure:** Fully containerized using Docker and Docker Compose.

## Tech Stack

| Component | Technology |
| :--- | :--- |
| **Backend Language** | Python 3.10+ |
| **API Protocol** | gRPC & Protobuf |
| **Real-Time Store** | Redis (v7-alpine) |
| **Persistent Store** | MongoDB (v6.0) |
| **DevOps** | Docker, Docker Compose |
| **Testing** | RedisInsight, gRPCui |

---

## Current Progress

We are currently in the **Ingestion & Data Pipeline Phase**.

### ✅ Phase 1: Foundation & Contracts
- [x] **Infrastructure as Code:** Defined `docker-compose.yml` to orchestrate Redis (Hot Store), MongoDB (Cold Store), and RedisInsight (GUI).
- [x] **API Contracts:** Defined `rideshare.proto` for `DriverService` and `RiderService` to enforce strict typing between client/server.
- [x] **Code Generation:** Implemented the Python gRPC compilation pipeline.

### ✅ Phase 2: Driver Ingestion Service
- [x] **Service Implementation:** Built the `DriverService` gRPC server to handle location streams.
- [x] **Redis Integration:** Connected the Python backend to the Redis Geospatial index using `GEOADD`.
- [x] **End-to-End Verification:** Validated the full pipeline:
    1.  Python Client sends gRPC signal `UpdateLocation`.
    2.  Server writes to Redis `active_drivers` key.
    3.  Data verified visually in RedisInsight and via Redis CLI (`GEOPOS`).

---

## Project Roadmap (Next Steps)

The following modules are planned for immediate development:

### Phase 3: The Rider Service (Query Layer)
- [ ] Implement `GetNearestDrivers` RPC logic.
- [ ] Utilize Redis `GEOSEARCH` to perform radius queries (e.g., "Find drivers within 3km").
- [ ] "Hydrate" response data by fetching driver profiles from MongoDB.

### Phase 4: Simulation Engine
- [ ] Build a multi-threaded Python simulator script (`simulator.py`).
- [ ] Simulate 100+ concurrent drivers moving realistically across the Los Angeles map.
- [ ] Load test the ingestion pipeline.

### Phase 5: Visualization
- [ ] Build a minimal React.js frontend.
- [ ] Visualize moving driver markers in real-time using Mapbox/Leaflet.

---

## Local Setup

To run the current version of the project:

1.  **Clone the repo:**
    ```bash
    git clone https://github.com/adityax25/CarFleet.git
    ```

2.  **Start Infrastructure:**
    ```bash
    docker compose up -d
    ```

3.  **Install Dependencies:**
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ```

4.  **Run the Server:**
    ```bash
    python server.py
    ```