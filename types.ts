export interface JobEntry {
  id: string;
  date: string; // YYYY-MM-DD
  pickupLocation: string;
  dropoffLocation: string;
  rounds: number;
  productName: string;
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
  imageUrl?: string; // Legacy single-image field (old schema)
  customerPrice?: number; // Admin only: ราคาเก็บลูกค้า
  jointPrice?: number; // Admin only: ราคาจ่ายรถร่วม
  assignedToUid?: string;
  assignedToName?: string;
  employerCompany?: string;
  todayQuantity?: string;
  linkedTodayJobId?: string;
  timestamp: number;
}

export type AccountingEntryType = 'income' | 'expense';
export type AccountingPaymentMethod = 'cash' | 'transfer' | 'card' | 'other';
export type AccountingDocumentStatus = 'receipt' | 'replacement_receipt' | 'other_evidence';

export interface AccountingEntry {
  id: string;
  transactionDate: string; // YYYY-MM-DD
  type: AccountingEntryType;
  amount: number;
  paymentMethod: AccountingPaymentMethod;
  description: string;
  category: string;
  counterpartyName?: string;
  counterpartyTaxId?: string;
  referenceNo?: string;
  note?: string;
  documentStatus: AccountingDocumentStatus;
  reasonNoReceipt?: string;
  proofUrls?: string[];
  createdByUid?: string;
  createdByName?: string;
  updatedAt?: number;
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
  invNo?: string;
  transportDocNo?: string;
  orderDate?: string;
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
  originImageUrl?: string;
  originImageUrls?: string[];
  destinationImageUrl?: string;
  destinationImageUrls?: string[];
  documentImageUrl?: string;
  documentImageUrls?: string[];
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
  driverUpdateCount?: number;
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
    employerCompanies: string[];
    productTypes: string[];
    contacts: string[];
  };
}

export enum OptionCategory {
  LOCATION = 'locations',
  VEHICLE = 'vehicleTypes',
  DRIVER = 'drivers',
  PLATE = 'licensePlates',
  EMPLOYER_COMPANY = 'employerCompanies',
  PRODUCT_TYPE = 'productTypes',
  CONTACT = 'contacts',
}

export interface DieselPriceEntry {
  id?: string;
  fuelType: 'diesel';
  oilName: string;
  effectiveDate: string; // YYYY-MM-DD
  priceToday: number;
  priceYesterday: number;
  differenceFromYesterday: number;
  changeDirection: 'up' | 'down' | 'same';
  summaryText: string;
  sourcePriceDate?: string;
  sourcePriceTime?: string;
  sourceRemark?: string;
  sourceRemark2?: string;
  fetchedAt: number;
  updatedAt?: number;
  morningNotifiedOn?: string;
  eveningNotifiedOn?: string;
}

export type UserRole = 'admin' | 'user';
export type FontScale = 'normal' | 'large';

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
  pinnedLocations?: string[];
  fontScale?: FontScale;
  fcmTokens?: string[];
  lastPushTokenUpdatedAt?: number;
  citizenId?: string;
  businessName?: string;
  businessTaxId?: string;
  businessBranchName?: string;
  signatureName?: string;
}
