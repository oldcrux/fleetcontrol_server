CREATE TABLE "Organization" (
	"orgId" varchar(20) NOT NULL,
	"primaryOrgId" varchar(20), -- only needed in case creating a vendor.
	"organizationName" varchar(50) NOT NULL,
	"orgType" varchar(20) NOT NULL,
	"primaryContactName" varchar(50) NOT NULL,
	"primaryPhoneNumber" varchar(20) NOT NULL,
	"primaryEmail" varchar(50) NOT NULL,
	address1 varchar(100) NOT NULL,
	address2 varchar(100) NULL,
	city varchar(50) NOT NULL,
	state varchar(20) NOT NULL,
	country varchar(20) NOT NULL,
	zip varchar(20) NOT NULL,
	latitude float8 NULL,
	longitude float8 NULL,
	"createdBy" varchar(20) NULL,
	"createdAt" timestamptz NOT NULL,
	"updatedAt" timestamptz NOT NULL,
	CONSTRAINT "Organization_pkey" PRIMARY KEY ("orgId")
);

ALTER TABLE "Organization" ADD COLUMN "orgType" varchar(20) NOT null default 'primary'; --primary, vendor
ALTER TABLE "Organization" ADD COLUMN "primaryOrgId" varchar(20);

CREATE TABLE "Users" (
	"userId" varchar(20) NOT NULL,
	"firstName" varchar(50) NOT NULL,
	"lastName" varchar(50) NOT NULL,
	"primaryOrgId" varchar(20) NOT NULL,
	"secondaryOrgId" varchar(20),
	"role" varchar(20) not null default 'view',
	email varchar(50) NOT NULL,
	"phoneNumber" varchar(20) NOT NULL,
	address1 varchar(100) NOT NULL,
	address2 varchar(100) NULL,
	city varchar(50) NOT NULL,
	state varchar(20) NOT NULL,
	country varchar(20) NOT NULL,
	zip varchar(20) NOT NULL,
	"password" varchar(255) NOT NULL,
	"isActive" BOOLEAN DEFAULT TRUE,
	"createdBy" varchar(20) NOT NULL,
	"createdAt" timestamptz NOT NULL,
	"updatedAt" timestamptz NOT NULL,
	CONSTRAINT "Users_email_key" UNIQUE (email),
	CONSTRAINT "Users_pkey" PRIMARY KEY ("userId")
);
alter table "Users" rename column "orgId" to "primaryOrgId";
alter table "Users"  add column "secondaryOrgId" varchar(20);
alter table "Users"  add column "role" varchar(20) not null default 'view'; -- system, admin, view

CREATE TABLE "GeofenceLocation" (
	id serial4 NOT NULL,
	"geofenceType" varchar(20) NOT NULL,
	tag varchar(100) NOT NULL,
	radius float8 DEFAULT '0'::double precision NOT NULL,
	center text NULL,
	"centerPoint" public.geography(point, 4326) NULL,
	polygon text NULL,
	"geohash" varchar(10) NULL,
	"geofenceLocationGroupName" varchar(100) NULL,
	"scheduleArrival" TIME,
	"haltDuration" int4 DEFAULT 0 NOT NULL,
	"orgId" varchar(20) NOT NULL,
	"createdBy" varchar(20) NOT NULL,
	"createdAt" timestamptz NOT NULL,
	"updatedAt" timestamptz NOT NULL,
	CONSTRAINT "GeofenceLocation_pkey" PRIMARY KEY (id)
);

CREATE TABLE "Vehicle" (
	"vehicleNumber" varchar(20) NOT NULL,
	make varchar(20) NULL,
	model varchar(20) NULL,
	"vendorId" varchar(50) NULL,
	"orgId" varchar(20) NOT NULL,
	"serialNumber" varchar(20) NOT NULL,
	"primaryPhoneNumber" varchar(20) NOT NULL,
	"secondaryPhoneNumber" varchar(20) NULL,
	"vehicleGroup" varchar(100) NULL,
	"geofenceLocationGroupName" varchar(100) NULL,
	"status" varchar(20) NOT null default 'Active'; -- Active, InActive, Standby
	"createdBy" varchar(20) NOT NULL,
	"createdAt" timestamptz NOT NULL,
	"updatedAt" timestamptz NOT NULL,
	CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("vehicleNumber")
);
ALTER TABLE "Vehicle" DROP COLUMN "isActive";
alter table "Vehicle" add column "status" varchar(20) NOT null default 'active'; -- Active, InActive, Standby
alter table "Vehicle" rename column "owner" to "vendorId";

CREATE TABLE "AppConfig" (
	"orgId" varchar(20) NULL,  /* There will be system level configs where orgId could be null. Ex - TCP rate limiter*/
	"configKey" varchar(50) NULL,
	"configValue" TEXT NOT NULL,
	"comments" varchar(100) NULL,
	"createdBy" varchar(20) NOT NULL,
	"createdAt" timestamptz NOT NULL,
	"updatedAt" timestamptz NOT NULL
);


INSERT INTO "AppConfig" ("orgId","configKey","configValue","comments","createdBy","createdAt","updatedAt") VALUES
	 (NULL,'rate_limiter_tcp','30','value in secs. Default 30. System level config','admin','2024-11-11 16:21:59.226-05','2024-11-11 16:21:59.226-05'),
	 (NULL,'rate_limiter_vehicle_off','120','value in secs. Default 120. System level config','admin','2024-11-11 16:21:59.226-05','2024-11-11 16:21:59.226-05'),
	 (NULL,'sse_data_push_interval','10000','value in milli secs. Default 10 sec. Org level config','admin','2024-11-11 16:21:59.226-05','2024-11-11 16:21:59.226-05'),
	 (NULL,'point_within_radius_accuracy_in_meters','30','value in meters. Default 30. Org level config','admin','2024-11-11 16:21:59.227-05','2024-11-11 16:21:59.227-05'),
	 (NULL,'questdb_geohash_precision','30','value in meters. Default 30. System level config','admin','2024-11-11 16:21:59.227-05','2024-11-11 16:21:59.227-05'),
	 (NULL,'geofence_schedule_arrival_window','30','value in mins. Default 30. org level config','admin','2024-11-11 16:21:59.227-05','2024-11-11 16:21:59.227-05');
