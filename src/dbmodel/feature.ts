import { DataTypes } from 'sequelize';
import sequelize from '../util/sequelizedb';

const Features = sequelize.define('Features', {
  feature: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false,
    unique: true,
  },
  description: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  createdBy: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  updatedBy: {
    type: DataTypes.STRING,
    allowNull: false,
  }
}, {
  tableName: 'features',
  timestamps: true,
  underscored: true
});

export default Features;
