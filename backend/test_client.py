import grpc
import time

# 1. Import the Contract
import proto.rideshare_pb2 as pb2
import proto.rideshare_pb2_grpc as pb2_grpc

def update_driver_location(stub):
    print("\n[Driver] Sending location update...")
    # Simulating a driver at the USC Village!
    driver_loc = pb2.Location(latitude=34.0256, longitude=-118.2851)
    driver_update = pb2.Driver(
        driver_id="driver_tommy_trojan", 
        location=driver_loc, 
        status="available"
    )

    try:
        response = stub.UpdateLocation(driver_update)
        print(f"Server replied: {response.message}")
        print(f"  Success Status: {response.success}")
    except grpc.RpcError as e:
        print(f"ERROR: gRPC Call Failed: {e.details()}")

def get_drivers(stub):
    # USC Coordinates (Approx center of campus)
    lat = 34.0224
    lon = -118.2851
    radius = 5 # miles

    print(f"\n[Rider] Searching for drivers within {radius} miles of USC ({lat}, {lon})...")
    
    request = pb2.RiderRequest(
        rider_id="rider_aditya",
        location=pb2.Location(latitude=lat, longitude=lon),
        radius_miles=radius
    )

    try:
        response = stub.GetNearestDrivers(request)
        print(f"[Rider] Success! Found {len(response.drivers)} drivers:")
        for driver in response.drivers:
            print(f" - {driver.driver_id} at ({driver.location.latitude}, {driver.location.longitude})")
    except grpc.RpcError as e:
        print(f"[Rider] Error: {e}")

def run():
    # 2. Connect to Localhost:50051
    print("Connecting to gRPC Server...")
    with grpc.insecure_channel('localhost:50051') as channel:
        driver_stub = pb2_grpc.DriverServiceStub(channel)
        rider_stub = pb2_grpc.RiderServiceStub(channel)
        
        # 1. Update Driver Location (To ensure there is data)
        update_driver_location(driver_stub)
        
        # Give Redis a split second to persist (though it's in-memory, good for distinct logs)
        time.sleep(0.5)

        # 2. Find Drivers
        get_drivers(rider_stub)

if __name__ == '__main__':
    run()