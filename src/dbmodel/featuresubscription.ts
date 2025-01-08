import { DataTypes } from 'sequelize';
import sequelize from '../util/sequelizedb';

const FeatureSubscription = sequelize.define('FeatureSubscription', {
  feature: {
    type: DataTypes.STRING,
    allowNull: false,
    primaryKey: true,
  },
  orgId: {
    type: DataTypes.STRING,
    allowNull: false,
    primaryKey: true,
  },
  subscriptionActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
  },
  subscriptionStartDate: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  subscriptionEndDate: {
    type: DataTypes.DATE,
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
  tableName: 'feature_subscriptions',
  timestamps: true,
  underscored: true 
});

export default FeatureSubscription;
