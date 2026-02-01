# Car Fleet: Geospatial Ride-Sharing Engine 🚕

**Car Fleet** is a distributed backend system designed to simulate the core infrastructure of ride-sharing platforms. It handles high-throughput, real-time driver location streams and performs low-latency geospatial proximity searches.

## Architecture Overview

The system follows a **Microservices** architecture:

*   **Communication**: gRPC (Protocol Buffers) for low-latency, strict-contract messaging.
*   **Hot Storage (Redis)**: Uses Redis Geospatial Indexing for sub-millisecond driver tracking and proximity queries.
*   **Cold Storage (MongoDB)**: Handles persistent data like driver profiles and trip history.
*   **Routing Engine (OSRM)**: Self-hosted Open Source Routing Machine for calculating realistic driving paths on actual street maps.
*   **Infrastructure**: Fully containerized using Docker and Docker Compose.

## Tech Stack

| Component | Technology |
| :--- | :--- |
| **Backend Language** | Python 3.10+ |
| **API Protocol** | gRPC & Protobuf |
| **Real-Time Store** | Redis (v7-alpine) |
| **Persistent Store** | MongoDB (v6.0) |
| **Routing Engine** | OSRM (Open Source Routing Machine) |
| **DevOps** | Docker, Docker Compose |

## Setup & Installation

### Prerequisites
*   Docker & Docker Compose
*   Python 3.9+

### 1. Initialize Map Data (First Time Only)
The system requires real-world map data for Los Angeles/California. Run the setup script to download and process the data:

```bash
./setup_osrm.sh
```
*Note: This downloads ~500MB of data and may take a few minutes to process.*

### 2. Start Infrastructure
Spin up the database and routing services:

```bash
docker compose up -d
```

### 3. Run the Backend
Start the main gRPC server:

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python server.py
```

### 4. Run Simulation
Simulate 1000+ drivers moving around Los Angeles:

```bash
python simulator.py
```

## Features

### Dynamic Search Radius
The Rider Service implements an expanding search radius to balance speed and availability:
1.  **0s**: Search within 0.5 miles.
2.  **3s**: Expand to 1.5 miles.
3.  **7s**: Expand to 3.0 miles.
4.  **15s**: Expand to 5.0 miles (Max).

### Concurrency
Uses Redis atomic locking (Lua scripts) to ensure a driver cannot be assigned to multiple riders simultaneously.