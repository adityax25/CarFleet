import { NextRequest, NextResponse } from 'next/server';

const OSRM_URL = 'http://localhost:5001/route/v1/driving';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const start = searchParams.get('start'); // "lon,lat"
    const end = searchParams.get('end');     // "lon,lat"

    if (!start || !end) {
        return NextResponse.json({ error: 'Missing start or end coordinates' }, { status: 400 });
    }

    try {
        // OSRM Format: /start_lon,start_lat;end_lon,end_lat
        const url = `${OSRM_URL}/${start};${end}?overview=full&geometries=geojson`;

        const res = await fetch(url);
        const data = await res.json();

        return NextResponse.json(data);
    } catch (error) {
        console.error("OSRM Proxy Error:", error);
        return NextResponse.json({ error: 'Failed to fetch route' }, { status: 500 });
    }
}
