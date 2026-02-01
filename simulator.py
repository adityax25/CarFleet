import grpc
import time
import random
import threading
import requests
import logging
import proto.rideshare_pb2 as pb2
import proto.rideshare_pb2_grpc as pb2_grpc
from concurrent.futures import ThreadPoolExecutor

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] [Simulator] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# Configuration

# Configuration
NUM_DRIVERS = 1000  # Target: 1000 concurrent drivers
OSRM_URL = "http://localhost:5001/route/v1/driving"
SERVER_ADDRESS = "localhost:50051"

# LA Bounding Box (Approximate)
# We want drivers to spawn in valid LA areas
LA_MIN_LAT = 33.70
LA_MAX_LAT = 34.33
LA_MIN_LON = -118.66
LA_MAX_LON = -118.15

class DriverAgent:
    
    def __init__(self, driver_id):
        self.driver_id = driver_id
        self.channel = grpc.insecure_channel(SERVER_ADDRESS)
        self.stub = pb2_grpc.DriverServiceStub(self.channel)
        
        # Start at a random location
        self.lat = random.uniform(LA_MIN_LAT, LA_MAX_LAT)
        self.lon = random.uniform(LA_MIN_LON, LA_MAX_LON)
        self.status = "AVAILABLE"
        self.current_route = [] # List of [lon, lat] points
        self.route_index = 0

    def get_new_destination(self):
        """Pick a new random point in LA and get a route to it from OSRM"""
        # Pick a destination close by (simulating local trips, not cross-city freeway runs)
        # 0.05 degrees is roughly 3-4 miles
        radius = 0.05
        dest_lat = self.lat + random.uniform(-radius, radius)
        dest_lon = self.lon + random.uniform(-radius, radius)
        
        # Clamp to bounds just in case
        dest_lat = max(LA_MIN_LAT, min(LA_MAX_LAT, dest_lat))
        dest_lon = max(LA_MIN_LON, min(LA_MAX_LON, dest_lon))
        
        # OSRM expects: {lon_start},{lat_start};{lon_end},{lat_end}
        url = f"{OSRM_URL}/{self.lon},{self.lat};{dest_lon},{dest_lat}?overview=full&geometries=geojson"
        
        try:
            resp = requests.get(url, timeout=2)
            if resp.status_code == 200:
                data = resp.json()
                if data['code'] == 'Ok':
                    # Extract the geometry (list of coordinates) provided by OSRM
                    # GeoJSON is [lon, lat]
                    self.current_route = data['routes'][0]['geometry']['coordinates']
                    self.route_index = 0
                    self.status = "DRIVING"
        except Exception as e:
            # If OSRM fails (or isn't ready), just wait a bit
            pass

    def tick(self):
        """Move one step along the route and update server"""
        if not self.current_route or self.route_index >= len(self.current_route):
            self.get_new_destination()
            return

        # Move to next point in route
        # In a real game engine, we would interpolate based on time delta.
        # For this simulator, we just jump to the next OSRM geometry point every tick.
        point = self.current_route[self.route_index]
        self.lon, self.lat = point[0], point[1]
        self.route_index += 1

        # Send Update to Server
        try:
            loc = pb2.Location(latitude=self.lat, longitude=self.lon)
            driver_msg = pb2.Driver(
                driver_id=self.driver_id,
                location=loc,
                status=self.status
            )
            self.stub.UpdateLocation(driver_msg)
        except grpc.RpcError:
            pass # Ignore transient connection errors

def run_driver(driver_id):
    agent = DriverAgent(driver_id)
    # Stagger start times to avoid thundering herd on OSRM
    time.sleep(random.uniform(0, 5))
    
    while True:
        agent.tick()
        time.sleep(1) # Update every 1 second

def main():
    logging.info(f"Starting Simulation with {NUM_DRIVERS} Drivers in Los Angeles...")
    logging.info(f"Routing Engine: {OSRM_URL}")
    
    with ThreadPoolExecutor(max_workers=NUM_DRIVERS) as executor:
        for i in range(NUM_DRIVERS):
            driver_id = f"driver_{i:04d}"
            executor.submit(run_driver, driver_id)

if __name__ == "__main__":
    main()
