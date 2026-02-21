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
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { db, storage } from '../firebase';
import { JobEntry, AppData, OptionCategory } from '../types';

// Collection names
const JOBS_COLLECTION = 'jobs';
const OPTIONS_COLLECTION = 'options';

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

  return {
    ...job,
    id: docRef.id,
    timestamp,
    ...updates
  };
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
  
  let originImageUrls = job.originImageUrls || (job.originImageUrl ? [job.originImageUrl] : []);
  let destinationImageUrls = job.destinationImageUrls || (job.destinationImageUrl ? [job.destinationImageUrl] : []);
  let documentImageUrls = job.documentImageUrls || (job.documentImageUrl ? [job.documentImageUrl] : []);
  
  // Handle origin image update
  if (newOriginImageFiles && newOriginImageFiles.length > 0) {
    // Delete old origin images if exists
    if (originImageUrls.length > 0) {
      await Promise.all(originImageUrls.map(url => deleteImage(url)));
    }
    // Upload new origin images
    originImageUrls = await uploadImages(newOriginImageFiles, job.id);
    console.log('[Firebase] Origin images updated');
  }
  
  // Handle destination image update
  if (newDestinationImageFiles && newDestinationImageFiles.length > 0) {
    // Delete old destination images if exists
    if (destinationImageUrls.length > 0) {
       await Promise.all(destinationImageUrls.map(url => deleteImage(url)));
    }
    // Upload new destination images
    destinationImageUrls = await uploadImages(newDestinationImageFiles, job.id);
    console.log('[Firebase] Destination images updated');
  }

  // Handle document image update
  if (newDocumentImageFiles && newDocumentImageFiles.length > 0) {
    // Delete old document images if exists
    if (documentImageUrls.length > 0) {
       await Promise.all(documentImageUrls.map(url => deleteImage(url)));
    }
    // Upload new document images
    documentImageUrls = await uploadImages(newDocumentImageFiles, job.id);
    console.log('[Firebase] Document images updated');
  }

  const updateData = {
    date: job.date,
    pickupLocation: job.pickupLocation,
    dropoffLocation: job.dropoffLocation,
    rounds: job.rounds,
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
    customerPrice: job.customerPrice,
    jointPrice: job.jointPrice,
  };

  await updateDoc(jobRef, updateData);
  console.log('[Firebase] Job updated:', job.id);

  return { ...job, ...updateData };
};

/**
 * Delete a job
 */
export const deleteJob = async (job: JobEntry): Promise<void> => {
  // Delete origin images
  const originUrls = job.originImageUrls || (job.originImageUrl ? [job.originImageUrl] : []);
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
 * Initialize default options (run once if options collection is empty)
 */
export const initializeDefaultOptions = async (): Promise<void> => {
  const optionsSnapshot = await getDocs(collection(db, OPTIONS_COLLECTION));
  
  if (optionsSnapshot.empty) {
    console.log('[Firebase] Initializing default options...');
    
    const defaultOptions = [
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
    ];

    for (const option of defaultOptions) {
      await addDoc(collection(db, OPTIONS_COLLECTION), option);
    }
    
    console.log('[Firebase] Default options initialized');
  }
};

// Export service object for compatibility
export const firebaseService = {
  subscribeToJobs,
  subscribeToOptions,
  addJob,
  updateJob,
  deleteJob,
  addOption,
  uploadImage,
  uploadImages, // New
  deleteImage,
  initializeDefaultOptions,
};

export default firebaseService;
