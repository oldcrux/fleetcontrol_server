import { DataTypes } from 'sequelize';
import sequelize from '../util/sequelizedb';

const Organization = sequelize.define('Organization', {
  orgId: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false,
    unique: true,
  },
  organizationName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  primaryContactName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  primaryPhoneNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  primaryEmail: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  address1: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  address2: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  city: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  state: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  country: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  zip: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  latitude: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  longitude: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  createdBy: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  tableName: 'Organization',
  timestamps: true,
});

export default Organization;
