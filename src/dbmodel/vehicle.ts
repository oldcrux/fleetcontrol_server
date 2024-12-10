import { DataTypes } from 'sequelize';
import sequelize from '../util/sequelizedb';

const Vehicle = sequelize.define('Vehicle', {
  vehicleNumber: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false,
    unique: true,
  },
  make: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  model: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  vendorId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  orgId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  serialNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  primaryPhoneNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  secondaryPhoneNumber: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  vehicleGroup: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  geofenceLocationGroupName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  isActive: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  createdBy: {
    type: DataTypes.STRING,
    allowNull: false,
  }
}, {
  tableName: 'Vehicle',
  timestamps: true,
});

export default Vehicle;
