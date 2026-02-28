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
  ticketNo: string;
  productName: string;
  quantity: string;
  pickup: DispatchPoint;
  delivery: DispatchPoint;
  driverName: string;
  plateNo: string;
  driverPhone: string;
  importantNote: string;
  summaryText: string;
  status: 'pending' | 'in_progress' | 'completed';
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
  displayName: string;
  role: UserRole;
  createdAt: number;
  photoURL?: string;
}
