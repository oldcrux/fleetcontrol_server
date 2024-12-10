import { logDebug, logError } from "../util/Logger";
import { fetchAppConfigByConfigKey } from "./AppConfigController";
const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function generateVehicleExcel(reportName: any, reportData: any) {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Report');

        if (reportData.length === 0) {
            logError(`NotificationController:generateVehicleExcel: reportData Empty`);
            throw new Error('reportData is empty.');
        }
        logDebug(`NotificationController:generateVehicleExcel: Data before generating XLS:`, reportData);
        // Extract columns from the first object in the array
        const columns = Object.keys(reportData[0]).map((key) => ({ header: formatHeader(key), key }));
        worksheet.columns = columns;
        worksheet.columns = [...columns, { header: 'Touched Location %', key: 'touchedLocation' }];

        worksheet.getRow(1).eachCell((cell: any) => {
            cell.font = { bold: true, size: 18 }; // Make header bold
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'a0a2a3' }, // Gold background color
            };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' },
            };
            cell.alignment = { horizontal: 'center', vertical: 'middle' }; // Center alignment
        });

        worksheet.columns.forEach((column: any) => {
            if (column.header) {
                column.width = column.header.length + 2; // Add padding
            }
        });
        // Add rows from the array
        reportData.forEach((data: any) => {
            const assignedCount = data.assignedGeofenceLocationCount || 1; // Prevent divide-by-zero
            const actualCount = data.touchedLocationCount || 0;

            // Calculate touchedLocation percentage
            const touchedLocationPercentage = ((actualCount / assignedCount) * 100).toFixed(1);

            worksheet.addRow({
                ...data,
                touchedLocation: touchedLocationPercentage,
            });
        });

        worksheet.eachRow((row: any, rowNumber: any) => {
            if (rowNumber === 1) return; // Skip the header row
    
            const touchedLocationCell = row.getCell('touchedLocation');
            const touchedLocationValue = parseFloat(touchedLocationCell.value || '0');
    
            // Determine cell color based on touchedLocation percentage
            let fillColor = null;
            if (touchedLocationValue >= 90) fillColor = 'FF00FF00'; // Green
            else if (touchedLocationValue >= 80) fillColor = 'FF66CC66'; // Light Green
            else if (touchedLocationValue >= 60) fillColor = 'FFFFFF00'; // Yellow
            else if (touchedLocationValue >= 40) fillColor = 'FFFFA500'; // Orange
            else fillColor = 'FFFF0000'; // Red
    
            if (fillColor) {
                touchedLocationCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: fillColor },
                };
            }
        });

        // Save to a file or return a buffer
        const filePath = `report_${reportName}.xlsx`;
        await workbook.xlsx.writeFile(filePath);

        logDebug('NotificationController:generateVehicleExcel: Excel file created successfully:', filePath);
        return filePath;
    } catch (error) {
        logError('NotificationController:generateVehicleExcel: Error generating Excel file:', error);
        throw error;
    }
}

async function generateGeofenceExcel(reportName: any, reportData: any) {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Report');

        if (reportData.length === 0) {
            logError(`NotificationController:generateGeofenceExcel: reportData Empty`);
            throw new Error('reportData is empty.');
        }

        logDebug(`NotificationController:generateGeofenceExcel: Data before generating XLS:`, reportData);

        // Extract columns from the first object in the array
        const columns = Object.keys(reportData[0]).map((key) => ({ header: formatHeader(key), key }));
        worksheet.columns = columns;

        worksheet.getRow(1).eachCell((cell: any) => {
            cell.font = { bold: true, size: 18 }; // Make header bold
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: '6e6f70' }, // Gold background color
            };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' },
            };
            cell.alignment = { horizontal: 'center', vertical: 'middle' }; // Center alignment
        });

        worksheet.columns.forEach((column: any) => {
            if (column.header) {
                column.width = column.header.length + 2; // Add padding
            }
        });
        // Add rows from the array
        reportData.forEach((data: any) => {
            worksheet.addRow({
                ...data,
            });
        });

        worksheet.eachRow((row: any, rowNumber: any) => {
            if (rowNumber === 1) return; // Skip the header row
    
            const touchedLocationCell = row.getCell('touchedLocation');
            const touchedLocationValue = touchedLocationCell.value;
    
            touchedLocationCell.value = touchedLocationValue? 'Yes' : 'No';
            const fillColor = touchedLocationValue ? 'FF00FF00' : 'FFFF0000';
    
            if (fillColor) {
                touchedLocationCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: fillColor },
                };
            }
        });

        // Save to a file or return a buffer
        const filePath = `report_${reportName}.xlsx`;
        await workbook.xlsx.writeFile(filePath);

        logDebug('NotificationController:generateGeofenceExcel: Excel file created successfully:', filePath);
        return filePath;
    } catch (error) {
        logError('NotificationController:generateGeofenceExcel: Error generating Excel file:', error);
        throw error;
    }
}

async function sendEmail(filePath: any) {
    try {

        const subscribers = await fetchAppConfigByConfigKey('ReportEmailSubscribers');
        logDebug(`NotificationController:generateExcel: mail subscribers`, subscribers);

        const mailOptions = {
            from: 'OldCrux FleetControl <support@oldcrux.com>',
            to: `${subscribers}`,
            subject: `Report ${filePath}`,
            text: `Please find the attached report ${filePath} in Excel format.`,
            html: `<html>
                    <body style="background-color: #ffffff; color: #333333; font-family: Roboto, sans-serif; margin: 0; padding: 20px; line-height: 1.6;">
                        <p style="font-size: 16px; margin: 0;">Hello,</p>
                        <p style="font-size: 16px; margin: 10px 0 0;">Please find the attached report, <strong>${filePath}</strong>.</p>
                        <p style="font-size: 16px; margin: 10px 0;">Thank you.</p>

                        <div style="margin-top: 20px; font-size: 14px; color: #666666; border-top: 1px solid #dddddd; padding-top: 15px;">
                        <p style="margin: 0;">Note: This is an automated email from an unmonitored mailbox. Please do not reply to this message.</p>
                        </div>
                        <div style="margin-top: 20px; font-size: 12px; font-family: 'Montserrat', sans-serif; text-align: center; color: #999999;">
                        <p style="margin: 0;">© ${new Date().getFullYear()} OldCrux Pvt Ltd. All rights reserved.</p>
                        </div>
                    </body>
                    </html>`,
            attachments: [
                {
                    filename: `${filePath}`,
                    path: filePath, // Path to the file
                },
            ],
        };

        await transporter.sendMail(mailOptions);
        logDebug('NotificationController:sendEmail: Email sent successfully!');

        await fileCleanup(filePath);
    } catch (error) {
        logError('NotificationController:sendEmail: Error sending email:', error);
    }
}

async function fileCleanup(filePath: any) {
    fs.unlink(filePath, (err: any) => {
        if (err) {
            logError(`NotificationController:fileCleanup: Error deleting the file: ${filePath}`, err);
        } else {
            logDebug(`NotificationController:fileCleanup: Temporary file ${filePath} deleted successfully.`);
        }
    });
}

export async function notifyViaEmail(reportName: any, reportData: any) {
    logDebug(`NotificationController:notifyViaEmail: Sending email:`, reportData);

    if (reportName.includes("vehicle")) {
        generateVehicleExcel(reportName, reportData)
            .then((filePath) => sendEmail(filePath))
            .catch((err) => logError('NotificationController:notifyViaEmail: Failed to generate vehicle report or send email:', err));
    }
    else if (reportName.includes("geofence")) {
        generateGeofenceExcel(reportName, reportData)
            .then((filePath) => sendEmail(filePath))
            .catch((err) => logError('NotificationController:notifyViaEmail Failed to generate geofence report or send email:', err));
    }
}

function formatHeader(header: any) {
    // Convert camelCase to "Title Case" with spaces
    return header
        .replace(/([A-Z])/g, ' $1') // Insert space before uppercase letters
        .replace(/^./, (str: any) => str.toUpperCase()); // Capitalize the first letter
}

const transporter = nodemailer.createTransport({
    host: "smtp.zoho.com",
    port: 465, // or 587 for TLS
    secure: true, // use true for port 465, false for other ports
    auth: {
        user: `support@oldcrux.com`,
        pass: `PlantRootWater001!`,
    },
});

