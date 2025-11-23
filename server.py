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

def serve():
    # 3. Setup the gRPC Server
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    pb2_grpc.add_DriverServiceServicer_to_server(DriverService(), server)

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