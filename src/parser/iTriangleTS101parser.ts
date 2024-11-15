
export function parseMessage(message: string) {

    /**
     * Sample message: Ignition On
     * $$CLIENT_1NS,1234567880,101,20.266439195162516,85.83339972833339,190813172319,A,24,13,1945,358,11,0.83,0,0,14199,0,0,0,00,0,0,1,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,14199,4004,2007,404,86,78,-93,937*05
     * 
     * Sample message: Ignition Off
     * $$CLIENT_1NS,1234567880,101,20.266439195162516,85.83339972833339,190813172319,A,24,13,1945,358,11,0.83,0,0,14199,0,0,0,00,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14199,4004,2007,404,86,78,-93,937*05
     * 
     */
    // console.log(`iTriangleTS101parser: parseMessage: message received: ${message}`);
    const fields = message.split(',');

    const parsedMessage = {
        serialNumber: fields[1],
        latitude: parseFloat(fields[3]),
        longitude: parseFloat(fields[4]),
        speed: parseFloat(fields[8]),
        odometer: parseFloat(fields[9]),
        headingDirectionDegree: parseFloat(fields[10]),
        overspeed: parseFloat(fields[18]),
        ignition: parseFloat(fields[27])
    }

    // console.log(`iTriangleTS101parser: parseMessage: message returning: ${JSON.stringify(parsedMessage)}`);
    return parsedMessage;
}