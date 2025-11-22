import grpc

# 1. Import the Contract
import proto.rideshare_pb2 as pb2
import proto.rideshare_pb2_grpc as pb2_grpc

def run():
    # 2. Connect to Localhost:50051
    # We use 'insecure_channel' because we haven't set up SSL certificates
    print("🔌 Connecting to Driver Service...")
    with grpc.insecure_channel('localhost:50051') as channel:
        # 3. Create the "Stub" (The Client Object)
        stub = pb2_grpc.DriverServiceStub(channel)
        
        # 4. Create the Data Payload (The Proto Message). Simulating a driver at the USC Village!
        driver_loc = pb2.Location(latitude=34.0256, longitude=-118.2851)
        driver_update = pb2.Driver(
            driver_id="driver_tommy_trojan", 
            location=driver_loc, 
            status="available"
        )

        # 5. Send gRPC Request
        print(f"📤 Sending update for {driver_update.driver_id}...")
        try:
            response = stub.UpdateLocation(driver_update)
            print(f"✅ Server replied: {response.message}")
            print(f"   Success Status: {response.success}")
        except grpc.RpcError as e:
            print(f"❌ gRPC Call Failed: {e.details()}")

if __name__ == '__main__':
    run()