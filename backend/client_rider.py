import grpc
import proto.rideshare_pb2 as pb2
import proto.rideshare_pb2_grpc as pb2_grpc

def run():
    print("Connecting to Rider Service on localhost:50051...")
    
    # 1. Open a gRPC channel (connection)
    with grpc.insecure_channel('localhost:50051') as channel:
        # 2. Create the stub (client) for the RiderService
        stub = pb2_grpc.RiderServiceStub(channel)
        
        # 3. Define the rider's location (Using USC Village coordinates for testing)
        rider_loc = pb2.Location(latitude=34.0256, longitude=-118.2851)
        
        # 4. Create the Request object
        # We are asking for drivers within a 5-mile radius
        request = pb2.RiderRequest(
            rider_id="rider_test_001",
            location=rider_loc,
            radius_miles=5 
        )
        
        print(f"Requesting drivers within 5 miles of ({rider_loc.latitude}, {rider_loc.longitude})...")
        
        try:
            # 5. Call the Remote Procedure (RPC)
            response = stub.GetNearestDrivers(request)
            
            # 6. Process the response
            print(f"Found {len(response.drivers)} drivers:")
            for driver in response.drivers:
                print(f"   Driver {driver.driver_id} is at ({driver.location.latitude}, {driver.location.longitude})")
                
        except grpc.RpcError as e:
            print(f"RPC Failed: {e.details()}")

if __name__ == '__main__':
    run()