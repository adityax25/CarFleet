import grpc
import redis
import time
import logging
from concurrent import futures

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# 1. Import the Contract
import proto.rideshare_pb2 as pb2
import proto.rideshare_pb2_grpc as pb2_grpc

# 2. Setup the Redis "Hot" Database connection
# Mac talks to Docker via port 6379
redis_client = redis.Redis(host='localhost', port='6379', decode_responses=True)

class DriverService(pb2_grpc.DriverServiceServicer):
    """
    This class implements the methods defined in the .proto file.
    """
    def UpdateLocation(self, request, context):
        # A. Extract data from the incoming request
        driver_id = request.driver_id
        lat = request.location.latitude
        lon = request.location.longitude
        # logging.debug(f"Update: {driver_id} -> ({lat}, {lon})") # detailed logs commented out for noise
        
        # B. Save to Redis
        try:
            redis_client.geoadd("active_drivers", (lon, lat, driver_id))
            return pb2.LocationAck(success=True, message="Location stored")
        
        except Exception as e:
            logging.error(f"Redis Write Error: {e}")
            return pb2.LocationAck(success=False, message=str(e))

class RiderService(pb2_grpc.RiderServiceServicer):
    
    def GetNearestDrivers(self, request, context):
        logging.info(f"Search Request: Rider {request.rider_id} at ({request.location.latitude}, {request.location.longitude})")
        
        found_drivers = []
        
        # If we are just visualizing (large radius), skip the expanding wait times?
        # For now, let's just do one large scan if it's a map view
        # We can infer 'Map View' if radius > 5? Or just simply scan.
        
        # Simplified Logic for Visualization:
        # Just scan the requested radius immediately.
        search_radius = request.radius_miles if request.radius_miles > 0 else 5.0
        
        logging.info(f"  >> Scanning radius {search_radius} miles...")
        
        # Redis GEORADIUS
        results = redis_client.geosearch(
            name="active_drivers",
            longitude=request.location.longitude,
            latitude=request.location.latitude,
            radius=search_radius,
            unit="mi",
            withcoord=True,
            count=2000 # Limit to 2000 to avoid blowing up response
        )
        
        for member, (r_lon, r_lat) in results:
            # Check Availability
            # Optimization: Pipelining this would be better for 1000+ keys, 
            # but for now synchronous get is 'ok' for local simulation.
            status_key = f"driver_status:{member}"
            current_status = redis_client.get(status_key)
            if not current_status: 
                current_status = "AVAILABLE"
            
            # For map visualization, we might want to see BUSY drivers too?
            # User asked to "see all available cars". 
            # Let's show AVAILABLE for now, or maybe ALL if we add a flag later.
            if current_status == "AVAILABLE":
                loc = pb2.Location(latitude=r_lat, longitude=r_lon)
                d = pb2.Driver(driver_id=member, location=loc, status="AVAILABLE")
                found_drivers.append(d)
        
        logging.info(f"  ✅ Found {len(found_drivers)} drivers within {search_radius} miles.")
        return pb2.NearbyDriversResponse(drivers=found_drivers)

def serve():
    # 3. Setup the gRPC Server
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    pb2_grpc.add_DriverServiceServicer_to_server(DriverService(), server)
    pb2_grpc.add_RiderServiceServicer_to_server(RiderService(), server)

    # Open the port
    server.add_insecure_port('[::]:50051')
    logging.info("Driver Service is running on port 50051...")
    server.start()
    
    try:
        while True:
            time.sleep(86400)
    except KeyboardInterrupt:
        server.stop(0)

if __name__ == '__main__':
    serve()