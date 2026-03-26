import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";
import {setGlobalOptions} from "firebase-functions/v2";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";

initializeApp();

setGlobalOptions({
  maxInstances: 10,
  region: "asia-southeast1",
});

type JobStatus = "pending" | "in_progress" | "completed";

type TodayJobEntry = {
  jobNo?: string;
  invNo?: string;
  transportDocNo?: string;
  workOrderNo?: string;
  orderDate?: string;
  vehicleType?: string;
  ticketNo?: string;
  quantity?: string;
  rounds?: number;
  employerCompany?: string;
  productName?: string;
  plateNo?: string;
  pickup?: {
    location?: string;
    date?: string;
    time?: string;
    contact?: string;
  };
  delivery?: {
    location?: string;
    date?: string;
    time?: string;
    contact?: string;
  };
  driverName?: string;
  originImageUrl?: string;
  originImageUrls?: string[];
  destinationImageUrl?: string;
  destinationImageUrls?: string[];
  documentImageUrl?: string;
  documentImageUrls?: string[];
  fuelAndToll?: number | string | null;
  status?: JobStatus;
  assignedToUid?: string;
  assignedToName?: string;
  acceptedAt?: number | null;
  driverUpdateCount?: number;
  readyToClose?: boolean;
  completedAt?: number | null;
  revision?: number;
  updatedAt?: number;
  importantNote?: string;
  timestamp?: number;
};

type NotifyEventType = "create" | "update" | "accept" | "ready" | "complete";
type UserRole = "admin" | "user";
type LineNotificationResult = {
  attempted: boolean;
  ok: boolean;
  status?: number;
  reason?: string;
};
type DashboardMetricEntry = {
  name: string;
  count: number;
};

type BangchakOilEntry = {
  OilName?: string;
  PriceYesterday?: number | string;
  PriceToday?: number | string;
};

type BangchakOilResponse = {
  OilPriceDate?: string;
  OilPriceTime?: string;
  OilRemark?: string;
  OilRemark2?: string;
  OilList?: string;
};

type DieselPriceRecord = {
  fuelType: "diesel";
  oilName: string;
  effectiveDate: string;
  priceToday: number;
  priceYesterday: number;
  differenceFromYesterday: number;
  changeDirection: "up" | "down" | "same";
  summaryText: string;
  sourcePriceDate?: string;
  sourcePriceTime?: string;
  sourceRemark?: string;
  sourceRemark2?: string;
  fetchedAt: number;
  updatedAt: number;
  morningNotifiedOn?: string;
  eveningNotifiedOn?: string;
};

const db = getFirestore();
const adminAuth = getAuth();
const messaging = getMessaging();

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const LINE_GROUP_ID = process.env.LINE_GROUP_ID || "";
const DASHBOARD_METRICS_COLLECTION = "dashboard_metrics";
const FUEL_PRICES_COLLECTION = "fuel_prices";
const LATEST_DIESEL_PRICE_DOC_ID = "latest_diesel";
const BANGCHAK_OIL_API_URL = "https://oil-price.bangchak.co.th/ApiOilPrice2/th";
const INVALID_FCM_TOKEN_ERROR_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

const normalizeTokens = (tokens: unknown): string[] => {
  if (!Array.isArray(tokens)) return [];
  return Array.from(
    new Set(
      tokens
        .filter((token) => typeof token === "string")
        .map((token) => token.trim())
        .filter(Boolean)
    )
  );
};

const getUserTokens = async (uid?: string): Promise<string[]> => {
  if (!uid) return [];
  const snapshot = await db.collection("users").doc(uid).get();
  if (!snapshot.exists) return [];
  return normalizeTokens(snapshot.data()?.fcmTokens);
};

const getAdminTokens = async (): Promise<string[]> => {
  const snapshot = await db.collection("users")
    .where("role", "==", "admin")
    .get();
  const tokens = snapshot.docs
    .flatMap((doc) => normalizeTokens(doc.data()?.fcmTokens));
  return Array.from(new Set(tokens));
};

const getAllUserTokens = async (): Promise<string[]> => {
  const snapshot = await db.collection("users").get();
  const tokens = snapshot.docs
    .flatMap((doc) => normalizeTokens(doc.data()?.fcmTokens));
  return Array.from(new Set(tokens));
};

const isUserRole = (value: unknown): value is UserRole =>
  value === "admin" || value === "user";

const getRoleFromClaims = (
  authToken?: Record<string, unknown>
): UserRole | null => {
  const claimRole = authToken?.role;
  return isUserRole(claimRole) ? claimRole : null;
};

const isGoogleHostedPhoto = (photoURL?: string): boolean => {
  const normalized = (photoURL || "").trim().toLowerCase();
  if (!normalized) return false;

  return normalized.includes("googleusercontent.com") ||
    normalized.includes("googleapis.com/a/");
};

const getUserRole = async (
  uid: string,
  authToken?: Record<string, unknown>
): Promise<UserRole> => {
  const roleFromClaims = getRoleFromClaims(authToken);
  if (roleFromClaims) return roleFromClaims;

  const userSnapshot = await db.collection("users").doc(uid).get();
  return userSnapshot.data()?.role === "admin" ? "admin" : "user";
};

const syncUserRoleClaim = async (
  uid: string,
  role: UserRole
): Promise<void> => {
  const userRecord = await adminAuth.getUser(uid);
  const existingClaims = userRecord.customClaims || {};
  const nextClaims = {
    ...existingClaims,
    role,
    admin: role === "admin",
  };

  const alreadySynced =
    existingClaims.role === nextClaims.role &&
    existingClaims.admin === nextClaims.admin;
  if (alreadySynced) return;

  await adminAuth.setCustomUserClaims(uid, nextClaims);
};

const getMonthKey = (value?: string): string => asDateOnly(value).slice(0, 7);

const getMonthDateRange = (
  monthKey: string
): {startDate: string; endDateExclusive: string} => {
  const [yearPart, monthPart] = monthKey.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new HttpsError("invalid-argument", "Invalid monthKey");
  }

  const next = new Date(year, month, 1);
  return {
    startDate: `${yearPart}-${monthPart.padStart(2, "0")}-01`,
    endDateExclusive:
      `${next.getFullYear()}-` +
      `${String(next.getMonth() + 1).padStart(2, "0")}-01`,
  };
};

const toPositiveNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildDashboardMetricSummary = (
  monthKey: string,
  jobs: Array<Record<string, unknown>>
): Record<string, unknown> => {
  const driverCounts = new Map<string, number>();
  const vehicleTypeCounts = new Map<string, number>();
  const uniqueDrivers = new Set<string>();
  const uniqueVehicles = new Set<string>();

  let totalRounds = 0;

  jobs.forEach((job) => {
    const driverName =
      (typeof job.driverName === "string" ? job.driverName.trim() : "") ||
      "ไม่ระบุคนขับ";
    const vehicleType =
      (typeof job.vehicleType === "string" ? job.vehicleType.trim() : "") ||
      "ไม่ระบุประเภทรถ";
    const licensePlate =
      (typeof job.licensePlate === "string" ? job.licensePlate.trim() : "") ||
      "";

    driverCounts.set(driverName, (driverCounts.get(driverName) || 0) + 1);
    vehicleTypeCounts.set(
      vehicleType,
      (vehicleTypeCounts.get(vehicleType) || 0) + 1
    );
    uniqueDrivers.add(driverName);
    if (licensePlate) uniqueVehicles.add(licensePlate);

    totalRounds += toPositiveNumber(job.rounds);
  });

  const toEntries = (source: Map<string, number>): DashboardMetricEntry[] =>
    Array.from(source.entries())
      .map(([name, count]) => ({name, count}))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "th"));

  return {
    month: monthKey,
    totalJobs: jobs.length,
    totalRounds,
    uniqueDrivers: uniqueDrivers.size,
    uniqueVehicles: uniqueVehicles.size,
    jobsPerDriver: toEntries(driverCounts),
    vehicleTypeCounts: toEntries(vehicleTypeCounts),
    updatedAt: Date.now(),
  };
};

const rebuildDashboardMetricsForMonth = async (
  monthKey: string
): Promise<void> => {
  const normalizedMonthKey = monthKey.trim();
  if (!normalizedMonthKey) {
    throw new HttpsError("invalid-argument", "monthKey is required");
  }

  const {startDate, endDateExclusive} = getMonthDateRange(normalizedMonthKey);
  const snapshot = await db.collection("jobs")
    .where("date", ">=", startDate)
    .where("date", "<", endDateExclusive)
    .get();
  const jobs = snapshot.docs
    .map((doc) => doc.data() as Record<string, unknown>);
  const payload = buildDashboardMetricSummary(normalizedMonthKey, jobs);

  await db.collection(DASHBOARD_METRICS_COLLECTION)
    .doc(normalizedMonthKey)
    .set(payload, {merge: true});
};

const asLineDate = (value?: string): string => {
  if (!value) return "-";
  return value.split("T")[0] || "-";
};

const asDisplayTime = (value?: string): string => value?.trim() || "-";

const asDisplayContact = (value?: string): string => value?.trim() || "-";
const getWorkOrderNo = (job: TodayJobEntry): string =>
  job.workOrderNo || job.ticketNo || "-";
const asDateOnly = (value?: string): string =>
  (value || "").split("T")[0] || "";
const getBangkokToday = (): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
  }).format(new Date());
const formatThaiDate = (value?: string): string => {
  const normalized = (value || "").trim();
  if (!normalized) return "-";

  const [year, month, day] = normalized.split("-").map(Number);
  if (!year || !month || !day) return normalized;

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
};
const isBackdatedJob = (
  job: TodayJobEntry
): boolean => {
  const pickupDate = asDateOnly(job.pickup?.date);
  if (!pickupDate) return false;
  return pickupDate < getBangkokToday();
};

const formatBaht = (value: number): string => value.toFixed(2);

const buildDieselPriceSummaryText = (
  effectiveDate: string,
  priceToday: number,
  differenceFromYesterday: number
): string => {
  const dateLabel = formatThaiDate(effectiveDate);

  if (differenceFromYesterday > 0) {
    return [
      `ราคาน้ำมันวันนี้ ${dateLabel}`,
      "น้ำมันดีเซลราคาลิตรละ",
      `${formatBaht(priceToday)} บาท`,
      `เพิ่มขึ้น ${formatBaht(differenceFromYesterday)} บาท`,
    ].join(" ");
  }

  if (differenceFromYesterday < 0) {
    return [
      `ราคาน้ำมันวันนี้ ${dateLabel}`,
      "น้ำมันดีเซลราคาลิตรละ",
      `${formatBaht(priceToday)} บาท`,
      `ลดลง ${formatBaht(Math.abs(differenceFromYesterday))} บาท`,
    ].join(" ");
  }

  return [
    `ราคาน้ำมันวันนี้ ${dateLabel}`,
    "น้ำมันดีเซลราคาลิตรละ",
    `${formatBaht(priceToday)} บาท`,
    "คงเดิม 0.00 บาท",
  ].join(" ");
};

const selectDieselOilEntry = (
  items: BangchakOilEntry[]
): BangchakOilEntry | null => {
  const prioritizedMatchers = [
    (name: string) => name === "ไฮดีเซล s",
    (name: string) => name === "ดีเซล s",
    (name: string) => name.includes("ดีเซล") && !name.includes("พรีเมียม"),
    (name: string) => name.includes("ดีเซล"),
  ];

  for (const matcher of prioritizedMatchers) {
    const found = items.find((item) =>
      matcher((item.OilName || "").trim().toLowerCase())
    );
    if (found) return found;
  }

  return null;
};

const fetchBangchakDieselPrice = async (): Promise<DieselPriceRecord> => {
  const response = await fetch(BANGCHAK_OIL_API_URL, {
    headers: {
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Bangchak API failed with status ${response.status}`);
  }

  const payload = await response.json() as BangchakOilResponse[];
  const latest = Array.isArray(payload) && payload.length > 0 ?
    payload[0] :
    null;
  if (!latest) {
    throw new Error("Bangchak API returned empty payload");
  }

  const oilListRaw = latest.OilList || "[]";
  const oilList = JSON.parse(oilListRaw) as BangchakOilEntry[];
  if (!Array.isArray(oilList) || oilList.length === 0) {
    throw new Error("Bangchak API OilList is empty");
  }

  const dieselEntry = selectDieselOilEntry(oilList);
  if (!dieselEntry) {
    throw new Error("Diesel price entry not found in Bangchak API");
  }

  const priceToday = toFiniteNumber(dieselEntry.PriceToday);
  const priceYesterday = toFiniteNumber(dieselEntry.PriceYesterday);
  if (priceToday === null || priceYesterday === null) {
    throw new Error("Diesel price fields are invalid");
  }

  const differenceFromYesterday = Number(
    (priceToday - priceYesterday).toFixed(2)
  );
  const effectiveDate = getBangkokToday();
  const changeDirection = differenceFromYesterday > 0 ?
    "up" :
    differenceFromYesterday < 0 ?
      "down" :
      "same";
  const now = Date.now();

  return {
    fuelType: "diesel",
    oilName: dieselEntry.OilName || "ไฮดีเซล S",
    effectiveDate,
    priceToday,
    priceYesterday,
    differenceFromYesterday,
    changeDirection,
    summaryText: buildDieselPriceSummaryText(
      effectiveDate,
      priceToday,
      differenceFromYesterday
    ),
    sourcePriceDate: latest.OilPriceDate,
    sourcePriceTime: latest.OilPriceTime,
    sourceRemark: latest.OilRemark,
    sourceRemark2: latest.OilRemark2,
    fetchedAt: now,
    updatedAt: now,
  };
};

const persistDieselPriceRecord = async (
  record: DieselPriceRecord
): Promise<void> => {
  const batch = db.batch();
  const collectionRef = db.collection(FUEL_PRICES_COLLECTION);
  const latestRef = collectionRef.doc(LATEST_DIESEL_PRICE_DOC_ID);
  const dailyRef = collectionRef.doc(record.effectiveDate);

  batch.set(dailyRef, record, {merge: true});
  batch.set(latestRef, record, {merge: true});
  await batch.commit();
};

const getLatestDieselPriceRecord = async (
): Promise<DieselPriceRecord | null> => {
  const snapshot = await db.collection(FUEL_PRICES_COLLECTION)
    .doc(LATEST_DIESEL_PRICE_DOC_ID)
    .get();
  if (!snapshot.exists) return null;
  return snapshot.data() as DieselPriceRecord;
};

const syncLatestDieselPrice = async (): Promise<DieselPriceRecord> => {
  const record = await fetchBangchakDieselPrice();
  await persistDieselPriceRecord(record);
  return record;
};

const ensureFreshDieselPriceRecord = async (): Promise<DieselPriceRecord> => {
  const today = getBangkokToday();
  const latest = await getLatestDieselPriceRecord();
  if (latest && latest.effectiveDate === today) {
    return latest;
  }

  return syncLatestDieselPrice();
};

const notifyDieselPriceUpdate = async (
  slot: "morning" | "evening"
): Promise<void> => {
  const today = getBangkokToday();
  const latest = await ensureFreshDieselPriceRecord();
  const notificationField =
    slot === "morning" ? "morningNotifiedOn" : "eveningNotifiedOn";

  if (latest[notificationField] === today) {
    logger.info("Diesel price notification already sent", {slot, today});
    return;
  }

  const tokens = await getAllUserTokens();
  if (tokens.length === 0) {
    logger.info("Diesel price notification skipped (no tokens)", {slot, today});
    return;
  }

  await sendPush(
    tokens,
    "อัปเดตราคาน้ำมันดีเซล",
    latest.summaryText,
    {
      eventType: "fuel_price",
      fuelType: latest.fuelType,
      slot,
      effectiveDate: latest.effectiveDate,
      priceToday: formatBaht(latest.priceToday),
      differenceFromYesterday: formatBaht(latest.differenceFromYesterday),
    },
    "/#/"
  );

  await db.collection(FUEL_PRICES_COLLECTION)
    .doc(LATEST_DIESEL_PRICE_DOC_ID)
    .set({
      [notificationField]: today,
      updatedAt: Date.now(),
    }, {merge: true});

  logger.info("Diesel price notification sent", {
    slot,
    today,
    tokenCount: tokens.length,
  });
};

const buildLineText = (
  eventType: NotifyEventType,
  job: TodayJobEntry
): string => {
  const eventLabel: Record<NotifyEventType, string> = {
    create: "สร้างงานใหม่",
    update: "แก้ไขใบแจ้งงาน",
    accept: "พนักงานรับงานแล้ว",
    ready: "พนักงานกดพร้อมจบงาน",
    complete: "พนักงานจบงานแล้ว",
  };

  const statusLabelMap: Record<JobStatus, string> = {
    pending: "รอรับงาน",
    in_progress: "กำลังทำงาน",
    completed: "เสร็จงาน",
  };

  const statusLabel = job.status ?
    statusLabelMap[job.status] || job.status :
    "-";
  const head = `ขุนบันลือ | ${eventLabel[eventType]}`;

  // Format 1: create/update
  if (eventType === "create" || eventType === "update") {
    return [
      head,
      `เลขที่ใบสั่งงาน: ${getWorkOrderNo(job)}`,
      `ผู้ว่าจ้าง: ${job.employerCompany || "-"}`,
      `สินค้า: ${job.productName || "-"}`,
      `คนขับ: ${job.assignedToName || job.driverName || "-"}`,
      `ทะเบียนรถ: ${job.plateNo || "-"}`,
      "",
      "จุดรับ",
      `- สถานที่: ${job.pickup?.location || "-"}`,
      `- วันที่รับ: ${asLineDate(job.pickup?.date)}`,
      `- เวลา: ${asDisplayTime(job.pickup?.time)}`,
      `- ผู้ติดต่อ: ${asDisplayContact(job.pickup?.contact)}`,
      "",
      "จุดส่ง",
      `- สถานที่: ${job.delivery?.location || "-"}`,
      `- วันที่ส่ง: ${asLineDate(job.delivery?.date)}`,
      `- เวลา: ${asDisplayTime(job.delivery?.time)}`,
      `- ผู้ติดต่อ: ${asDisplayContact(job.delivery?.contact)}`,
      "",
      `หมายเหตุ: ${job.importantNote || "-"}`,
      `สถานะงาน: ${statusLabel}`,
    ].join("\n");
  }

  // Format 2: accept/complete (and any other status event fallback)
  return [
    head,
    `เลขที่ใบสั่งงาน: ${getWorkOrderNo(job)}`,
    `วันที่รับ: ${asLineDate(job.pickup?.date)}`,
    `จุดรับ: ${job.pickup?.location || "-"}`,
    `จุดส่ง: ${job.delivery?.location || "-"}`,
    `คนขับ: ${job.assignedToName || job.driverName || "-"}`,
    "",
    `สถานะงาน: ${statusLabel}`,
  ].join("\n");
};

const sendLineNotification = async (
  eventType: NotifyEventType,
  jobId: string,
  job: TodayJobEntry
): Promise<LineNotificationResult> => {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_GROUP_ID) {
    logger.info("LINE skipped (missing env)", {eventType, jobId});
    return {
      attempted: false,
      ok: false,
      reason: "missing-env",
    };
  }

  const text = buildLineText(eventType, job);
  const payload = {
    to: LINE_GROUP_ID,
    messages: [
      {
        type: "text",
        text,
      },
    ],
  };

  try {
    const resp = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const body = await resp.text();
      logger.error(
        "LINE push failed",
        {eventType, jobId, status: resp.status, body}
      );
      return {
        attempted: true,
        ok: false,
        status: resp.status,
        reason: body || "request-failed",
      };
    }

    logger.info("LINE push sent", {eventType, jobId});
    return {
      attempted: true,
      ok: true,
      status: resp.status,
    };
  } catch (error) {
    logger.error("LINE push exception", {eventType, jobId, error});
    return {
      attempted: true,
      ok: false,
      reason: error instanceof Error ? error.message : "exception",
    };
  }
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const removeInvalidPushTokens = async (tokens: string[]): Promise<void> => {
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
  if (uniqueTokens.length === 0) return;

  for (const tokenChunk of chunk(uniqueTokens, 30)) {
    const snapshot = await db.collection("users")
      .where("fcmTokens", "array-contains-any", tokenChunk)
      .get();

    if (snapshot.empty) continue;

    const batch = db.batch();
    snapshot.docs.forEach((userDoc) => {
      batch.update(userDoc.ref, {
        fcmTokens: FieldValue.arrayRemove(...tokenChunk),
        lastPushTokenUpdatedAt: Date.now(),
      });
    });
    await batch.commit();
  }

  logger.info("Removed invalid push tokens", {
    invalidTokenCount: uniqueTokens.length,
  });
};

const sendPush = async (
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string>,
  linkPath: string
): Promise<void> => {
  const cleanedTokens = Array.from(new Set(tokens.filter(Boolean)));
  if (cleanedTokens.length === 0) return;

  const chunks = chunk(cleanedTokens, 500);

  for (const tokenChunk of chunks) {
    try {
      const response = await messaging.sendEachForMulticast({
        tokens: tokenChunk,
        notification: {title, body},
        data,
        webpush: {
          fcmOptions: {
            link: linkPath,
          },
        },
      });

      if (response.failureCount > 0) {
        const invalidTokens = response.responses.flatMap((result, index) => {
          const errorCode = result.error?.code;
          if (!errorCode || !INVALID_FCM_TOKEN_ERROR_CODES.has(errorCode)) {
            return [];
          }
          return tokenChunk[index] ? [tokenChunk[index]] : [];
        });

        if (invalidTokens.length > 0) {
          await removeInvalidPushTokens(invalidTokens);
        }

        logger.warn("Push sent with failures", {
          failureCount: response.failureCount,
          successCount: response.successCount,
          invalidTokenCount: invalidTokens.length,
        });
      }
    } catch (error) {
      logger.error("Push send exception", {error});
    }
  }
};

const notifyByEvent = async (
  eventType: NotifyEventType,
  jobId: string,
  job: TodayJobEntry
): Promise<{line: LineNotificationResult}> => {
  let lineResult: LineNotificationResult = {
    attempted: false,
    ok: false,
    reason: "not-attempted",
  };

  // Skip all notifications if admin updates after job is already completed.
  if (eventType === "update" && job.status === "completed") {
    logger.info("Notification skipped for completed job update", {
      eventType,
      jobId,
    });
    return {
      line: {
        attempted: false,
        ok: false,
        reason: "completed-job-update",
      },
    };
  }

  const driverLabel = job.assignedToName || job.driverName || "พนักงาน";
  const pickupLocation = job.pickup?.location || "-";
  const deliveryLocation = job.delivery?.location || "-";
  const routeLabel = `${pickupLocation} -> ${deliveryLocation}`;
  const vehicleLabel = job.vehicleType || "-";
  const plateLabel = job.plateNo || "-";
  const workOrderLabel = getWorkOrderNo(job);

  if (eventType !== "ready" && !isBackdatedJob(job)) {
    lineResult = await sendLineNotification(eventType, jobId, job);
  } else if (isBackdatedJob(job)) {
    logger.info("LINE skipped for backdated job", {
      eventType,
      jobId,
      pickupDate: asDateOnly(job.pickup?.date),
      today: getBangkokToday(),
    });
    lineResult = {
      attempted: false,
      ok: false,
      reason: "backdated-job",
    };
  } else {
    lineResult = {
      attempted: false,
      ok: false,
      reason: "ready-event",
    };
  }

  if (eventType === "create") {
    const [adminTokens, driverTokens] = await Promise.all([
      getAdminTokens(),
      getUserTokens(job.assignedToUid),
    ]);
    await Promise.all([
      sendPush(
        driverTokens,
        "มีงานใหม่มอบหมาย",
        `${routeLabel} | ${vehicleLabel} | ${plateLabel}`,
        {
          eventType,
          jobId,
          status: job.status || "",
          jobNo: job.jobNo || "",
        },
        "/#/driver/today"
      ),
      sendPush(
        adminTokens,
        "มีงานใหม่มอบหมาย",
        `${routeLabel} | ${vehicleLabel} | ${plateLabel} | ${driverLabel}`,
        {
          eventType,
          jobId,
          status: job.status || "",
          jobNo: job.jobNo || "",
        },
        "/#/today"
      ),
    ]);
    return {line: lineResult};
  }

  if (eventType === "update") {
    const [adminTokens, driverTokens] = await Promise.all([
      getAdminTokens(),
      getUserTokens(job.assignedToUid),
    ]);
    await Promise.all([
      sendPush(
        adminTokens,
        "มีการแก้ไขใบแจ้งงาน",
        `แอดมินแก้ไขงาน ${routeLabel} | ${driverLabel}`,
        {
          eventType,
          jobId,
          status: job.status || "",
          jobNo: job.jobNo || "",
        },
        "/#/today"
      ),
      sendPush(
        driverTokens,
        "มีการแก้ไขงานที่รับผิดชอบ",
        `${routeLabel} มีการอัปเดตข้อมูลล่าสุด`,
        {
          eventType,
          jobId,
          status: job.status || "",
          jobNo: job.jobNo || "",
        },
        "/#/driver/today"
      ),
    ]);
    return {line: lineResult};
  }

  if (eventType === "accept") {
    const adminTokens = await getAdminTokens();
    await sendPush(
      adminTokens,
      "พนักงานรับงานแล้ว",
      `${driverLabel} รับงาน ${routeLabel}`,
      {
        eventType,
        jobId,
        status: job.status || "",
        jobNo: job.jobNo || "",
      },
      "/#/today"
    );
    return {line: lineResult};
  }

  if (eventType === "ready") {
    return {line: lineResult};
  }

  if (eventType === "complete") {
    const [adminTokens, driverTokens] = await Promise.all([
      getAdminTokens(),
      getUserTokens(job.assignedToUid),
    ]);
    await Promise.all([
      sendPush(
        adminTokens,
        "งานเสร็จแล้ว",
        `${driverLabel} จบงาน ${routeLabel} | WO ${workOrderLabel}`,
        {
          eventType,
          jobId,
          status: job.status || "",
          jobNo: job.jobNo || "",
        },
        "/#/today"
      ),
      sendPush(
        driverTokens,
        "บันทึกงานสำเร็จ",
        `คุณจบงาน ${routeLabel} เรียบร้อยแล้ว`,
        {
          eventType,
          jobId,
          status: job.status || "",
          jobNo: job.jobNo || "",
        },
        "/#/driver/history"
      ),
    ]);
    return {line: lineResult};
  }

  return {line: lineResult};
};

const ensureCanNotify = async (
  uid: string,
  authToken: Record<string, unknown> | undefined,
  eventType: NotifyEventType,
  job: TodayJobEntry
): Promise<void> => {
  const role = await getUserRole(uid, authToken);
  const isAdmin = role === "admin";
  const isAssignee = job.assignedToUid === uid;

  if (eventType === "create" && !isAdmin) {
    throw new HttpsError("permission-denied", "Only admin can notify create");
  }
  if (eventType === "update" && !isAdmin) {
    throw new HttpsError("permission-denied", "Only admin can notify update");
  }

  const isStatusEvent = eventType === "accept" ||
    eventType === "ready" ||
    eventType === "complete";

  if (isStatusEvent && !isAdmin && !isAssignee) {
    throw new HttpsError(
      "permission-denied",
      "Only admin or assigned driver can notify this event"
    );
  }
};

const ensureCanSyncToJobs = async (
  uid: string,
  authToken: Record<string, unknown> | undefined,
  job: TodayJobEntry
): Promise<void> => {
  const role = await getUserRole(uid, authToken);
  const isAdmin = role === "admin";
  const isAssignee = job.assignedToUid === uid;

  if (!isAdmin && !isAssignee) {
    throw new HttpsError(
      "permission-denied",
      "Only admin or assigned driver can sync this job"
    );
  }
};

const toJobDate = (value?: string): string => {
  if (!value) return new Date().toISOString().split("T")[0];
  return value.split("T")[0];
};

const toRounds = (value?: string): number => {
  const raw = (value || "").toString();
  const match = raw.match(/(\d+(\.\d+)?)/);
  if (!match) return 1;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
};

const toRoundsFromToday = (job: TodayJobEntry): number => {
  if (typeof job.rounds === "number" && job.rounds > 0) {
    return job.rounds;
  }
  return toRounds(job.quantity);
};

const toFuelAndToll = (
  value?: number | string | null
): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.toString().trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const toImageUrls = (urls?: unknown, single?: unknown): string[] => {
  const normalized = Array.isArray(urls) ?
    urls
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean) :
    [];

  if (normalized.length > 0) return normalized;

  const singleUrl = typeof single === "string" ? single.trim() : "";
  return singleUrl ? [singleUrl] : [];
};

const buildJobPayloadFromToday = (
  todayJobId: string,
  job: TodayJobEntry,
  now: number
): Record<string, unknown> => {
  const pickupDate = asDateOnly(job.pickup?.date);
  const payload: Record<string, unknown> = {
    date: toJobDate(pickupDate),
    pickupLocation: job.pickup?.location || "",
    dropoffLocation: job.delivery?.location || "",
    rounds: toRoundsFromToday(job),
    vehicleType: job.vehicleType || "",
    driverName: job.driverName || job.assignedToName || "",
    licensePlate: job.plateNo || "",
    jobNo: job.jobNo || "",
    invNo: typeof job.invNo === "string" ? job.invNo : "",
    workOrderNo: job.workOrderNo || job.ticketNo || "",
    transportDocNo: job.transportDocNo || "",
    remarks: job.importantNote || "",
    linkedTodayJobId: todayJobId,
    employerCompany: job.employerCompany || "",
    productName: (job.productName || "Inverter").trim() || "Inverter",
    todayQuantity: job.quantity || "",
    assignedToUid: job.assignedToUid || "",
    assignedToName: job.assignedToName || job.driverName || "",
    updatedAt: now,
    timestamp: typeof job.timestamp === "number" ? job.timestamp : now,
  };

  const fuelAndToll = toFuelAndToll(job.fuelAndToll);
  if (fuelAndToll !== undefined) {
    payload.fuelAndToll = fuelAndToll;
  }

  const originImageUrls = toImageUrls(job.originImageUrls, job.originImageUrl);
  if (originImageUrls.length > 0) {
    payload.originImageUrls = originImageUrls;
    payload.originImageUrl = originImageUrls[0];
    payload.imageUrl = originImageUrls[0];
  }

  const destinationImageUrls = toImageUrls(
    job.destinationImageUrls,
    job.destinationImageUrl
  );
  if (destinationImageUrls.length > 0) {
    payload.destinationImageUrls = destinationImageUrls;
    payload.destinationImageUrl = destinationImageUrls[0];
  }

  const documentImageUrls = toImageUrls(
    job.documentImageUrls,
    job.documentImageUrl
  );
  if (documentImageUrls.length > 0) {
    payload.documentImageUrls = documentImageUrls;
    payload.documentImageUrl = documentImageUrls[0];
  }

  return payload;
};

export const dispatchTodayJobNotification = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const eventType = request.data?.eventType as NotifyEventType | undefined;
  const jobId = (request.data?.jobId || "").toString().trim();

  if (!eventType ||
      !["create", "update", "accept", "ready", "complete"]
        .includes(eventType)) {
    throw new HttpsError("invalid-argument", "Invalid eventType");
  }
  if (!jobId) {
    throw new HttpsError("invalid-argument", "jobId is required");
  }

  const jobSnapshot = await db.collection("today_jobs").doc(jobId).get();
  if (!jobSnapshot.exists) {
    throw new HttpsError("not-found", "Job not found");
  }

  const job = jobSnapshot.data() as TodayJobEntry;
  await ensureCanNotify(request.auth.uid, request.auth.token, eventType, job);
  const notificationResult = await notifyByEvent(eventType, jobId, job);

  return {
    ok: true,
    ...notificationResult,
  };
});

export const ensureUserProfile = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const uid = request.auth.uid;
  const data = request.data || {};
  const emailInput = typeof data.email === "string" ? data.email.trim() : "";
  const displayNameInput =
    typeof data.displayName === "string" ? data.displayName.trim() : "";
  const photoURLInput =
    typeof data.photoURL === "string" ? data.photoURL.trim() : "";

  const userRef = db.collection("users").doc(uid);
  const snapshot = await userRef.get();
  const existing = (snapshot.exists ? snapshot.data() : {}) || {};

  const existingRole = existing.role as UserRole | undefined;
  const role: UserRole = existingRole === "admin" ? "admin" : "user";
  const now = Date.now();

  const emailFromExisting = typeof existing.email === "string" ?
    existing.email.trim() : "";
  const displayNameFromExisting = typeof existing.displayName === "string" ?
    existing.displayName.trim() : "";
  const email =
    emailFromExisting || emailInput || `${uid}@local.user`;
  const fallbackName =
    email.includes("@") ? email.split("@")[0] : `user-${uid.slice(0, 6)}`;
  const displayName =
    displayNameFromExisting || displayNameInput || fallbackName;
  const existingPhotoURL = typeof existing.photoURL === "string" ?
    existing.photoURL.trim() : "";

  const payload: Record<string, unknown> = {
    uid,
    email,
    displayName,
    role,
    createdAt:
      typeof existing.createdAt === "number" ? existing.createdAt : now,
    profileUpdatedAt: now,
  };

  if (existingPhotoURL && !isGoogleHostedPhoto(existingPhotoURL)) {
    payload.photoURL = existingPhotoURL;
  } else if (photoURLInput) {
    payload.photoURL = photoURLInput;
  } else if (existingPhotoURL) {
    payload.photoURL = existingPhotoURL;
  }

  await userRef.set(payload, {merge: true});
  await syncUserRoleClaim(uid, role);

  return {
    ok: true,
    created: !snapshot.exists,
    role,
  };
});

export const syncTodayJobToJobs = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const todayJobId = (request.data?.todayJobId || "").toString().trim();
  if (!todayJobId) {
    throw new HttpsError("invalid-argument", "todayJobId is required");
  }

  const todaySnapshot = await db.collection("today_jobs").doc(todayJobId).get();
  if (!todaySnapshot.exists) {
    throw new HttpsError("not-found", "Today job not found");
  }

  const job = todaySnapshot.data() as TodayJobEntry;
  await ensureCanSyncToJobs(request.auth.uid, request.auth.token, job);

  const now = Date.now();
  const targetJobId = `today_${todayJobId}`;
  const payload = buildJobPayloadFromToday(todayJobId, job, now);

  await db.collection("jobs").doc(targetJobId).set(payload, {merge: true});
  await rebuildDashboardMetricsForMonth(getMonthKey(payload.date as string));

  return {
    ok: true,
    jobId: targetJobId,
  };
});

export const rebuildDashboardMetrics = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const requesterRole = await getUserRole(request.auth.uid, request.auth.token);
  if (requesterRole !== "admin") {
    throw new HttpsError("permission-denied", "Only admin can rebuild metrics");
  }

  const monthKey = (request.data?.monthKey || "").toString().trim();
  if (!monthKey) {
    throw new HttpsError("invalid-argument", "monthKey is required");
  }

  await rebuildDashboardMetricsForMonth(monthKey);
  return {
    ok: true,
    monthKey,
  };
});

export const syncDailyDieselPrice = onSchedule({
  schedule: "0 6 * * *",
  timeZone: "Asia/Bangkok",
}, async () => {
  const record = await syncLatestDieselPrice();
  logger.info("Daily diesel price synced", {
    effectiveDate: record.effectiveDate,
    priceToday: record.priceToday,
    differenceFromYesterday: record.differenceFromYesterday,
  });
});

export const notifyDieselPriceMorning = onSchedule({
  schedule: "0 7 * * *",
  timeZone: "Asia/Bangkok",
}, async () => {
  await notifyDieselPriceUpdate("morning");
});

export const notifyDieselPriceEvening = onSchedule({
  schedule: "0 17 * * *",
  timeZone: "Asia/Bangkok",
}, async () => {
  await notifyDieselPriceUpdate("evening");
});

export const setUserRole = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const requesterRole = await getUserRole(request.auth.uid, request.auth.token);
  if (requesterRole !== "admin") {
    throw new HttpsError("permission-denied", "Only admin can update roles");
  }

  const targetUid = (request.data?.uid || "").toString().trim();
  const nextRole = request.data?.role;
  if (!targetUid || !isUserRole(nextRole)) {
    throw new HttpsError("invalid-argument", "uid and valid role are required");
  }

  await db.collection("users").doc(targetUid).set({
    role: nextRole,
    profileUpdatedAt: Date.now(),
  }, {merge: true});
  await syncUserRoleClaim(targetUid, nextRole);

  return {
    ok: true,
    uid: targetUid,
    role: nextRole,
  };
});
