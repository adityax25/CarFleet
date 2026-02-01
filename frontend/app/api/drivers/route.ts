import { NextRequest, NextResponse } from 'next/server';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

// Load the Protobuf
const PROTO_PATH = path.join(process.cwd(), 'proto/rideshare.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const rideshare = protoDescriptor.rideshare;

// Create gRPC Client
// Note: In production, you might want to create this singleton or cache it.
const client = new rideshare.RiderService(
    'localhost:50051',
    grpc.credentials.createInsecure()
);

export async function GET(request: NextRequest): Promise<NextResponse> {
    const searchParams = request.nextUrl.searchParams;
    const lat = parseFloat(searchParams.get('lat') || '34.0256');
    const lon = parseFloat(searchParams.get('lon') || '-118.2851');
    const radius = parseInt(searchParams.get('radius') || '5');
    const riderId = searchParams.get('rider_id') || 'web_user';

    return new Promise((resolve) => {
        const payload = {
            rider_id: riderId,
            location: {
                latitude: lat,
                longitude: lon
            },
            radius_miles: radius
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client.GetNearestDrivers(payload, (err: any, response: any) => {
            if (err) {
                console.error("gRPC Error:", err);
                resolve(NextResponse.json({ error: err.message }, { status: 500 }));
            } else {
                resolve(NextResponse.json(response));
            }
        });
    });
}
