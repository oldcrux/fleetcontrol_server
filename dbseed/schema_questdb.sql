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

    ALTER TABLE VehicleTelemetryReport ADD COLUMN vehicleStatus TYPE VARCHAR;
    ALTER TABLE VehicleTelemetryReport ADD COLUMN vehicleGroup TYPE VARCHAR;
    ALTER TABLE VehicleTelemetryReport RENAME COLUMN owner to vendor;


/*query to pull yesterday's TIFFA report*/
select vehicleNumber, MAX(odometer) - MIN(odometer) AS mileage_in_meters, datediff('m', (max(timestamp)), min(timestamp) ) as runDuration_in_mins ,min(to_timezone(timestamp, 'Asia/Kolkata')) as startTime, max(to_timezone(timestamp, 'Asia/Kolkata')) as endTime
from VehicleTelemetry where ignition=1 and
 vehicleNumber in ('OD02CL2726','OD02CL2755','OD02CM4234','OD02CL2642','OD02CL2751','OD02CM4228','OD02CL2720','OD02CL2784','OD02CM4220','OD02CL2701','OD02CL2743','OD02CM2451','OD02CL2767','OD02CM2472','OD02CM2411','OD02CL2723','OD02CM4278','OD02CM2420','OD02CM2447')
and to_timezone(timestamp, 'Asia/Kolkata') between  dateadd ('h', -24, date_trunc('day', to_timezone  (now(), 'Asia/Kolkata')))          
                 and date_trunc('day', to_timezone  (now(), 'Asia/Kolkata')) 
GROUP BY vehicleNumber ;