# CarFleet: Geospatial Ride-Sharing Engine 🚕

**CarFleet** is a distributed backend system designed to simulate the core infrastructure of ride-sharing platforms. It handles high-throughput, real-time driver location streams and performs low-latency geospatial proximity searches.

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
| **Frontend Framework** | Next.js 15 (React 19) |
| **Styling** | TailwindCSS v4 |
| **Maps & Visualization** | Mapbox GL JS |
| **State Management** | React Reference State (Ref) for 60fps Perf |
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
*   Node.js 18+ (for Frontend)

### 1. Initialize Map Data (First Time Only)
The system requires real-world map data for Los Angeles/California. Run the setup script to download and process the data:

```bash
cd backend
./setup_osrm.sh
cd ..
```
*Note: This downloads ~500MB of data and may take a few minutes to process.*

### 2. Start Infrastructure
Spin up the database and routing services:

```bash
docker compose up -d
```

### 3. Run the Backend & Simulator
Navigate to the backend directory and start the services:

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python server.py
# In another terminal:
python simulator.py
```

### 4. Run the Frontend
Launch the Next.js web application:

```bash
cd frontend
npm install
npm run dev
```

## Comprehensive Feature List

### 🖥️ Frontend (React & TypeScript)
*   **High-Performance Rendering**: Uses `requestAnimationFrame` for buttery smooth 60fps car interpolation, bypassing React state for heavy animation loops.
*   **3D Visualization**: Custom 3D SVG Car models that rotate and bank based on the vehicle's actual bearing.
*   **Smart Camera**: "Cinematic Mode" automatically zooms and pans to frame the entire route (Pickup ➔ Dropoff) when a ride starts.
*   **Premium UI/UX**:
    *   **Radar Pulse**: "Scanning" animation during driver search.
    *   **Trail Clearing**: Visual path "erasing" as the driver completes the route.
    *   **Glassmorphism**: Modern, translucent UI panels.

### 🚗 Simulation Engine
*   **Massive Scale**: Capable of simulating 1000+ concurrent drivers in real-time.
*   **Real-World Routing**: Drivers don't fly; they follow actual street geometry using OSRM (Open Source Routing Machine).
*   **Scattered Traffic**: Algorithms distribute drivers realistically across local streets rather than clustering them on highways.

### ⚡ Backend & Infrastructure
*   **Microservices**: Fully decoupled Backend (Python) and Frontend (Node/Next.js).
*   **gRPC Contracts**: Strict type safety between services using Protocol Buffers.
*   **Geospatial Sharding**: Redis `GEOSEARCH` for O(log N) proximity lookups.
*   **Atomic Locking**: Lua scripts ensure a driver cannot be double-booked by concurrent riders.
*   **Dynamic Search Radius**: Search logic expands radius (0.5mi ➔ 5.0mi) over time if no drivers are found immediately.