import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";
import {setGlobalOptions} from "firebase-functions/v2";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

initializeApp();

setGlobalOptions({
  maxInstances: 10,
  region: "asia-southeast1",
});

type JobStatus = "pending" | "in_progress" | "completed";

type TodayJobEntry = {
  jobNo?: string;
  workOrderNo?: string;
  workDate?: string;
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
  fuelAndToll?: number | string | null;
  status?: JobStatus;
  assignedToUid?: string;
  assignedToName?: string;
  acceptedAt?: number | null;
  readyToClose?: boolean;
  completedAt?: number | null;
  revision?: number;
  updatedAt?: number;
  importantNote?: string;
  timestamp?: number;
};

type NotifyEventType = "create" | "update" | "accept" | "ready" | "complete";
type UserRole = "admin" | "user";

const db = getFirestore();
const messaging = getMessaging();

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const LINE_GROUP_ID = process.env.LINE_GROUP_ID || "";

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

const asDisplayDate = (value?: string): string => {
  if (!value) return "-";
  const dateOnly = value.split("T")[0];
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return dateOnly || "-";
  return `${match[3]}/${match[2]}/${match[1]}`;
};

const asDisplayTime = (value?: string): string => value?.trim() || "-";

const asDisplayContact = (value?: string): string => value?.trim() || "-";
const getWorkOrderNo = (job: TodayJobEntry): string =>
  job.workOrderNo || job.ticketNo || "-";
const getJobNo = (job: TodayJobEntry): string => job.jobNo || "-";

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
  const lines = [
    head,
    `🧾 เลขที่ใบสั่งงาน (Work Order): ${getWorkOrderNo(job)}`,
    `🏢 ผู้ว่าจ้าง: ${job.employerCompany || "-"}`,
    `📦 สินค้า: ${job.productName || "-"}`,
    `👷 คนขับ: ${job.assignedToName || job.driverName || "-"}`,
    `🚚 ทะเบียนรถ: ${job.plateNo || "-"}`,
    "",
    `📍 จุดรับ: ${job.pickup?.location || "-"}`,
    `🗓️ วันที่รับ: ${asDisplayDate(job.pickup?.date)}`,
    `🕒 เวลารับ: ${asDisplayTime(job.pickup?.time)}`,
    `👤 ผู้ติดต่อรับ: ${asDisplayContact(job.pickup?.contact)}`,
    "",
    `📍 จุดส่ง: ${job.delivery?.location || "-"}`,
    `🗓️ วันที่ส่ง: ${asDisplayDate(job.delivery?.date)}`,
    `🕒 เวลาส่ง: ${asDisplayTime(job.delivery?.time)}`,
    `👤 ผู้ติดต่อส่ง: ${asDisplayContact(job.delivery?.contact)}`,
    "",
    `📝 หมายเหตุ: ${job.importantNote || "-"}`,
    `📊 สถานะ: ${statusLabel}`,
  ];

  return lines.join("\n");
};

const sendLineNotification = async (
  eventType: NotifyEventType,
  jobId: string,
  job: TodayJobEntry
): Promise<void> => {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_GROUP_ID) {
    logger.info("LINE skipped (missing env)", {eventType, jobId});
    return;
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
      return;
    }

    logger.info("LINE push sent", {eventType, jobId});
  } catch (error) {
    logger.error("LINE push exception", {eventType, jobId, error});
  }
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
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
        logger.warn("Push sent with failures", {
          failureCount: response.failureCount,
          successCount: response.successCount,
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
): Promise<void> => {
  const driverLabel = job.assignedToName || job.driverName || "พนักงาน";
  const jobLabel = `${getJobNo(job)} | WO ${getWorkOrderNo(job)}`;

  await sendLineNotification(eventType, jobId, job);

  if (eventType === "create") {
    const driverTokens = await getUserTokens(job.assignedToUid);
    await sendPush(
      driverTokens,
      "มีงานใหม่มอบหมาย",
      `${jobLabel} | ${job.pickup?.location || "-"} -> ` +
        `${job.delivery?.location || "-"}`,
      {
        eventType,
        jobId,
        status: job.status || "",
        jobNo: job.jobNo || "",
      },
      "/#/driver/today"
    );
    return;
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
        `แอดมินแก้ไขงาน ${jobLabel}`,
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
        `${jobLabel} มีการอัปเดตข้อมูลล่าสุด`,
        {
          eventType,
          jobId,
          status: job.status || "",
          jobNo: job.jobNo || "",
        },
        "/#/driver/today"
      ),
    ]);
    return;
  }

  if (eventType === "accept") {
    const adminTokens = await getAdminTokens();
    await sendPush(
      adminTokens,
      "พนักงานรับงานแล้ว",
      `${driverLabel} รับงาน ${jobLabel}`,
      {
        eventType,
        jobId,
        status: job.status || "",
        jobNo: job.jobNo || "",
      },
      "/#/today"
    );
    return;
  }

  if (eventType === "ready") {
    const adminTokens = await getAdminTokens();
    await sendPush(
      adminTokens,
      "งานพร้อมจบ",
      `${driverLabel} กดพร้อมจบงาน ${jobLabel}`,
      {
        eventType,
        jobId,
        status: job.status || "",
        jobNo: job.jobNo || "",
      },
      "/#/today"
    );
    return;
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
        `${driverLabel} จบงาน ${jobLabel}`,
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
        `คุณจบงาน ${jobLabel} เรียบร้อยแล้ว`,
        {
          eventType,
          jobId,
          status: job.status || "",
          jobNo: job.jobNo || "",
        },
        "/#/driver/history"
      ),
    ]);
  }
};

const ensureCanNotify = async (
  uid: string,
  eventType: NotifyEventType,
  job: TodayJobEntry
): Promise<void> => {
  const userSnapshot = await db.collection("users").doc(uid).get();
  const role = (userSnapshot.data()?.role || "user") as string;
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
  job: TodayJobEntry
): Promise<void> => {
  const userSnapshot = await db.collection("users").doc(uid).get();
  const role = (userSnapshot.data()?.role || "user") as string;
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
  return Math.max(1, Math.round(parsed));
};

const toRoundsFromToday = (job: TodayJobEntry): number => {
  if (typeof job.rounds === "number" && job.rounds > 0) {
    return Math.round(job.rounds);
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

const buildJobPayloadFromToday = (
  todayJobId: string,
  job: TodayJobEntry,
  now: number
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    date: toJobDate(job.workDate),
    pickupLocation: job.pickup?.location || "",
    dropoffLocation: job.delivery?.location || "",
    rounds: toRoundsFromToday(job),
    vehicleType: job.vehicleType || "",
    driverName: job.driverName || job.assignedToName || "",
    licensePlate: job.plateNo || "",
    jobNo: job.jobNo || "",
    invNo: job.workOrderNo || job.ticketNo || "",
    workOrderNo: job.workOrderNo || job.ticketNo || "",
    transportDocNo: "",
    remarks: job.importantNote || "",
    originImageUrl: "",
    originImageUrls: [],
    destinationImageUrl: "",
    destinationImageUrls: [],
    documentImageUrl: "",
    documentImageUrls: [],
    linkedTodayJobId: todayJobId,
    employerCompany: job.employerCompany || "",
    productName: job.productName || "",
    todayQuantity: job.quantity || "",
    updatedAt: now,
    timestamp: typeof job.timestamp === "number" ? job.timestamp : now,
  };

  const fuelAndToll = toFuelAndToll(job.fuelAndToll);
  if (fuelAndToll !== undefined) {
    payload.fuelAndToll = fuelAndToll;
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
  await ensureCanNotify(request.auth.uid, eventType, job);
  await notifyByEvent(eventType, jobId, job);

  return {ok: true};
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

  const payload: Record<string, unknown> = {
    uid,
    email,
    displayName,
    role,
    createdAt:
      typeof existing.createdAt === "number" ? existing.createdAt : now,
    profileUpdatedAt: now,
  };

  if (photoURLInput) {
    payload.photoURL = photoURLInput;
  } else if (
    typeof existing.photoURL === "string" &&
    existing.photoURL.trim()
  ) {
    payload.photoURL = existing.photoURL.trim();
  }

  await userRef.set(payload, {merge: true});

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
  await ensureCanSyncToJobs(request.auth.uid, job);

  const now = Date.now();
  const targetJobId = `today_${todayJobId}`;
  const payload = buildJobPayloadFromToday(todayJobId, job, now);

  await db.collection("jobs").doc(targetJobId).set(payload, {merge: true});

  return {
    ok: true,
    jobId: targetJobId,
  };
});
