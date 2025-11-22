# 🚕 Car Fleet: Geospatial Ride-Sharing Engine

**Car Fleet** is a distributed backend system designed to simulate the core infrastructure of ride-sharing platforms like Uber or Lyft. The system is engineered to handle high-throughput, real-time driver location streams and perform low-latency geospatial proximity searches.

> *Note: This project is currently under active development. The "Current Progress" section below tracks the latest implemented features.*

## 🏛️ Architecture Overview

The system is designed around a **Microservices** architecture using a "Hot/Cold" data storage strategy:

* **Communication:** Services communicate via **gRPC** (Protocol Buffers) for low-latency, strict-contract messaging.
* **Hot Storage (Redis):** Uses Redis Geospatial Indexing (`GEOADD`, `GEOSEARCH`) for sub-millisecond driver tracking and proximity queries.
* **Cold Storage (MongoDB):** Handles persistent data like driver profiles, trip history, and user metadata.
* **Infrastructure:** Fully containerized using Docker and Docker Compose.

## 🛠️ Tech Stack

| Component | Technology |
| :--- | :--- |
| **Backend Language** | Python 3.10+ |
| **API Protocol** | gRPC & Protobuf |
| **Real-Time Store** | Redis (v7-alpine) |
| **Persistent Store** | MongoDB (v6.0) |
| **DevOps** | Docker, Docker Compose |
| **Testing** | RedisInsight, gRPCui |

---

## 📍 Current Progress

We are currently in the **Infrastructure & Ingestion Phase**.

### ✅ Phase 1: Foundation & Contracts
- [x] **Infrastructure as Code:** Defined `docker-compose.yml` to orchestrate Redis (Hot Store), MongoDB (Cold Store), and RedisInsight (GUI).
- [x] **API Contracts:** Defined `rideshare.proto` for `DriverService` and `RiderService` to enforce strict typing between client/server.
- [x] **Code Generation:** Implemented the Python gRPC compilation pipeline.

### 🚧 Phase 2: Driver Ingestion Service (In Progress)
- [ ] **Service Implementation:** Build the `DriverService` gRPC server.
- [ ] **Redis Integration:** Connect the Python backend to the Redis Geospatial index.
- [ ] **End-to-End Verification:** Validate the `UpdateLocation` stream from Client → Server → Redis.

---

## 🏃‍♂️ Local Setup

To run the current version of the project:

1.  **Clone the repo:**
    ```bash
    git clone [https://github.com/adityax25/CarFleet.git](https://github.com/adityax25/CarFleet.git)
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