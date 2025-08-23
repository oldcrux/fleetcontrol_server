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
        idleDuration DOUBLE,
        timestamp TIMESTAMP
    ) timestamp (timestamp) PARTITION BY DAY WAL;

    -- ALTER TABLE VehicleTelemetry ALTER COLUMN ignition TYPE byte;
    -- ALTER TABLE VehicleTelemetry ADD COLUMN overspeed byte;
    ALTER TABLE VehicleTelemetry ADD COLUMN idleDuration DOUBLE;
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
        allocatedHaltDuration DOUBLE,
        timeSpent DOUBLE,
        arrivalTime VARCHAR,
        departureTime VARCHAR,
        timestamp TIMESTAMP
    ) timestamp (timestamp) PARTITION BY DAY WAL;

    ALTER TABLE GeofenceTelemetryReport ADD COLUMN allocatedHaltDuration DOUBLE;


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
        idleDuration DOUBLE,
        timestamp TIMESTAMP
    ) timestamp (timestamp) PARTITION BY DAY WAL;

    ALTER TABLE VehicleTelemetryReport ADD COLUMN vehicleStatus VARCHAR;
    ALTER TABLE VehicleTelemetryReport ADD COLUMN vehicleGroup VARCHAR;
    ALTER TABLE VehicleTelemetryReport RENAME COLUMN owner to vendor;
    ALTER TABLE VehicleTelemetryReport ADD COLUMN idleDuration DOUBLE;


ALTER TABLE GeofenceTelemetryReport DROP PARTITION where timestamp < to_timezone(dateadd ('d', -30, date_trunc('day', now())) , 'Asia/Kolkata') ;
ALTER TABLE VehicleTelemetryReport DROP PARTITION where timestamp < to_timezone(dateadd ('d', -30, date_trunc('day', now())) , 'Asia/Kolkata') ;
ALTER TABLE VehicleTelemetry DROP PARTITION where timestamp < to_timezone(dateadd ('d', -10, date_trunc('day', now())) , 'Asia/Kolkata') ;
ALTER TABLE VehicleTelemetryTcpMessage DROP PARTITION where timestamp < to_timezone(dateadd ('d', -10, date_trunc('day', now())) , 'Asia/Kolkata') ;

