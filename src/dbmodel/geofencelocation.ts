import { DataTypes } from 'sequelize';
import sequelize from '../util/sequelizedb';

// Define the Geofence model
const GeofenceLocation = sequelize.define('GeofenceLocation', {
  geofenceType: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  tag: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  radius: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  center: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  centerPoint: { // Note - added for postgreSql
    type: DataTypes.GEOGRAPHY('POINT'),
    allowNull: true,
  },
  polygon: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  geofenceLocationGroupName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  geohash: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  scheduleArrival: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  haltDuration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
  },
  orgId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  createdBy: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  timestamps: true,
  tableName: 'GeofenceLocation',
});

export default GeofenceLocation;
