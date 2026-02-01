"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Map, { Marker, Source, Layer, NavigationControl as MapboxNavigationControl, ViewState } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { X, Check, Navigation } from 'lucide-react';
import mapboxgl from 'mapbox-gl';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import * as turf from '@turf/turf';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// --- Types ---
interface Location {
    latitude: number;
    longitude: number;
}
interface Driver {
    driver_id: string;
    location: Location;
    status: string;
    bearing?: number; // Add bearing for rotation
}
type RideState =
    | 'IDLE'
    | 'PICKUP_SELECTION'
    | 'DROPOFF_SELECTION'
    | 'CONFIRMING'
    | 'SEARCHING'
    | 'DRIVER_EN_ROUTE'
    | 'DRIVER_ARRIVED'
    | 'RIDE_IN_PROGRESS'
    | 'COMPLETED';

const LA_CENTER = { lat: 34.0256, lon: -118.2851 };

// --- Helpers ---
function lerp(start: number, end: number, t: number) {
    return start * (1 - t) + end * t;
}

// --- Icons ---
const WhiteCarIcon = ({ bearing }: { bearing: number }) => (
    <div
        className="relative will-change-transform" // Removed transition-transform to allow smooth JS interpolation
        style={{
            width: '40px',
            height: '40px',
            transform: `rotate(${bearing}deg)`
        }}
    >
        {/* Soft Shadow (Stationary relative to car rotation) */}
        <div className="absolute inset-0 bg-black/30 blur-[4px] rounded-full scale-[0.8]" style={{ transform: 'translateY(10%)' }} />

        {/* 3D Car Body (Top Down View) */}
        <svg width="100%" height="100%" viewBox="0 0 200 400" fill="none" className="drop-shadow-lg">
            {/* Chassis / Body Shape */}
            <path d="M 40,60 C 40,30 160,30 160,60 L 160,340 C 160,370 40,370 40,340 Z" fill="#e5e5e5" stroke="#a3a3a3" strokeWidth="4" />

            {/* Roof / Windshield Area */}
            <path d="M 50,110 L 150,110 L 140,290 L 60,290 Z" fill="#f5f5f5" stroke="#d4d4d4" strokeWidth="2" />

            {/* Front Windshield (Dark) */}
            <path d="M 52,110 L 148,110 L 146,150 L 54,150 Z" fill="#333" />

            {/* Rear Window (Dark) */}
            <path d="M 60,290 L 140,290 L 138,260 L 62,260 Z" fill="#333" />

            {/* Headlights (Bright White/Blue) */}
            <path d="M 45,65 Q 55,50 65,65 L 65,75 L 45,75 Z" fill="#dbeafe" />
            <path d="M 135,65 Q 145,50 155,65 L 155,75 L 135,75 Z" fill="#dbeafe" />

            {/* Taillights (Red) */}
            <path d="M 45,335 Q 55,350 65,335 L 65,325 L 45,325 Z" fill="#ef4444" />
            <path d="M 135,335 Q 145,350 155,335 L 155,325 L 135,325 Z" fill="#ef4444" />
        </svg>
    </div>
);

const PinIcon = ({ color, bounce }: { color: string, bounce?: boolean }) => (
    <div className={`relative ${bounce ? 'animate-bounce' : ''}`}>
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1 bg-black/50 blur-[2px] rounded-full" />
        <svg width="40" height="40" viewBox="0 0 24 24" fill={color} stroke="white" strokeWidth="2" className="drop-shadow-xl">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            <circle cx="12" cy="9" r="2.5" fill="black" stroke="none" />
        </svg>
    </div>
);

export default function DriverMap() {
    // --- State: Map & Data --
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [viewState, setViewState] = useState<any>({
        longitude: LA_CENTER.lon,
        latitude: LA_CENTER.lat,
        zoom: 14,
        bearing: 0,
        pitch: 15,
        padding: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    const [drivers, setDrivers] = useState<Record<string, Driver>>({});
    const [displayDrivers, setDisplayDrivers] = useState<Record<string, Driver>>({});
    const driversRef = useRef<Record<string, Driver>>({});
    const prevDriversRef = useRef<Record<string, Driver>>({});
    const lastUpdateTime = useRef<number>(0);
    const lastBearings = useRef<Record<string, number>>({}); // Persist bearing to prevent 0-reset spin

    // --- State: Ride Logic ---
    const [rideState, setRideState] = useState<RideState>('IDLE');
    const [pickup, setPickup] = useState<{ lat: number, lon: number, address: string } | null>(null);
    const [dropoff, setDropoff] = useState<{ lat: number, lon: number, address: string } | null>(null);
    const [assignedDriver, setAssignedDriver] = useState<string | null>(null);

    // Using explicit any to avoid TS hell with GeoJSON types for now
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [activeRoute, setActiveRoute] = useState<any>(null); // The current Geometry we are traversing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [fullRouteOriginal, setFullRouteOriginal] = useState<any>(null); // Keep original to show ghost path?

    // Simulation State
    const [simProgress, setSimProgress] = useState(0); // 0 to 1 along the line
    const simRef = useRef<number>(0); // Progress value

    // --- State: UI ---
    const [searchText, setSearchText] = useState("");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ignore = [searchText, setSearchText];
    const mapRef = useRef<mapboxgl.Map | null>(null);

    // --- 1. Background Fleet Animation ---
    useEffect(() => {
        const fetchDrivers = async () => {
            try {
                const res = await fetch(`/api/drivers?lat=${viewState.latitude}&lon=${viewState.longitude}&radius=5`);
                const data = await res.json();
                if (data.drivers) {
                    prevDriversRef.current = driversRef.current;
                    const newMap: Record<string, Driver> = {};
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    data.drivers.forEach((d: any) => newMap[d.driver_id] = d);
                    driversRef.current = newMap;
                    setDrivers(newMap);
                    lastUpdateTime.current = Date.now();
                }
            } catch (e) {
                console.error(e);
            }
        };
        const interval = setInterval(fetchDrivers, 1000);
        return () => clearInterval(interval);
    }, [viewState.latitude, viewState.longitude]); // Reduce dependency thrashing

    useEffect(() => {
        const animate = () => {
            const now = Date.now();
            const elapsed = now - lastUpdateTime.current;
            const progress = Math.min(elapsed / 1000, 1);
            const interpolated: Record<string, Driver> = {};

            Object.keys(driversRef.current).forEach(id => {
                // If this is our assigned driver, we handle its position manually in the other loop!
                if (id === assignedDriver) return;

                const target = driversRef.current[id];
                const prev = prevDriversRef.current[id] || target;

                // Calculate Bearing
                const p1 = turf.point([prev.location.longitude, prev.location.latitude]);
                const p2 = turf.point([target.location.longitude, target.location.latitude]);
                const distance = turf.distance(p1, p2);

                // If stationary (or barely moving), keep previous bearing
                if (distance < 0.001) {
                    interpolated[id] = {
                        ...target,
                        bearing: lastBearings.current[id] || 0,
                        location: target.location // Snap to target
                    };
                    return;
                }

                const calculatedBearing = turf.bearing(p1, p2);

                // Use persisted bearing as start, or fallback to calculated
                const prevBearing = lastBearings.current[id] || calculatedBearing;

                // Target: Mapbox 0 is North. Turf 0 is North. 
                // If the car SVG is facing Up, we just use bearing.
                // If we added 180 before, maybe the car was facing down?
                // Let's assume standard behavior: 0 = North.
                let nextBearing = calculatedBearing + 180;

                // Shortest path rotation logic
                const diff = nextBearing - prevBearing;
                if (diff > 180) nextBearing -= 360;
                if (diff < -180) nextBearing += 360;

                const currentBearing = lerp(prevBearing, nextBearing, progress);
                lastBearings.current[id] = currentBearing; // Persist for next frame/fetch

                interpolated[id] = {
                    ...target,
                    bearing: currentBearing,
                    location: {
                        latitude: lerp(prev.location.latitude, target.location.latitude, progress),
                        longitude: lerp(prev.location.longitude, target.location.longitude, progress)
                    }
                };
            });
            setDisplayDrivers(prev => ({ ...prev, ...interpolated }));
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [drivers, assignedDriver]);


    // --- 2. ACTIVE RIDE SIMULATION LOOP ---
    useEffect(() => {
        if (!assignedDriver || !activeRoute) return;
        if (rideState !== 'DRIVER_EN_ROUTE' && rideState !== 'RIDE_IN_PROGRESS') return;

        let frameId = 0;

        const drive = () => {
            // Move progress
            // Slower speed: 0.0005 (approx 30s for full route)
            simRef.current += 0.0005;
            // Let's make it cover the path in ~10 seconds.
            // 60fps * 10s = 600 frames. 1/600 = 0.0016

            if (simRef.current >= 1) {
                simRef.current = 1;
                // Arrival Logic
                if (rideState === 'DRIVER_EN_ROUTE') {
                    setRideState('DRIVER_ARRIVED');
                    simRef.current = 0; // Reset for next leg
                    setActiveRoute(null); // Clear line
                } else if (rideState === 'RIDE_IN_PROGRESS') {
                    setRideState('COMPLETED');
                    setActiveRoute(null);
                }
                return;
            }

            // Calculate Position on Line
            const line = turf.lineString(activeRoute.coordinates);
            const length = turf.length(line);
            const dist = length * simRef.current;
            const pos = turf.along(line, dist);
            const [lon, lat] = pos.geometry.coordinates;

            // Calculate Bearing for Active Driver
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const p1 = turf.point([lon, lat]); // Current interpolated pos
            // Look ahead a bit for smoother bearing? 
            // Or just use the segment bearing?
            // Simple trick: Calculate bearing from current 'pos' to 'pos + small_delta' on line
            // Better: Get bearing of the current segment of the line.
            // For now, let's just stick to the animation loop bearing or calculate from path?
            // Let's use 1% ahead to get visual bearing
            const nextDist = Math.min(dist + (length * 0.01), length);
            const nextPos = turf.along(line, nextDist);
            const bearing = turf.bearing(pos, nextPos);

            setDisplayDrivers(prev => ({
                ...prev,
                [assignedDriver]: {
                    driver_id: assignedDriver,
                    status: 'BUSY',
                    bearing: bearing + 180, // Mapbox icons rotate CW? 0 is North.
                    location: { latitude: lat, longitude: lon }
                }
            }));

            // Smart Camera: If Driver -> Pickup, keep both in frame but looser
            if (rideState === 'DRIVER_EN_ROUTE' && mapRef.current && pickup) {
                const bounds = new mapboxgl.LngLatBounds(
                    [lon, lat], // Driver
                    [pickup.lon, pickup.lat] // Pickup
                );

                // Wider Padding: 300px to avoid extreme zoom
                const cam = mapRef.current.cameraForBounds(bounds, { padding: 300, maxZoom: 16 });
                if (cam && cam.center) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const center = cam.center as any;
                    const lng = center.lng ?? center[0];
                    const lat = center.lat ?? center[1];

                    setViewState((prev: ViewState) => ({
                        ...prev,
                        longitude: lng,
                        latitude: lat,
                        zoom: Math.min(cam.zoom || 14, 16), // Hard cap zoom
                        transitionDuration: 100 // Slight lag for smoothness
                    }));
                }
            }

            // Trail Clearing: Slice the active route to show only what's AHEAD?
            // User requested: "clear the trail of the trace once the driver has passed through it"
            // So we want the line from CurrentPos -> End.
            // const sliced = turf.lineSlice(pos, turf.point(activeRoute.coordinates[activeRoute.coordinates.length - 1]), line);

            // Update the GeoJSON for the route line
            // We use a separate state or just mutate a ref for performance? 
            // React state is fine for now if not too stuttery.
            setSimProgress(simRef.current); // Use this to slice in render?
            // Actually slicing logic above is good.
            // Let's rely on render logic to slice.

            frameId = requestAnimationFrame(drive);
        };

        frameId = requestAnimationFrame(drive);
        return () => cancelAnimationFrame(frameId);
    }, [rideState, assignedDriver, activeRoute, pickup]);


    // --- 3. Action Handlers ---

    // A. Request Perms & Set Pickup
    const handleUseCurrentLocation = useCallback(() => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(pos => {
                const { latitude, longitude } = pos.coords;
                setPickup({ lat: latitude, lon: longitude, address: "Current Location" });

                setViewState((prev: ViewState) => ({
                    ...prev,
                    latitude,
                    longitude,
                    zoom: 16,
                    transitionDuration: 1500
                }));

                setRideState('DROPOFF_SELECTION');
            });
        }
    }, []);

    // B. Map Clicking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMapClick = async (e: any) => {
        const { lng, lat } = e.lngLat;
        const address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

        if (rideState === 'PICKUP_SELECTION') {
            setPickup({ lat, lon: lng, address });
            setRideState('DROPOFF_SELECTION');
        } else if (rideState === 'DROPOFF_SELECTION') {
            setDropoff({ lat, lon: lng, address });
            setRideState('CONFIRMING');
        }
    };

    // C. Request Ride Flow
    const handleConfirmRide = async () => {
        if (!pickup || !dropoff) return;
        setRideState('SEARCHING');

        // Fetch Route (Pickup -> Dropoff) for later
        const p2d = await fetchRoute(pickup, dropoff);
        setFullRouteOriginal(p2d?.geometry);

        // Zoom Out
        if (mapRef.current && p2d) {
            const coords = p2d.geometry.coordinates;
            // Zoom Out to fit Trip (Pickup -> Dropoff)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bounds = coords.reduce((bounds: any, coord: any) => {
                return bounds.extend(coord);
            }, new mapboxgl.LngLatBounds(coords[0], coords[0]));

            mapRef.current.fitBounds(bounds, { padding: 150, duration: 3000, maxZoom: 15 }); // Ensure we see the whole trip context
        }

        // Fake Dispatch Delay
        setTimeout(async () => {
            const driverIds = Object.keys(driversRef.current);
            // Find closest driver?
            // For now just pick first one.
            const rando = driverIds.length > 0 ? driverIds[0] : null;

            if (rando) {
                setAssignedDriver(rando);
                const dLoc = driversRef.current[rando].location;

                // 1. Get Route Driver -> Pickup
                const d2p = await fetchRoute({ lat: dLoc.latitude, lon: dLoc.longitude }, pickup);

                if (d2p) {
                    setActiveRoute(d2p.geometry); // Start Simulation 1
                    simRef.current = 0;
                    setRideState('DRIVER_EN_ROUTE');
                }
            } else {
                alert("No drivers found nearby (Simulate more!)");
                setRideState('IDLE');
            }
        }, 5000);
    };

    const handleStartRide = () => {
        // Start Leg 2: Pickup -> Dropoff
        if (fullRouteOriginal) {
            setActiveRoute(fullRouteOriginal);
            simRef.current = 0;
            setRideState('RIDE_IN_PROGRESS');

            // Zoom to fit the entire route (Pickup -> Dropoff)
            if (mapRef.current) {
                const coords = fullRouteOriginal.coordinates;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const bounds = coords.reduce((bounds: any, coord: any) => {
                    return bounds.extend(coord);
                }, new mapboxgl.LngLatBounds(coords[0], coords[0]));

                mapRef.current.fitBounds(bounds, { padding: 100, duration: 2000, maxZoom: 15 });
            }
        }
    };

    const handleExit = () => {
        setRideState('IDLE');
        setPickup(null);
        setDropoff(null);
        setAssignedDriver(null);
        setActiveRoute(null);
        setFullRouteOriginal(null);
        // Reset View
        setViewState((prev: ViewState) => ({ ...prev, zoom: 14, pitch: 0 }));
    };

    // Helper: Route Fetcher
    async function fetchRoute(start: { lon: number, lat: number, address?: string }, end: { lon: number, lat: number, address?: string }) {
        try {
            const res = await fetch(`/api/directions?start=${start.lon},${start.lat}&end=${end.lon},${end.lat}`);
            const data = await res.json();
            return data.routes?.[0];
        } catch {
            return null;
        }
    }

    // --- Helper for Trail Slicing ---
    const getClippedRoute = () => {
        if (!activeRoute) return null;
        if (simProgress <= 0) return activeRoute;
        if (simProgress >= 1) return null;

        try {
            const line = turf.lineString(activeRoute.coordinates);
            const length = turf.length(line);
            const startDist = length * simProgress;
            const startPt = turf.along(line, startDist);
            const endPt = turf.point(activeRoute.coordinates[activeRoute.coordinates.length - 1]);
            return turf.lineSlice(startPt, endPt, line);
        } catch {
            return activeRoute;
        }
    };

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return null;

    const clippedGeoJSON = getClippedRoute();

    return (
        <div className="w-full h-screen relative bg-black font-sans text-white overflow-hidden">

            {/* DIMMING LAYER */}
            {rideState !== 'IDLE' && rideState !== 'PICKUP_SELECTION' && rideState !== 'DROPOFF_SELECTION' && (
                <div className="absolute inset-0 pointer-events-none bg-black/60 z-10 transition-opacity duration-1000" />
            )}

            <Map
                {...viewState}
                onMove={e => setViewState(e.viewState)}
                onClick={handleMapClick}
                onLoad={e => { mapRef.current = e.target; }}
                style={{ width: '100%', height: '100%' }}
                mapStyle="mapbox://styles/mapbox/navigation-night-v1"
                mapboxAccessToken={token}
                attributionControl={false}
                terrain={{ source: 'mapbox-dem', exaggeration: 1.5 }}
            >
                <Source id="mapbox-dem" type="raster-dem" url="mapbox://mapbox.mapbox-terrain-dem-v1" tileSize={512} maxzoom={14} />
                <style>{`.mapboxgl-ctrl-logo { display: none !important; } .mapboxgl-ctrl-attrib { display: none !important; }`}</style>
                <MapboxNavigationControl showCompass={false} />

                {/* --- ACTIVE ROUTE TRACE --- */}
                {clippedGeoJSON && (
                    <Source type="geojson" data={clippedGeoJSON}>
                        {/* Glow High */}
                        <Layer
                            id="route-glow-high"
                            type="line"
                            layout={{ "line-join": "round", "line-cap": "round" }}
                            paint={{ 'line-color': '#22c55e', 'line-width': 12, 'line-opacity': 0.4, 'line-blur': 10 }}
                        />
                        <Layer
                            id="route-core"
                            type="line"
                            layout={{ "line-join": "round", "line-cap": "round" }}
                            paint={{ 'line-color': '#4ade80', 'line-width': 4, 'line-opacity': 1 }}
                        />
                    </Source>
                )}

                {/* --- FUTURE ROUTE (Ghost) --- */}
                {/* Show pickup->dropoff faintly while driver is en-route */}
                {rideState === 'DRIVER_EN_ROUTE' && fullRouteOriginal && (
                    <Source type="geojson" data={fullRouteOriginal}>
                        <Layer type="line" paint={{ 'line-color': '#3b82f6', 'line-width': 3, 'line-opacity': 0.2, 'line-dasharray': [2, 2] }} />
                    </Source>
                )}


                {/* --- PINS --- */}
                {pickup && <Marker longitude={pickup.lon} latitude={pickup.lat} anchor="bottom"><PinIcon color="#22c55e" /></Marker>}
                {dropoff && <Marker longitude={dropoff.lon} latitude={dropoff.lat} anchor="bottom"><PinIcon color="#ef4444" bounce={rideState === 'CONFIRMING'} /></Marker>}

                {/* --- DRIVERS --- */}
                {Object.values(displayDrivers).map(d => {
                    const isAssigned = d.driver_id === assignedDriver;
                    const isDimmed = assignedDriver && !isAssigned;

                    if (isDimmed && rideState !== 'SEARCHING') return null; // Hide others entirely during active ride for focus

                    return (
                        <Marker
                            key={d.driver_id}
                            longitude={d.location.longitude}
                            latitude={d.location.latitude}
                            anchor="center"
                            pitchAlignment="map"
                        >
                            <div className={`transition-all duration-300 ${isAssigned ? 'z-50 drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]' : 'opacity-80'}`}>
                                <WhiteCarIcon bearing={d.bearing || 0} />
                            </div>
                        </Marker>
                    );
                })}
            </Map>

            {/* --- UI OVERLAY --- */}
            <div className="absolute top-6 left-6 z-20 w-[400px]">

                {/* 1. PICKUP INPUT */}
                {(rideState === 'IDLE' || rideState === 'PICKUP_SELECTION' || rideState === 'DROPOFF_SELECTION') && (
                    <div
                        className={cn(
                            "bg-gray-900/90 backdrop-blur-md rounded-xl border border-gray-700 p-4 shadow-2xl transition-all duration-500",
                            rideState === 'PICKUP_SELECTION' ? "border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)] ring-1 ring-green-500/50" : ""
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_5px_#22c55e]" />
                            <span className="text-xs text-green-500 font-bold uppercase tracking-widest">Pickup</span>
                        </div>

                        {pickup ? (
                            <div className="mt-2 text-lg font-medium flex justify-between items-center break-all">
                                {pickup.address}
                                <button onClick={() => { setPickup(null); setRideState('PICKUP_SELECTION'); }} className="p-1 hover:bg-white/10 rounded-full"><X size={16} /></button>
                            </div>
                        ) : (
                            <div className="mt-2 flex flex-col gap-2">
                                <input
                                    placeholder="Click map or use Current Loc..."
                                    readOnly
                                    className="bg-transparent text-lg placeholder-gray-500 outline-none w-full cursor-pointer"
                                    onClick={() => setRideState('PICKUP_SELECTION')}
                                />
                                <button
                                    onClick={handleUseCurrentLocation}
                                    className="flex items-center gap-2 text-blue-400 text-sm hover:text-blue-300 transition-colors py-1"
                                >
                                    <Navigation size={14} /> Use Current Location
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* 2. DROPOFF INPUT */}
                {(pickup || rideState === 'DROPOFF_SELECTION') && (rideState === 'IDLE' || rideState === 'PICKUP_SELECTION' || rideState === 'DROPOFF_SELECTION' || rideState === 'CONFIRMING') && (
                    <div
                        className={cn(
                            "mt-4 bg-gray-900/90 backdrop-blur-md rounded-xl border border-gray-700 p-4 shadow-2xl transition-all duration-500 animate-in slide-in-from-left-4 fade-in",
                            rideState === 'DROPOFF_SELECTION' ? "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)] ring-1 ring-red-500/50" : ""
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 bg-red-500 rounded-sm shadow-[0_0_5px_#ef4444]" />
                            <span className="text-xs text-red-500 font-bold uppercase tracking-widest">Dropoff</span>
                        </div>

                        {dropoff ? (
                            <div className="mt-2 text-lg font-medium flex justify-between items-center break-all">
                                {dropoff.address}
                                <button onClick={() => { setDropoff(null); setRideState('DROPOFF_SELECTION'); }} className="p-1 hover:bg-white/10 rounded-full"><X size={16} /></button>
                            </div>
                        ) : (
                            <div className="mt-2">
                                <input
                                    placeholder="Enter Dropoff (Click Map)..."
                                    className="bg-transparent text-lg placeholder-gray-500 outline-none w-full"
                                    readOnly
                                    onClick={() => setRideState('DROPOFF_SELECTION')}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* 3. CONFIRM ACTION */}
                {rideState === 'CONFIRMING' && (
                    <button
                        onClick={handleConfirmRide}
                        className="mt-6 w-full bg-white text-black font-bold text-xl py-4 rounded-xl shadow-[0_0_25px_rgba(255,255,255,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        <Check size={24} /> CONFIRM RIDE
                    </button>
                )}

                {/* 4. SEARCHING STATE */}
                {/* 4. SEARCHING STATE (RADAR) */}
                {rideState === 'SEARCHING' && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-500">
                        <div className="relative">
                            {/* Radar Waves */}
                            <div className="absolute inset-0 border-4 border-green-500/30 rounded-full animate-ping [animation-duration:2s]" />
                            <div className="absolute inset-[-20px] border-4 border-green-500/20 rounded-full animate-ping [animation-duration:3s]" />

                            {/* Center Hub */}
                            <div className="bg-gray-900 border border-green-500 p-8 rounded-full shadow-[0_0_50px_rgba(34,197,94,0.5)] flex flex-col items-center justify-center w-64 h-64 relative overflow-hidden">
                                {/* Scanning Line */}
                                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-green-500/10 to-transparent w-full h-full animate-[spin_3s_linear_infinite]" />

                                <div className="z-10 text-center">
                                    <div className="text-4xl mb-2">🚗</div>
                                    <h3 className="text-xl font-bold text-white mb-1">Connecting</h3>
                                    <p className="text-green-400 text-xs uppercase tracking-widest animate-pulse">Finding Driver...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 5. DRIVER EN ROUTE */}
                {rideState === 'DRIVER_EN_ROUTE' && (
                    <div className="mt-6 bg-gray-900 border border-green-500/30 p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 shadow-[0_0_30px_rgba(0,0,0,0.8)]">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-sm text-green-500 uppercase tracking-widest mb-1 font-bold">Driver En Route</h3>
                                <div className="text-2xl font-bold">White Sedan <span className="text-yellow-500 text-lg">★ 5.0</span></div>
                            </div>
                            <div className="bg-gray-800 p-2 rounded-lg">
                                <WhiteCarIcon bearing={90} />
                            </div>
                        </div>
                        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 w-full animate-pulse" />
                        </div>
                        <div className="mt-2 text-xs text-gray-500">Approaching Pickup Point...</div>
                    </div>
                )}

                {/* 6. DRIVER ARRIVED MODAL (Box Style) */}
                {rideState === 'DRIVER_ARRIVED' && (
                    <div className="mt-6 w-full bg-gray-900/95 backdrop-blur-md border border-green-500/50 p-6 rounded-xl shadow-2xl animate-in slide-in-from-left-4 fade-in">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center text-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]">
                                <Check size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Driver Arrived</h2>
                                <p className="text-gray-400 text-sm">Waiting at pickup...</p>
                            </div>
                        </div>
                        <button
                            onClick={handleStartRide}
                            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg hover:shadow-green-500/20"
                        >
                            HOP IN
                        </button>
                    </div>
                )}

                {/* 7. RIDE IN PROGRESS */}
                {rideState === 'RIDE_IN_PROGRESS' && (
                    <div className="fixed top-6 right-6 z-50 bg-black/90 p-4 rounded-xl border border-blue-500/30 shadow-2xl">
                        <div className="text-xs text-blue-400 uppercase tracking-widest mb-1">Heading to Destination</div>
                        <div className="text-xl font-bold">{dropoff?.address}</div>
                    </div>
                )}

                {/* 8. COMPLETED MODAL (Box Style) */}
                {rideState === 'COMPLETED' && (
                    <div className="mt-6 w-full bg-gray-900/95 backdrop-blur-md border border-white/20 p-6 rounded-xl shadow-2xl animate-in slide-in-from-left-4 fade-in">
                        <div className="text-center mb-4">
                            <h2 className="text-2xl font-bold text-white mb-1">You Have Arrived</h2>
                            <p className="text-gray-400 font-mono text-sm">Total Fare: <span className="text-green-400 font-bold">$12.50</span></p>
                        </div>
                        <button
                            onClick={handleExit}
                            className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-gray-200 transition-all shadow-lg hover:shadow-white/20"
                        >
                            EXIT CAR
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
}
