import * as dotenv from 'dotenv';
import { fetchAppConfigByConfigKey } from '../controller/AppConfigController';
dotenv.config();


export function isNullOrUndefinedOrNaN(value: any) {
    return value === null || value === undefined || Number.isNaN(value);
}

export const getGeoHashPrecisionValue = async (radius: number, orgId: string) => {

    const followDefaultGeohashPrecision = await fetchAppConfigByConfigKey("FollowDefaultGeohashPrecision", orgId);
    if (followDefaultGeohashPrecision === '1') {
        const precision = await fetchAppConfigByConfigKey("PointWithinRadiusAccuracyInMeter", orgId);
        return precision as number;
    }
    else {
        return radius;
    }
}


export const trimCenterLngLatToFiveDecimal = async (center: any) => {
    for (const key in center) {
        if (typeof center.lng === 'number') {
            center.lng = parseFloat(center.lng.toFixed(5));
        }
        if (typeof center.lat === 'number') {
            center.lat = parseFloat(center.lat.toFixed(5));
        }
    }
    return center;
}
