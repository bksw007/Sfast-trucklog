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
  remarks: string;
  originImageUrl?: string; // รูปภาพต้นทาง - Origin image URL from Firebase Storage
  destinationImageUrl?: string; // รูปภาพปลายทาง - Destination image URL from Firebase Storage
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