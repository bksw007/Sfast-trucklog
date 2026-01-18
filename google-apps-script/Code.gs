/**
 * SFast Trucklog - Google Apps Script Backend
 *
 * This script provides API endpoints for the web app to interact with Google Sheets.
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1Wsa7lQTFA3MMwXv5RZQ3KNEimbf_zs5ma4fSvhHPki0
 * 2. Go to Extensions > Apps Script
 * 3. Copy and paste this entire code
 * 4. Save the project (Ctrl+S)
 * 5. Run the function "setupSheets" first to create sheet structure
 * 6. Click "Deploy" > "New deployment"
 * 7. Select type: "Web app"
 * 8. Set "Execute as": Me
 * 9. Set "Who has access": Anyone
 * 10. Click "Deploy"
 * 11. Copy the Web App URL and add it to your .env.local file as VITE_GOOGLE_SCRIPT_URL
 *
 * SHEET STRUCTURE:
 * Sheet 1 "Jobs": ID | Date | PickupLocation | DropoffLocation | Rounds | VehicleType | DriverName | LicensePlate | JobNo | InvNo | Remarks | Timestamp
 * Sheet 2 "Options": Category | Value
 */

// Spreadsheet ID from the URL
const SPREADSHEET_ID = "1Wsa7lQTFA3MMwXv5RZQ3KNEimbf_zs5ma4fSvhHPki0";

// Sheet names
const JOBS_SHEET = "Jobs";
const OPTIONS_SHEET = "Options";

// Column headers for Jobs sheet
const JOBS_HEADERS = [
  "ID",
  "Date",
  "PickupLocation",
  "DropoffLocation",
  "Rounds",
  "VehicleType",
  "DriverName",
  "LicensePlate",
  "JobNo",
  "InvNo",
  "Remarks",
  "Timestamp",
];

// Column headers for Options sheet
const OPTIONS_HEADERS = ["Category", "Value"];

/**
 * MAIN SETUP FUNCTION - Run this first to create sheets and columns
 * Go to Run > Run function > setupSheets
 */
function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Setup Jobs sheet
  let jobsSheet = ss.getSheetByName(JOBS_SHEET);
  if (!jobsSheet) {
    jobsSheet = ss.insertSheet(JOBS_SHEET);
    Logger.log("Created Jobs sheet");
  }

  // Clear existing content and set headers
  jobsSheet.clear();
  jobsSheet.getRange(1, 1, 1, JOBS_HEADERS.length).setValues([JOBS_HEADERS]);

  // Format Jobs header
  const jobsHeaderRange = jobsSheet.getRange(1, 1, 1, JOBS_HEADERS.length);
  jobsHeaderRange
    .setFontWeight("bold")
    .setBackground("#7c3aed")
    .setFontColor("white")
    .setHorizontalAlignment("center");

  // Set column widths for Jobs
  jobsSheet.setColumnWidth(1, 120); // ID
  jobsSheet.setColumnWidth(2, 100); // Date
  jobsSheet.setColumnWidth(3, 150); // PickupLocation
  jobsSheet.setColumnWidth(4, 150); // DropoffLocation
  jobsSheet.setColumnWidth(5, 60); // Rounds
  jobsSheet.setColumnWidth(6, 100); // VehicleType
  jobsSheet.setColumnWidth(7, 120); // DriverName
  jobsSheet.setColumnWidth(8, 100); // LicensePlate
  jobsSheet.setColumnWidth(9, 100); // JobNo
  jobsSheet.setColumnWidth(10, 100); // InvNo
  jobsSheet.setColumnWidth(11, 200); // Remarks
  jobsSheet.setColumnWidth(12, 130); // Timestamp

  // Freeze header row
  jobsSheet.setFrozenRows(1);

  Logger.log("Jobs sheet setup complete");

  // Setup Options sheet
  let optionsSheet = ss.getSheetByName(OPTIONS_SHEET);
  if (!optionsSheet) {
    optionsSheet = ss.insertSheet(OPTIONS_SHEET);
    Logger.log("Created Options sheet");
  }

  // Clear existing content and set headers
  optionsSheet.clear();
  optionsSheet
    .getRange(1, 1, 1, OPTIONS_HEADERS.length)
    .setValues([OPTIONS_HEADERS]);

  // Format Options header
  const optionsHeaderRange = optionsSheet.getRange(
    1,
    1,
    1,
    OPTIONS_HEADERS.length,
  );
  optionsHeaderRange
    .setFontWeight("bold")
    .setBackground("#0ea5e9")
    .setFontColor("white");

  // Set column widths for Options
  optionsSheet.setColumnWidth(1, 150);
  optionsSheet.setColumnWidth(2, 200);

  // Freeze header row
  optionsSheet.setFrozenRows(1);

  // Add default options
  const defaultOptions = [
    ["locations", "คลังสินค้า A"],
    ["locations", "ท่าเรือ B"],
    ["locations", "โรงงาน C"],
    ["locations", "ลูกค้า A"],
    ["locations", "โรงงาน B"],
    ["locations", "ศูนย์กระจายสินค้า"],
    ["vehicleTypes", "4 ล้อ"],
    ["vehicleTypes", "6 ล้อ"],
    ["vehicleTypes", "10 ล้อ"],
    ["vehicleTypes", "หัวลาก"],
    ["vehicleTypes", "รถพ่วง"],
    ["drivers", "พนักงานขับรถ 1"],
    ["drivers", "พนักงานขับรถ 2"],
    ["drivers", "พนักงานขับรถ 3"],
    ["licensePlates", "70-1234"],
    ["licensePlates", "12-5678"],
    ["licensePlates", "99-8888"],
  ];

  optionsSheet
    .getRange(2, 1, defaultOptions.length, 2)
    .setValues(defaultOptions);

  Logger.log("Options sheet setup complete with default values");
  Logger.log("Setup complete! You can now deploy as Web App.");
}

/**
 * Handle GET requests - Fetch all data
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Get Jobs
    const jobsSheet = ss.getSheetByName(JOBS_SHEET);
    const jobs = [];
    if (jobsSheet) {
      const jobsData = jobsSheet.getDataRange().getValues();
      for (let i = 1; i < jobsData.length; i++) {
        const row = jobsData[i];
        if (row[0]) {
          // Has ID
          jobs.push({
            id: row[0],
            date: row[1],
            pickupLocation: row[2],
            dropoffLocation: row[3],
            rounds: row[4],
            vehicleType: row[5],
            driverName: row[6],
            licensePlate: row[7],
            jobNo: row[8],
            invNo: row[9],
            remarks: row[10],
            timestamp: row[11],
          });
        }
      }
    }

    // Get Options
    const optionsSheet = ss.getSheetByName(OPTIONS_SHEET);
    const options = {
      locations: [],
      vehicleTypes: [],
      drivers: [],
      licensePlates: [],
    };

    if (optionsSheet) {
      const optionsData = optionsSheet.getDataRange().getValues();
      for (let i = 1; i < optionsData.length; i++) {
        const category = optionsData[i][0];
        const value = optionsData[i][1];
        if (category && value && options[category]) {
          options[category].push(value);
        }
      }
    }

    const result = { jobs, options };

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
      ContentService.MimeType.JSON,
    );
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: error.message }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle POST requests - Add/Update/Delete data
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    switch (action) {
      case "addJob":
        return addJob(ss, data.job);
      case "updateJob":
        return updateJob(ss, data.job);
      case "deleteJob":
        return deleteJob(ss, data.id);
      case "addOption":
        return addOption(ss, data.category, data.value);
      case "init":
      case "setup":
        setupSheets();
        return ContentService.createTextOutput(
          JSON.stringify({ success: true, message: "Sheets initialized" }),
        ).setMimeType(ContentService.MimeType.JSON);
      default:
        throw new Error("Unknown action: " + action);
    }
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: error.message }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Add a new job entry
 */
function addJob(ss, job) {
  const sheet = ss.getSheetByName(JOBS_SHEET);
  if (!sheet)
    throw new Error("Jobs sheet not found. Please run setupSheets() first.");

  const id = Utilities.getUuid();
  const timestamp = new Date().getTime();

  sheet.appendRow([
    id,
    job.date,
    job.pickupLocation,
    job.dropoffLocation,
    job.rounds,
    job.vehicleType,
    job.driverName,
    job.licensePlate,
    job.jobNo,
    job.invNo,
    job.remarks,
    timestamp,
  ]);

  const newJob = { ...job, id, timestamp };

  return ContentService.createTextOutput(
    JSON.stringify({ success: true, job: newJob }),
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Update an existing job
 */
function updateJob(ss, job) {
  const sheet = ss.getSheetByName(JOBS_SHEET);
  if (!sheet) throw new Error("Jobs sheet not found");

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === job.id) {
      // Update the row
      sheet
        .getRange(i + 1, 2, 1, 10)
        .setValues([
          [
            job.date,
            job.pickupLocation,
            job.dropoffLocation,
            job.rounds,
            job.vehicleType,
            job.driverName,
            job.licensePlate,
            job.jobNo,
            job.invNo,
            job.remarks,
          ],
        ]);

      return ContentService.createTextOutput(
        JSON.stringify({ success: true, job }),
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  throw new Error("Job not found: " + job.id);
}

/**
 * Delete a job by ID
 */
function deleteJob(ss, id) {
  const sheet = ss.getSheetByName(JOBS_SHEET);
  if (!sheet) throw new Error("Jobs sheet not found");

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return ContentService.createTextOutput(
        JSON.stringify({ success: true }),
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  throw new Error("Job not found: " + id);
}

/**
 * Add a new option
 */
function addOption(ss, category, value) {
  const sheet = ss.getSheetByName(OPTIONS_SHEET);
  if (!sheet)
    throw new Error("Options sheet not found. Please run setupSheets() first.");

  // Check if already exists
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === category && data[i][1] === value) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: true, message: "Option already exists" }),
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  sheet.appendRow([category, value]);

  return ContentService.createTextOutput(
    JSON.stringify({ success: true }),
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Test function - Run this to test the setup
 */
function testSetup() {
  setupSheets();

  // Test adding a job
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const testJob = {
    date: "2024-01-18",
    pickupLocation: "คลังสินค้า A",
    dropoffLocation: "ลูกค้า A",
    rounds: 2,
    vehicleType: "6 ล้อ",
    driverName: "พนักงานขับรถ 1",
    licensePlate: "70-1234",
    jobNo: "JOB-TEST-001",
    invNo: "INV-TEST-001",
    remarks: "ทดสอบระบบ",
  };

  addJob(ss, testJob);
  Logger.log("Test job added successfully!");
}
