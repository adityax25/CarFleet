import grpc
import redis
import time
from concurrent import futures

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
        print(f"Receiving update: {driver_id} is at ({lat}, {lon})")
        
        # B. Save to Redis
        # GEOADD args: (key_name, (longitude, latitude, member_name))
        # Redis uses (lon, lat), Google Maps uses (lat, lon)
        try:
            redis_client.geoadd("active_drivers", (lon, lat, driver_id))
            # C. Send success response
            return pb2.LocationAck(success=True, message="Location stored in Redis")
        
        except Exception as e:
            print(f"ERROR writing to Redis: {e}")
            return pb2.LocationAck(success=False, message=str(e))

class RiderService(pb2_grpc.RiderServiceServicer):
    
    def GetNearestDrivers(self, request, context):
        print(f"Searching for drivers within {request.radius_miles} miles of ({request.location.latitude}, {request.location.longitude})...")
        try:
            # GEORADIUS/GEOSEARCH instructions:
            # Redis expects (longitude, latitude)
            # unit='mi' for miles
            # withcoord=True gives us the location back so we can pass it to the client
            results = redis_client.geosearch(
                name="active_drivers",
                longitude=request.location.longitude,
                latitude=request.location.latitude,
                radius=request.radius_miles,
                unit="mi",
                withcoord=True
            )
            
            # Request.results is a list of [member, (longitude, latitude)]
            # We need to map this to [Driver(driver_id, Location(lat, lon))]
            
            nearby_drivers = []
            for member, (r_lon, r_lat) in results:
                # Convert back to standard (Lat, Lon) for the return object
                loc = pb2.Location(latitude=r_lat, longitude=r_lon)
                driver = pb2.Driver(driver_id=member, location=loc, status="AVAILABLE")
                nearby_drivers.append(driver)
                
            print(f"Found {len(nearby_drivers)} drivers.")
            return pb2.NearbyDriversResponse(drivers=nearby_drivers)

        except Exception as e:
            print(f"ERROR querying Redis: {e}")
            # return empty list on error
            return pb2.NearbyDriversResponse(drivers=[])

def serve():
    # 3. Setup the gRPC Server
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    pb2_grpc.add_DriverServiceServicer_to_server(DriverService(), server)
    pb2_grpc.add_RiderServiceServicer_to_server(RiderService(), server)

    # Open the port
    server.add_insecure_port('[::]:50051')
    print("🚀 Driver Service is running on port 50051...")
    server.start()
    
    try:
        while True:
            time.sleep(86400)
    except KeyboardInterrupt:
        server.stop(0)

if __name__ == '__main__':
    serve()