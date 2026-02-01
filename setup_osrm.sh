#!/bin/bash
set -e

# Directory for OSRM data
DATA_DIR="./osrm-data"
mkdir -p $DATA_DIR

# 1. Download California Map Data (if not exists)
# Using Geofabrik download server
URL="https://download.geofabrik.de/north-america/us/california-latest.osm.pbf"
FILE="$DATA_DIR/california-latest.osm.pbf"

if [ ! -f "$FILE" ]; then
    echo "Downloading California map data (~500MB)... This may take a minute."
    curl -L $URL -o $FILE
else
    echo "Map data already exists."
fi

# 2. Extract (Pre-process) the map data using Docker
# We use the 'car' profile
echo "Extracting map data (Docker)..."
docker run -t -v "${PWD}/osrm-data:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/california-latest.osm.pbf

echo "Partitioning map data..."
docker run -t -v "${PWD}/osrm-data:/data" osrm/osrm-backend osrm-partition /data/california-latest.osrm

echo "Customizing map data..."
docker run -t -v "${PWD}/osrm-data:/data" osrm/osrm-backend osrm-customize /data/california-latest.osrm

echo "✅ OSRM Setup Complete. You can now start the docker-compose service."
