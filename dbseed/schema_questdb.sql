    CREATE TABLE 'VehicleTelemetryTcpMessage' (tcpMessage VARCHAR, timestamp TIMESTAMP) timestamp (timestamp) PARTITION BY DAY WAL;
    
    CREATE TABLE 'VehicleTelemetry' (
        vehicleNumber SYMBOL capacity 256 CACHE,
        serialNumber SYMBOL capacity 256 CACHE,
        speed DOUBLE,
        overspeed byte,
        latitude DOUBLE,
        longitude DOUBLE,
        geohash geohash(6c),
        ignition byte,
        odometer DOUBLE,
        headingDirectionDegree DOUBLE,
        timestamp TIMESTAMP
    ) timestamp (timestamp) PARTITION BY DAY WAL;

    -- ALTER TABLE VehicleTelemetry ALTER COLUMN ignition TYPE byte;
    -- ALTER TABLE VehicleTelemetry ADD COLUMN overspeed byte;
    -- ALTER TABLE vehicleTelemetry DEDUP ENABLE UPSERT KEYS(timestamp, vehicleNumber, latitude, longitude);
    -- ALTER TABLE vehicle_telemetry DEDUP DISABLE;

    CREATE TABLE 'GeofenceTelemetryReport' (
        reportName SYMBOL capacity 256 NOCACHE,
        orgId SYMBOL capacity 256 NOCACHE,
        vehicleNumber SYMBOL capacity 256 NOCACHE,
        geofenceLocationGroupName VARCHAR,
        geofenceLocationTag VARCHAR,
        touchedLocation BOOLEAN,
        scheduleArrivalTime VARCHAR;
        timeSpent DOUBLE,
        arrivalTime VARCHAR,
        departureTime VARCHAR,
        timestamp TIMESTAMP
    ) timestamp (timestamp) PARTITION BY DAY WAL;


    CREATE TABLE 'VehicleTelemetryReport' (
        reportName SYMBOL capacity 256 CACHE,
        orgId SYMBOL capacity 256 CACHE,
        reportType SYMBOL capacity 256 CACHE,
        vehicleNumber SYMBOL capacity 256 CACHE,
        owner VARCHAR,
        geofenceLocationGroupName VARCHAR,
        scheduleStartTime VARCHAR,
        actualStartTime VARCHAR,
        assignedGeofenceLocationCount DOUBLE,
        touchedLocationCount DOUBLE,
        mileage DOUBLE,
        timestamp TIMESTAMP
    ) timestamp (timestamp) PARTITION BY DAY WAL;