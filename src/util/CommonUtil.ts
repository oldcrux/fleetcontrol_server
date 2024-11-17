export function isNullOrUndefinedOrNaN(value:any) {
    return value === null || value === undefined || Number.isNaN(value);
}