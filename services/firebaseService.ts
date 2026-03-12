// Firebase Service - Real-time data operations with Firestore and Storage
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
  getDocs,
  getDoc,
  where,
  writeBatch,
  runTransaction,
  Query,
  DocumentData,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import imageCompression from 'browser-image-compression';
import { cloudFunctions, db, storage } from '../firebase';
import { JobEntry, AppData, OptionCategory, TodayJobEntry } from '../types';

// Collection names
const JOBS_COLLECTION = 'jobs';
const OPTIONS_COLLECTION = 'options';
const TODAY_JOBS_COLLECTION = 'today_jobs';
const DASHBOARD_METRICS_COLLECTION = 'dashboard_metrics';
const NOTIFY_CALLABLE_NAME = 'dispatchTodayJobNotification';
const SYNC_TODAY_JOB_CALLABLE_NAME = 'syncTodayJobToJobs';
const REBUILD_DASHBOARD_METRICS_CALLABLE_NAME = 'rebuildDashboardMetrics';

export type TriggerTodayJobNotificationResult = {
  ok: boolean;
  line?: {
    attempted: boolean;
    ok: boolean;
    status?: number;
    reason?: string;
  };
};

export type DashboardMetricSummary = {
  month: string;
  totalJobs: number;
  totalRounds: number;
  uniqueDrivers: number;
  uniqueVehicles: number;
  jobsPerDriver: Array<{ name: string; count: number }>;
  vehicleTypeCounts: Array<{ name: string; count: number }>;
  updatedAt?: number;
};

const getMonthKeyFromDate = (dateStr?: string) => (dateStr || '').split('T')[0].slice(0, 7);

export const getLineNotificationWarningMessage = (
  result?: TriggerTodayJobNotificationResult | null
): string => {
  if (!result?.line || result.line.ok || !result.line.attempted) return '';

  if (result.line.status === 429) {
    return 'LINE ส่งไม่สำเร็จ: โควต้ารายเดือนของ LINE หมดแล้ว';
  }

  if (result.line.reason?.includes('monthly limit')) {
    return 'LINE ส่งไม่สำเร็จ: โควต้ารายเดือนของ LINE หมดแล้ว';
  }

  return result.line.status
    ? `LINE ส่งไม่สำเร็จ (HTTP ${result.line.status})`
    : 'LINE ส่งไม่สำเร็จ กรุณาตรวจสอบการตั้งค่า/โควต้า LINE';
};

export class RevisionConflictError extends Error {
  code = 'revision-conflict' as const;
  currentRevision: number;

  constructor(currentRevision: number) {
    super('ข้อมูลถูกแก้ไขจากอุปกรณ์อื่น กรุณาโหลดใหม่แล้วลองอีกครั้ง');
    this.name = 'RevisionConflictError';
    this.currentRevision = currentRevision;
  }
}

// Image compression options
const COMPRESSION_OPTIONS = {
  maxSizeMB: 1, // Max file size in MB
  maxWidthOrHeight: 1920, // Max width/height
  useWebWorker: true,
  fileType: 'image/jpeg' as const,
};

/**
 * Compress image before upload
 */
const compressImage = async (file: File): Promise<File> => {
  console.log(`[Firebase] Original image size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
  
  try {
    const compressedFile = await imageCompression(file, COMPRESSION_OPTIONS);
    console.log(`[Firebase] Compressed image size: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);
    return compressedFile;
  } catch (error) {
    console.error('[Firebase] Image compression failed:', error);
    return file; // Return original if compression fails
  }
};

/**
 * Upload image to Firebase Storage
 */
export const uploadImage = async (file: File, jobId: string): Promise<string> => {
  // Compress image first
  const compressedFile = await compressImage(file);
  
  // Create storage reference
  const timestamp = Date.now();
  const fileName = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
  const storageRef = ref(storage, `jobs/${jobId}/${fileName}`);
  
  // Upload file
  console.log(`[Firebase] Uploading image to: jobs/${jobId}/${fileName}`);
  const snapshot = await uploadBytes(storageRef, compressedFile);
  
  // Get download URL
  const downloadURL = await getDownloadURL(snapshot.ref);
  console.log('[Firebase] Image uploaded successfully:', downloadURL);
  
  return downloadURL;
};

/**
 * Upload multiple images to Firebase Storage
 */
export const uploadImages = async (files: File[], jobId: string): Promise<string[]> => {
  const uploadPromises = files.map(async (file, index) => {
    // Compress image first
    const compressedFile = await compressImage(file);
    
    // Create storage reference
    const timestamp = Date.now();
    const fileName = `${timestamp}_${index}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const storageRef = ref(storage, `jobs/${jobId}/${fileName}`);
    
    // Upload file
    console.log(`[Firebase] Uploading image to: jobs/${jobId}/${fileName}`);
    const snapshot = await uploadBytes(storageRef, compressedFile);
    
    // Get download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  });
  
  const urls = await Promise.all(uploadPromises);
  console.log(`[Firebase] ${urls.length} images uploaded successfully`);
  
  return urls;
};

/**
 * Delete image from Firebase Storage
 */
export const deleteImage = async (imageUrl: string): Promise<void> => {
  try {
    // Extract path from URL
    const storageRef = ref(storage, imageUrl);
    await deleteObject(storageRef);
    console.log('[Firebase] Image deleted successfully');
  } catch (error) {
    console.error('[Firebase] Failed to delete image:', error);
  }
};

/**
 * Subscribe to jobs collection (real-time updates)
 */
export const subscribeToJobs = (
  callback: (jobs: JobEntry[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  const jobsQuery = query(
    collection(db, JOBS_COLLECTION),
    orderBy('timestamp', 'desc')
  );

  const unsubscribe = onSnapshot(
    jobsQuery,
    (snapshot) => {
      const jobs: JobEntry[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as JobEntry[];
      
      console.log(`[Firebase] Received ${jobs.length} jobs`);
      callback(jobs);
    },
    (error) => {
      console.error('[Firebase] Jobs subscription error:', error);
      onError?.(error);
    }
  );

  return unsubscribe;
};

export const subscribeToJobsByMonth = (
  year: number,
  month: number,
  callback: (jobs: JobEntry[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  const safeMonth = Math.min(Math.max(month, 1), 12);
  const startDate = `${year}-${String(safeMonth).padStart(2, '0')}-01`;
  const nextYear = safeMonth === 12 ? year + 1 : year;
  const nextMonth = safeMonth === 12 ? 1 : safeMonth + 1;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  const jobsQuery = query(
    collection(db, JOBS_COLLECTION),
    where('date', '>=', startDate),
    where('date', '<', endDate),
    orderBy('date', 'desc')
  );

  const unsubscribe = onSnapshot(
    jobsQuery,
    (snapshot) => {
      const jobs: JobEntry[] = snapshot.docs.map((jobDoc) => ({
        id: jobDoc.id,
        ...jobDoc.data(),
      })) as JobEntry[];

      jobs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      callback(jobs);
    },
    (error) => {
      console.error('[Firebase] Jobs by month subscription error:', error);
      onError?.(error);
    }
  );

  return unsubscribe;
};

export const subscribeToDashboardMetricsByMonth = (
  monthKey: string,
  callback: (summary: DashboardMetricSummary | null) => void,
  onError?: (error: Error) => void
): (() => void) => {
  const metricRef = doc(db, DASHBOARD_METRICS_COLLECTION, monthKey);
  const unsubscribe = onSnapshot(
    metricRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }

      callback(snapshot.data() as DashboardMetricSummary);
    },
    (error) => {
      console.error('[Firebase] Dashboard metrics subscription error:', error);
      onError?.(error);
    }
  );

  return unsubscribe;
};

/**
 * Subscribe to jobs by exact driver full name (driver app view)
 */
export const subscribeToJobsByDriverName = (
  driverName: string,
  callback: (jobs: JobEntry[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  return subscribeToDriverJobs(undefined, [driverName], callback, onError);
};

export const subscribeToJobsByDriverNames = (
  driverNames: string[],
  callback: (jobs: JobEntry[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  return subscribeToDriverJobs(undefined, driverNames, callback, onError);
};

export const subscribeToDriverJobs = (
  assignedToUid: string | undefined,
  driverNames: string[],
  callback: (jobs: JobEntry[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  const normalizedNames = Array.from(
    new Set(
      driverNames
        .map((name) => name.trim())
        .filter(Boolean)
    )
  );

  if (!assignedToUid && normalizedNames.length === 0) {
    callback([]);
    return () => {};
  }

  const latestQueryRows = new Map<string, JobEntry[]>();
  const queryEntries: Array<{ key: string; queryRef: Query<DocumentData> }> = [];

  if (assignedToUid) {
    queryEntries.push({
      key: `uid:${assignedToUid}`,
      queryRef: query(
        collection(db, JOBS_COLLECTION),
        where('assignedToUid', '==', assignedToUid)
      ),
    });
  }

  for (let index = 0; index < normalizedNames.length; index += 10) {
    const chunk = normalizedNames.slice(index, index + 10);
    queryEntries.push({
      key: `names:${index}`,
      queryRef: query(
        collection(db, JOBS_COLLECTION),
        where('driverName', 'in', chunk)
      ),
    });
  }

  const emitMergedJobs = () => {
    const merged = new Map<string, JobEntry>();
    latestQueryRows.forEach((rows) => {
      rows.forEach((job) => {
        merged.set(job.id, job);
      });
    });

    const jobs = Array.from(merged.values());
    jobs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    callback(jobs);
  };

  const unsubscribes = queryEntries.map(({ key, queryRef }) => {
    return onSnapshot(
      queryRef,
      (snapshot) => {
        const jobs: JobEntry[] = snapshot.docs.map((jobDoc) => ({
          id: jobDoc.id,
          ...jobDoc.data(),
        })) as JobEntry[];

        latestQueryRows.set(key, jobs);
        emitMergedJobs();
      },
      (error) => {
        console.error('[Firebase] Driver jobs subscription error:', error);
        onError?.(error);
      }
    );
  });

  return () => {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  };
};

/**
 * Subscribe to options collection (real-time updates)
 */
export const subscribeToOptions = (
  callback: (options: AppData['options']) => void,
  onError?: (error: Error) => void
): (() => void) => {
  const unsubscribe = onSnapshot(
    collection(db, OPTIONS_COLLECTION),
    (snapshot) => {
      const options: AppData['options'] = {
        locations: [],
        vehicleTypes: [],
        drivers: [],
        licensePlates: [],
        employerCompanies: [],
        productTypes: [],
        contacts: [],
      };

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const category = data.category as OptionCategory;
        const value = data.value as string;
        
        if (category && value && options[category]) {
          options[category].push(value);
        }
      });

      console.log('[Firebase] Received options:', options);
      callback(options);
    },
    (error) => {
      console.error('[Firebase] Options subscription error:', error);
      onError?.(error);
    }
  );

  return unsubscribe;
};

/**
 * Add a new job
 */
export const addJob = async (
  job: Omit<JobEntry, 'id' | 'timestamp'>,
  originImageFiles: File[] = [],
  destinationImageFiles: File[] = [],
  documentImageFiles: File[] = []
): Promise<JobEntry> => {
  const timestamp = Date.now();
  
  // Create job document first to get ID
  const jobData = {
    ...job,
    timestamp,
    originImageUrl: '', // Legacy
    originImageUrls: [],
    destinationImageUrl: '', // Legacy
    destinationImageUrls: [],
    documentImageUrl: '', // Legacy
    documentImageUrls: [],
  };

  const docRef = await addDoc(collection(db, JOBS_COLLECTION), jobData);
  console.log('[Firebase] Job created with ID:', docRef.id);

  // Upload images if provided
  let originImageUrls: string[] = [];
  let destinationImageUrls: string[] = [];
  let documentImageUrls: string[] = [];
  
  if (originImageFiles.length > 0) {
    originImageUrls = await uploadImages(originImageFiles, docRef.id);
    console.log('[Firebase] Origin images uploaded');
  }
  
  if (destinationImageFiles.length > 0) {
    destinationImageUrls = await uploadImages(destinationImageFiles, docRef.id);
    console.log('[Firebase] Destination images uploaded');
  }

  if (documentImageFiles.length > 0) {
    documentImageUrls = await uploadImages(documentImageFiles, docRef.id);
    console.log('[Firebase] Document images uploaded');
  }
  
  // Update document with image URLs
  // Set first image as legacy url for backward compatibility
  const updates: any = {
    originImageUrls,
    destinationImageUrls,
    documentImageUrls,
    originImageUrl: originImageUrls[0] || '',
    destinationImageUrl: destinationImageUrls[0] || '',
    documentImageUrl: documentImageUrls[0] || ''
  };

  await updateDoc(docRef, updates);

  const monthKey = getMonthKeyFromDate(job.date);
  if (monthKey) {
    await rebuildDashboardMetricsMonth(monthKey);
  }

  return {
    ...job,
    id: docRef.id,
    timestamp,
    ...updates
  };
};

/**
 * Add a dispatch document for "today jobs" page.
 */
export const addTodayJob = async (
  job: Omit<TodayJobEntry, 'id' | 'timestamp'>
): Promise<TodayJobEntry> => {
  const timestamp = Date.now();
  const docRef = await addDoc(collection(db, TODAY_JOBS_COLLECTION), {
    ...job,
    revision: 1,
    updatedAt: timestamp,
    timestamp,
  });

  console.log('[Firebase] Today job created with ID:', docRef.id);

  return {
    ...job,
    id: docRef.id,
    timestamp,
  };
};

/**
 * Subscribe to today_jobs collection (real-time updates)
 */
export const subscribeToTodayJobs = (
  callback: (jobs: TodayJobEntry[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  const jobsQuery = query(
    collection(db, TODAY_JOBS_COLLECTION),
    orderBy('timestamp', 'desc')
  );

  const unsubscribe = onSnapshot(
    jobsQuery,
    (snapshot) => {
      const jobs: TodayJobEntry[] = snapshot.docs.map((jobDoc) => ({
        id: jobDoc.id,
        ...jobDoc.data(),
      })) as TodayJobEntry[];

      callback(jobs);
    },
    (error) => {
      console.error('[Firebase] Today jobs subscription error:', error);
      onError?.(error);
    }
  );

  return unsubscribe;
};

export const subscribeToTodayJobsByPickupDateRange = (
  startDate: string,
  endDateExclusive: string,
  callback: (jobs: TodayJobEntry[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  const jobsQuery = query(
    collection(db, TODAY_JOBS_COLLECTION),
    where('pickup.date', '>=', startDate),
    where('pickup.date', '<', endDateExclusive),
    orderBy('pickup.date', 'desc')
  );

  const unsubscribe = onSnapshot(
    jobsQuery,
    (snapshot) => {
      const jobs: TodayJobEntry[] = snapshot.docs.map((jobDoc) => ({
        id: jobDoc.id,
        ...jobDoc.data(),
      })) as TodayJobEntry[];

      jobs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      callback(jobs);
    },
    (error) => {
      console.error('[Firebase] Today jobs by pickup date range subscription error:', error);
      onError?.(error);
    }
  );

  return unsubscribe;
};

/**
 * Subscribe to today_jobs by assigned user (driver view)
 */
export const subscribeToTodayJobsByAssignee = (
  assignedToUid: string,
  callback: (jobs: TodayJobEntry[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  const jobsQuery = query(
    collection(db, TODAY_JOBS_COLLECTION),
    where('assignedToUid', '==', assignedToUid)
  );

  const unsubscribe = onSnapshot(
    jobsQuery,
    (snapshot) => {
      const jobs: TodayJobEntry[] = snapshot.docs.map((jobDoc) => ({
        id: jobDoc.id,
        ...jobDoc.data(),
      })) as TodayJobEntry[];

      jobs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      callback(jobs);
    },
    (error) => {
      console.error('[Firebase] Today jobs by assignee subscription error:', error);
      onError?.(error);
    }
  );

  return unsubscribe;
};

export const subscribeToTodayJobsByAssigneeAndPickupDateRange = (
  assignedToUid: string,
  startDate: string,
  endDateExclusive: string,
  callback: (jobs: TodayJobEntry[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  const jobsQuery = query(
    collection(db, TODAY_JOBS_COLLECTION),
    where('assignedToUid', '==', assignedToUid),
    where('pickup.date', '>=', startDate),
    where('pickup.date', '<', endDateExclusive),
    orderBy('pickup.date', 'desc')
  );

  const unsubscribe = onSnapshot(
    jobsQuery,
    (snapshot) => {
      const jobs: TodayJobEntry[] = snapshot.docs.map((jobDoc) => ({
        id: jobDoc.id,
        ...jobDoc.data(),
      })) as TodayJobEntry[];

      jobs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      callback(jobs);
    },
    (error) => {
      console.error('[Firebase] Today jobs by assignee + pickup date range subscription error:', error);
      onError?.(error);
    }
  );

  return unsubscribe;
};

/**
 * Update selected fields in today_jobs document
 */
export const updateTodayJob = async (
  id: string,
  updates: Partial<Omit<TodayJobEntry, 'id' | 'timestamp'>>,
  expectedRevision?: number
): Promise<{ revision: number }> => {
  const jobRef = doc(db, TODAY_JOBS_COLLECTION, id);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) {
      throw new Error('today job not found');
    }

    const currentData = snapshot.data() as Partial<TodayJobEntry>;
    const currentRevision = Number.isFinite(Number(currentData.revision))
      ? Number(currentData.revision)
      : 0;

    if (Number.isFinite(expectedRevision) && currentRevision !== expectedRevision) {
      throw new RevisionConflictError(currentRevision);
    }

    const nextRevision = currentRevision + 1;
    transaction.update(jobRef, {
      ...updates,
      updatedAt: Date.now(),
      revision: nextRevision,
    });

    return { revision: nextRevision };
  });
};

/**
 * Delete a document in today_jobs collection
 */
export const deleteTodayJob = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, TODAY_JOBS_COLLECTION, id));
};

export const getTodayJobById = async (id: string): Promise<TodayJobEntry | null> => {
  const snapshot = await getDoc(doc(db, TODAY_JOBS_COLLECTION, id));
  if (!snapshot.exists()) return null;
  return {
    id: snapshot.id,
    ...snapshot.data(),
  } as TodayJobEntry;
};

export const triggerTodayJobNotification = async (
  eventType: 'create' | 'update' | 'accept' | 'ready' | 'complete',
  jobId: string
): Promise<TriggerTodayJobNotificationResult> => {
  const callable = httpsCallable(cloudFunctions, NOTIFY_CALLABLE_NAME);
  const result = await callable<{
    eventType: 'create' | 'update' | 'accept' | 'ready' | 'complete';
    jobId: string;
  }, TriggerTodayJobNotificationResult>({
    eventType,
    jobId,
  });
  return result.data;
};

export const syncTodayJobToJobs = async (todayJobId: string): Promise<void> => {
  const callable = httpsCallable(cloudFunctions, SYNC_TODAY_JOB_CALLABLE_NAME);
  await callable({
    todayJobId,
  });
};

export const rebuildDashboardMetricsMonth = async (monthKey: string): Promise<void> => {
  const callable = httpsCallable(cloudFunctions, REBUILD_DASHBOARD_METRICS_CALLABLE_NAME);
  await callable({ monthKey });
};

/**
 * Update an existing job
 */
export const updateJob = async (
  job: JobEntry,
  newOriginImageFiles?: File[],
  newDestinationImageFiles?: File[],
  newDocumentImageFiles?: File[]
): Promise<JobEntry> => {
  const jobRef = doc(db, JOBS_COLLECTION, job.id);

  const legacyImageUrl = typeof job.imageUrl === 'string' ? job.imageUrl.trim() : '';
  const fallbackOriginUrls = legacyImageUrl ? [legacyImageUrl] : [];
  let originImageUrls =
    (Array.isArray(job.originImageUrls) && job.originImageUrls.length > 0 ? job.originImageUrls : null) ||
    (job.originImageUrl ? [job.originImageUrl] : null) ||
    fallbackOriginUrls;
  let destinationImageUrls = job.destinationImageUrls || (job.destinationImageUrl ? [job.destinationImageUrl] : []);
  let documentImageUrls = job.documentImageUrls || (job.documentImageUrl ? [job.documentImageUrl] : []);
  
  // Handle origin image update
  if (newOriginImageFiles && newOriginImageFiles.length > 0) {
    // Append new images instead of replacing old images.
    const uploadedOriginUrls = await uploadImages(newOriginImageFiles, job.id);
    originImageUrls = Array.from(new Set([...originImageUrls, ...uploadedOriginUrls]));
    console.log('[Firebase] Origin images updated');
  }
  
  // Handle destination image update
  if (newDestinationImageFiles && newDestinationImageFiles.length > 0) {
    // Append new images instead of replacing old images.
    const uploadedDestinationUrls = await uploadImages(newDestinationImageFiles, job.id);
    destinationImageUrls = Array.from(new Set([...destinationImageUrls, ...uploadedDestinationUrls]));
    console.log('[Firebase] Destination images updated');
  }

  // Handle document image update
  if (newDocumentImageFiles && newDocumentImageFiles.length > 0) {
    // Append new images instead of replacing old images.
    const uploadedDocumentUrls = await uploadImages(newDocumentImageFiles, job.id);
    documentImageUrls = Array.from(new Set([...documentImageUrls, ...uploadedDocumentUrls]));
    console.log('[Firebase] Document images updated');
  }

  const updateData = {
    date: job.date,
    pickupLocation: job.pickupLocation,
    dropoffLocation: job.dropoffLocation,
    rounds: job.rounds,
    productName: job.productName,
    vehicleType: job.vehicleType,
    driverName: job.driverName,
    licensePlate: job.licensePlate,
    jobNo: job.jobNo,
    invNo: job.invNo,
    workOrderNo: job.workOrderNo,
    transportDocNo: job.transportDocNo,
    fuelAndToll: job.fuelAndToll,
    remarks: job.remarks,
    originImageUrls,
    destinationImageUrls,
    documentImageUrls,
    // Legacy support
    originImageUrl: originImageUrls[0] || '',
    destinationImageUrl: destinationImageUrls[0] || '',
    documentImageUrl: documentImageUrls[0] || '',
    imageUrl: originImageUrls[0] || '',
    customerPrice: job.customerPrice,
    jointPrice: job.jointPrice,
  };

  const sanitizedUpdateData = Object.fromEntries(
    Object.entries(updateData).filter(([, value]) => value !== undefined)
  ) as Partial<JobEntry>;

  await updateDoc(jobRef, sanitizedUpdateData);
  console.log('[Firebase] Job updated:', job.id);

  const monthKey = getMonthKeyFromDate(job.date);
  if (monthKey) {
    await rebuildDashboardMetricsMonth(monthKey);
  }

  return { ...job, ...sanitizedUpdateData };
};

/**
 * Delete a job
 */
export const deleteJob = async (job: JobEntry): Promise<void> => {
  // Delete origin images
  const legacyImageUrl = typeof job.imageUrl === 'string' ? job.imageUrl.trim() : '';
  const originUrls =
    (job.originImageUrls && job.originImageUrls.length > 0 ? job.originImageUrls : null) ||
    (job.originImageUrl ? [job.originImageUrl] : null) ||
    (legacyImageUrl ? [legacyImageUrl] : []);
  if (originUrls.length > 0) {
     await Promise.all(originUrls.map(url => deleteImage(url)));
  }
  
  // Delete destination images
  const destinationUrls = job.destinationImageUrls || (job.destinationImageUrl ? [job.destinationImageUrl] : []);
  if (destinationUrls.length > 0) {
     await Promise.all(destinationUrls.map(url => deleteImage(url)));
  }

  // Delete document images
  const documentUrls = job.documentImageUrls || (job.documentImageUrl ? [job.documentImageUrl] : []);
  if (documentUrls.length > 0) {
     await Promise.all(documentUrls.map(url => deleteImage(url)));
  }

  // Delete job document
  await deleteDoc(doc(db, JOBS_COLLECTION, job.id));
  console.log('[Firebase] Job deleted:', job.id);

  const monthKey = getMonthKeyFromDate(job.date);
  if (monthKey) {
    await rebuildDashboardMetricsMonth(monthKey);
  }
};

/**
 * Add a new option
 */
export const addOption = async (
  category: OptionCategory,
  value: string
): Promise<void> => {
  // Check if option already exists
  const optionsSnapshot = await getDocs(collection(db, OPTIONS_COLLECTION));
  const exists = optionsSnapshot.docs.some(
    (doc) => doc.data().category === category && doc.data().value === value
  );

  if (exists) {
    console.log('[Firebase] Option already exists:', category, value);
    return;
  }

  await addDoc(collection(db, OPTIONS_COLLECTION), {
    category,
    value,
  });
  console.log('[Firebase] Option added:', category, value);
};

/**
 * Rename an option and propagate the new value to existing jobs.
 */
export const renameOptionAndSyncJobs = async (
  category: OptionCategory,
  oldValue: string,
  newValue: string
): Promise<void> => {
  const trimmedOld = oldValue.trim();
  const trimmedNew = newValue.trim();

  if (!trimmedOld || !trimmedNew || trimmedOld === trimmedNew) {
    return;
  }

  const optionsRef = collection(db, OPTIONS_COLLECTION);
  const oldOptionQuery = query(
    optionsRef,
    where('category', '==', category),
    where('value', '==', trimmedOld)
  );
  const newOptionQuery = query(
    optionsRef,
    where('category', '==', category),
    where('value', '==', trimmedNew)
  );

  const [oldOptionSnapshot, newOptionSnapshot] = await Promise.all([
    getDocs(oldOptionQuery),
    getDocs(newOptionQuery),
  ]);

  if (oldOptionSnapshot.empty) {
    throw new Error('ไม่พบข้อมูลเดิมที่ต้องการแก้ไข');
  }

  if (!newOptionSnapshot.empty) {
    throw new Error('มีข้อมูลชื่อนี้อยู่แล้ว');
  }

  const jobsRef = collection(db, JOBS_COLLECTION);
  const jobsToUpdate = new Map<string, Partial<JobEntry>>();

  const collectJobsForField = async (field: keyof JobEntry) => {
    const fieldQuery = query(jobsRef, where(field as string, '==', trimmedOld));
    const snapshot = await getDocs(fieldQuery);
    snapshot.docs.forEach((jobDoc) => {
      const current = jobsToUpdate.get(jobDoc.id) ?? {};
      jobsToUpdate.set(jobDoc.id, { ...current, [field]: trimmedNew });
    });
  };

  switch (category) {
    case OptionCategory.LOCATION:
      await Promise.all([
        collectJobsForField('pickupLocation'),
        collectJobsForField('dropoffLocation'),
      ]);
      break;
    case OptionCategory.VEHICLE:
      await collectJobsForField('vehicleType');
      break;
    case OptionCategory.DRIVER:
      await collectJobsForField('driverName');
      break;
    case OptionCategory.PLATE:
      await collectJobsForField('licensePlate');
      break;
    case OptionCategory.PRODUCT_TYPE:
      await collectJobsForField('productName');
      break;
    default:
      break;
  }

  const optionDoc = oldOptionSnapshot.docs[0];
  const optionRef = doc(db, OPTIONS_COLLECTION, optionDoc.id);

  const allUpdates: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [
    { ref: optionRef, data: { value: trimmedNew } },
  ];

  jobsToUpdate.forEach((data, jobId) => {
    allUpdates.push({
      ref: doc(db, JOBS_COLLECTION, jobId),
      data: data as Record<string, unknown>,
    });
  });

  for (let i = 0; i < allUpdates.length; i += 500) {
    const batch = writeBatch(db);
    const chunk = allUpdates.slice(i, i + 500);
    chunk.forEach(({ ref, data }) => {
      batch.update(ref, data);
    });
    await batch.commit();
  }

  console.log(
    `[Firebase] Option renamed: ${category} "${trimmedOld}" -> "${trimmedNew}" (updated ${jobsToUpdate.size} jobs)`
  );
};

/**
 * Initialize default options (run once if options collection is empty)
 */
const DEFAULT_OPTIONS = [
  { category: 'locations', value: 'คลังสินค้า A' },
  { category: 'locations', value: 'ท่าเรือ B' },
  { category: 'locations', value: 'โรงงาน C' },
  { category: 'locations', value: 'ลูกค้า A' },
  { category: 'locations', value: 'ศูนย์กระจายสินค้า' },
  { category: 'vehicleTypes', value: '4 ล้อ' },
  { category: 'vehicleTypes', value: '6 ล้อ' },
  { category: 'vehicleTypes', value: '10 ล้อ' },
  { category: 'vehicleTypes', value: 'หัวลาก' },
  { category: 'drivers', value: 'พนักงานขับรถ 1' },
  { category: 'drivers', value: 'พนักงานขับรถ 2' },
  { category: 'drivers', value: 'พนักงานขับรถ 3' },
  { category: 'licensePlates', value: '70-1234' },
  { category: 'licensePlates', value: '12-5678' },
  { category: 'licensePlates', value: '99-8888' },
  { category: 'employerCompanies', value: 'MLT' },
  { category: 'employerCompanies', value: 'S Fast Transport' },
  { category: 'productTypes', value: 'Inverter' },
  { category: 'productTypes', value: 'พาเลท' },
  { category: 'contacts', value: 'คุณเอ' },
  { category: 'contacts', value: 'คุณบี' },
];

export const initializeDefaultOptions = async (skipExistingCheck = false): Promise<void> => {
  if (!skipExistingCheck) {
    const optionsSnapshot = await getDocs(collection(db, OPTIONS_COLLECTION));
    if (!optionsSnapshot.empty) {
      return;
    }
  }

  console.log('[Firebase] Initializing default options...');

  for (const option of DEFAULT_OPTIONS) {
    await addDoc(collection(db, OPTIONS_COLLECTION), option);
  }

  console.log('[Firebase] Default options initialized');
};

// Export service object for compatibility
export const firebaseService = {
  subscribeToJobs,
  subscribeToJobsByDriverName,
  subscribeToJobsByDriverNames,
  subscribeToDriverJobs,
  subscribeToOptions,
  subscribeToTodayJobs,
  subscribeToTodayJobsByAssignee,
  triggerTodayJobNotification,
  syncTodayJobToJobs,
  getTodayJobById,
  addJob,
  addTodayJob,
  updateTodayJob,
  deleteTodayJob,
  updateJob,
  deleteJob,
  addOption,
  renameOptionAndSyncJobs,
  uploadImage,
  uploadImages, // New
  deleteImage,
  initializeDefaultOptions,
};

export default firebaseService;
