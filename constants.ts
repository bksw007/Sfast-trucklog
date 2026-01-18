import { AppData } from './types';

export const INITIAL_DATA: AppData = {
  jobs: [
    {
      id: '1',
      date: '2023-10-25',
      pickupLocation: 'Warehouse A',
      dropoffLocation: 'Customer Site B',
      rounds: 2,
      vehicleType: '6 Wheels',
      driverName: 'Somchai Jaidee',
      licensePlate: '70-1234',
      jobNo: 'JOB-001',
      invNo: 'INV-2023-001',
      remarks: 'Delivered on time',
      timestamp: 1698220000000
    },
    {
      id: '2',
      date: '2023-10-26',
      pickupLocation: 'Port C',
      dropoffLocation: 'Factory D',
      rounds: 1,
      vehicleType: '4 Wheels',
      driverName: 'Somsak Rakdee',
      licensePlate: '12-5678',
      jobNo: 'JOB-002',
      invNo: 'INV-2023-002',
      remarks: '',
      timestamp: 1698306400000
    }
  ],
  options: {
    locations: ['Warehouse A', 'Port C', 'Distribution Center', 'Customer Site B', 'Factory D', 'Shop E'],
    vehicleTypes: ['4 Wheels', '6 Wheels', '10 Wheels', 'Trailer'],
    drivers: ['Somchai Jaidee', 'Somsak Rakdee', 'Mana Meepool'],
    licensePlates: ['70-1234', '12-5678', '99-8888']
  }
};