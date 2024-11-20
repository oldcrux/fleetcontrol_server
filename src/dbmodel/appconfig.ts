import { DataTypes } from 'sequelize';
import sequelize from '../util/sequelizedb';

const AppConfig = sequelize.define('AppConfig', {
  configKey: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false,
    unique: true,
  },
  configValue: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  orgId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  comments: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  createdBy: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  tableName: 'AppConfig',
  timestamps: true,
});

export default AppConfig;
