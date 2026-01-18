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
  timestamp: number;
}

export interface AppData {
  jobs: JobEntry[];
  options: {
    pickupLocations: string[];
    dropoffLocations: string[];
    vehicleTypes: string[];
    drivers: string[];
    licensePlates: string[];
  };
}

export enum OptionCategory {
  PICKUP = 'pickupLocations',
  DROPOFF = 'dropoffLocations',
  VEHICLE = 'vehicleTypes',
  DRIVER = 'drivers',
  PLATE = 'licensePlates'
}