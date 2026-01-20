/**
 * Cloud Function: Sync Firestore to Google Sheets
 * Runs every 5 minutes to backup data to Google Sheets
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { google } = require("googleapis");

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

// Configuration
const SPREADSHEET_ID = "1Wsa7lQTFA3MMwXv5RZQ3KNEimbf_zs5ma4fSvhHPki0";
const JOBS_SHEET = "Jobs";
const OPTIONS_SHEET = "Options";

// Format date to YYYY-MM-DD
const formatDate = (dateStr) => {
  if (!dateStr) return "";
  if (typeof dateStr === "string" && dateStr.includes("T")) {
    return dateStr.split("T")[0];
  }
  return dateStr;
};

// Get authenticated Sheets client
const getSheetsClient = async () => {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
};

// Sync jobs from Firestore to Sheets
const syncJobsToSheet = async (sheets) => {
  console.log("Syncing jobs to sheet...");
  
  // Get all jobs from Firestore
  const jobsSnapshot = await db.collection("jobs").orderBy("timestamp", "desc").get();
  const jobs = jobsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  console.log(`Found ${jobs.length} jobs to sync`);

  // Prepare headers
  const headers = ["ID", "Date", "PickupLocation", "DropoffLocation", "Rounds", 
                   "VehicleType", "DriverName", "LicensePlate", "JobNo", "InvNo", "Remarks", "ImageUrl", "Timestamp"];

  // Prepare rows
  const rows = jobs.map(job => [
    job.id || "",
    formatDate(job.date),
    job.pickupLocation || "",
    job.dropoffLocation || "",
    job.rounds || 0,
    job.vehicleType || "",
    job.driverName || "",
    job.licensePlate || "",
    job.jobNo || "",
    job.invNo || "",
    job.remarks || "",
    job.imageUrl || "",
    job.timestamp || ""
  ]);

  // Clear existing data and write new data
  try {
    // Clear the sheet first
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${JOBS_SHEET}!A:M`
    });

    // Write headers and data
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${JOBS_SHEET}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [headers, ...rows]
      }
    });

    console.log(`Successfully synced ${jobs.length} jobs to sheet`);
  } catch (error) {
    console.error("Error syncing jobs:", error.message);
    throw error;
  }
};

// Sync options from Firestore to Sheets
const syncOptionsToSheet = async (sheets) => {
  console.log("Syncing options to sheet...");

  // Get all options from Firestore
  const optionsSnapshot = await db.collection("options").get();
  const options = optionsSnapshot.docs.map(doc => doc.data());

  console.log(`Found ${options.length} options to sync`);

  // Prepare headers
  const headers = ["Category", "Value"];

  // Prepare rows
  const rows = options.map(opt => [
    opt.category || "",
    opt.value || ""
  ]);

  try {
    // Clear the sheet first
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${OPTIONS_SHEET}!A:B`
    });

    // Write headers and data
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${OPTIONS_SHEET}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [headers, ...rows]
      }
    });

    console.log(`Successfully synced ${options.length} options to sheet`);
  } catch (error) {
    console.error("Error syncing options:", error.message);
    throw error;
  }
};

// Main scheduled function - runs every 3 minutes
exports.syncToSheets = onSchedule({
  schedule: "every 3 minutes",
  region: "asia-southeast1",
  timeoutSeconds: 60,
  memory: "256MiB"
}, async (event) => {
  console.log("Starting scheduled sync to Google Sheets...");
  console.log(`Time: ${new Date().toISOString()}`);

  try {
    const sheets = await getSheetsClient();
    
    // Sync both jobs and options
    await syncJobsToSheet(sheets);
    await syncOptionsToSheet(sheets);

    console.log("Sync completed successfully!");
    return null;
  } catch (error) {
    console.error("Sync failed:", error);
    throw error;
  }
});

// HTTP trigger for manual testing
const { onRequest } = require("firebase-functions/v2/https");

exports.manualSync = onRequest({
  region: "asia-southeast1",
  cors: true,
  invoker: "public"  // Allow unauthenticated access
}, async (req, res) => {
  console.log("Manual sync triggered...");

  try {
    const sheets = await getSheetsClient();
    
    await syncJobsToSheet(sheets);
    await syncOptionsToSheet(sheets);

    res.json({ 
      success: true, 
      message: "Sync completed successfully",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Manual sync failed:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});
