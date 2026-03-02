export interface JobEntry {
  id: string;
  date: string; // YYYY-MM-DD
  pickupLocation: string;
  dropoffLocation: string;
  rounds: number;
  vehicleType: string;
  driverName: string;
  licensePlate: string;
  jobNo: string;
  invNo: string;
  workOrderNo?: string; // เลขที่ใบสั่งงาน
  transportDocNo?: string; // เลขที่ใบขนส่งสินค้าฯ
  fuelAndToll?: number; // ค่าน้ำมันและทางด่วน
  remarks: string;
  originImageUrl?: string;
  originImageUrls?: string[]; // New: Multiple images
  destinationImageUrl?: string;
  destinationImageUrls?: string[]; // New: Multiple images
  documentImageUrl?: string; // รูปภาพเอกสาร
  documentImageUrls?: string[]; // New: Multiple images
  customerPrice?: number; // Admin only: ราคาเก็บลูกค้า
  jointPrice?: number; // Admin only: ราคาจ่ายรถร่วม
  timestamp: number;
}

export interface DispatchPoint {
  location: string;
  date: string;
  time: string;
  contact: string;
}

export interface TodayJobEntry {
  id: string;
  employerCompany: string;
  jobNo: string;
  workDate: string;
  vehicleType: string;
  ticketNo?: string; // legacy field (used as Work Order in old records)
  workOrderNo?: string;
  productName: string;
  quantity: string;
  rounds?: number;
  pickup: DispatchPoint;
  delivery: DispatchPoint;
  driverName: string;
  plateNo: string;
  driverPhone: string;
  fuelAndToll?: number | null;
  importantNote: string;
  summaryText: string;
  status: 'pending' | 'in_progress' | 'completed';
  assignedToUid?: string;
  assignedToName?: string;
  readyToClose?: boolean;
  readyToCloseAt?: number | null;
  acceptedAt?: number | null;
  acceptedByUid?: string;
  completedByUid?: string;
  lastSavedAt?: number | null;
  revision?: number;
  updatedAt?: number;
  updatedByUid?: string;
  completedAt?: number | null;
  autoNotifyLine?: boolean;
  autoNotifyTelegram?: boolean;
  createdByUid?: string;
  createdByName?: string;
  timestamp: number;
}

export interface AppData {
  jobs: JobEntry[];
  options: {
    locations: string[]; // Combined pickup/dropoff locations
    vehicleTypes: string[];
    drivers: string[];
    licensePlates: string[];
  };
}

export enum OptionCategory {
  LOCATION = 'locations',
  VEHICLE = 'vehicleTypes',
  DRIVER = 'drivers',
  PLATE = 'licensePlates'
}

export type UserRole = 'admin' | 'user';

export interface UserProfile {
  uid: string;
  email: string;
  fullName?: string;
  displayName: string;
  role: UserRole;
  createdAt: number;
  employeeCode?: string;
  nickname?: string;
  phoneNumber?: string;
  lineUserId?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  address?: string;
  personalNote?: string;
  profileUpdatedAt?: number;
  photoURL?: string;
  fcmTokens?: string[];
  lastPushTokenUpdatedAt?: number;
}
