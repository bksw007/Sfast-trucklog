import { AppData, JobEntry, OptionCategory } from '../types';
import { INITIAL_DATA } from '../constants';

const STORAGE_KEY = 'sfast_trucklog_data_v1';

// Get the Google Apps Script URL from environment variables
const SCRIPT_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL || '';

// Helper to get data from local storage
const getStoredData = (): AppData => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return INITIAL_DATA;
  }
  return JSON.parse(stored);
};

// Helper to save data to local storage
const setStoredData = (data: AppData) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

// Helper for API calls with error handling
const apiCall = async (method: 'GET' | 'POST', body?: object): Promise<any> => {
  if (!SCRIPT_URL) {
    console.warn('Google Apps Script URL not configured. Using local storage only.');
    return null;
  }

  try {
    let url = SCRIPT_URL;
    const options: RequestInit = {
      method,
      redirect: 'follow',
    };

    if (method === 'POST' && body) {
      // For POST requests to GAS, we need to use a different approach
      // GAS doesn't handle CORS well with POST, so we'll use GET with query params for some actions
      // Or use form submission method
      options.headers = {
        'Content-Type': 'text/plain',
      };
      options.body = JSON.stringify(body);
    }

    console.log(`[DataService] ${method} request to GAS:`, body ? JSON.stringify(body) : 'no body');
    
    const response = await fetch(url, options);
    
    console.log(`[DataService] Response status: ${response.status}`);
    
    // Handle text response (GAS sometimes returns text)
    const text = await response.text();
    console.log(`[DataService] Response text (first 200 chars):`, text.substring(0, 200));
    
    try {
      const result = JSON.parse(text);
      
      if (result.error) {
        console.error('[DataService] API returned error:', result.error);
        throw new Error(result.error);
      }
      
      return result;
    } catch (parseError) {
      console.error('[DataService] Failed to parse response as JSON:', parseError);
      return null;
    }
  } catch (error) {
    console.error('[DataService] API call failed:', error);
    return null;
  }
};

export const dataService = {
  /**
   * Get all data from Google Sheets (or localStorage as fallback)
   */
  getAllData: async (): Promise<AppData> => {
    // Try to fetch from Google Sheets first
    const remoteData = await apiCall('GET');
    
    if (remoteData && remoteData.jobs) {
      // Handle backward compatibility for options
      const options = remoteData.options || {};
      
      // If backend returns old structure (pickupLocations/dropoffLocations) but no 'locations'
      if (!options.locations) {
        const title = 'Migration Fix';
        // Merge unique locations from pickup and dropoff
        const mergedLocations = new Set<string>([
          ...(options.pickupLocations || []),
          ...(options.dropoffLocations || [])
        ]);
        options.locations = Array.from(mergedLocations);
        
        // Ensure other arrays exist
        options.vehicleTypes = options.vehicleTypes || [];
        options.drivers = options.drivers || [];
        options.licensePlates = options.licensePlates || [];
      }

      // Update local storage with remote data
      const appData: AppData = {
        jobs: remoteData.jobs,
        options: options
      };
      setStoredData(appData);
      return appData;
    }
    
    // Fallback to local storage
    return new Promise((resolve) => {
      setTimeout(() => resolve(getStoredData()), 300);
    });
  },

  /**
   * Add a new job entry
   */
  addJob: async (job: Omit<JobEntry, 'id' | 'timestamp'>): Promise<JobEntry> => {
    // Create new job locally first
    const newJob: JobEntry = {
      ...job,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    };
    
    // Update local storage
    const data = getStoredData();
    data.jobs.unshift(newJob);
    setStoredData(data);

    // Sync to Google Sheets
    const result = await apiCall('POST', {
      action: 'addJob',
      job: job
    });

    // If successful, update with server-generated ID
    if (result && result.job) {
      const updatedData = getStoredData();
      const index = updatedData.jobs.findIndex(j => j.id === newJob.id);
      if (index !== -1) {
        updatedData.jobs[index] = result.job;
        setStoredData(updatedData);
        return result.job;
      }
    }

    return newJob;
  },

  /**
   * Update an existing job
   */
  updateJob: async (job: JobEntry): Promise<JobEntry> => {
    // Update local storage
    const data = getStoredData();
    const index = data.jobs.findIndex(j => j.id === job.id);
    if (index !== -1) {
      data.jobs[index] = job;
      setStoredData(data);
    }

    // Sync to Google Sheets
    await apiCall('POST', {
      action: 'updateJob',
      job
    });

    return job;
  },

  /**
   * Add a new option to a category
   */
  addOption: async (category: OptionCategory, value: string): Promise<void> => {
    const data = getStoredData();
    
    if (!data.options[category].includes(value)) {
      data.options[category].push(value);
      setStoredData(data);
    }

    // Sync to Google Sheets
    await apiCall('POST', {
      action: 'addOption',
      category,
      value
    });
  },

  /**
   * Delete a job by ID
   */
  deleteJob: async (id: string): Promise<void> => {
    // Update local storage
    const data = getStoredData();
    data.jobs = data.jobs.filter(j => j.id !== id);
    setStoredData(data);

    // Sync to Google Sheets
    await apiCall('POST', {
      action: 'deleteJob',
      id
    });
  },

  /**
   * Initialize Google Sheets structure
   */
  initializeSheets: async (): Promise<boolean> => {
    const result = await apiCall('POST', { action: 'setup' });
    return result && result.success;
  },

  /**
   * Check if Google Sheets integration is configured
   */
  isRemoteConfigured: (): boolean => {
    return Boolean(SCRIPT_URL);
  }
};