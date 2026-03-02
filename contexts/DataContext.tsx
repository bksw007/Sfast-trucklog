import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { AppData, JobEntry } from '../types';
import { subscribeToJobs, subscribeToOptions, initializeDefaultOptions } from '../services/firebaseService';

interface DataContextType {
  data: AppData | null;
  loading: boolean;
  syncing: boolean;
  lastUpdate: Date | null;
  error: string | null;
  refreshData: () => Promise<void>;
  initialSyncComplete: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [options, setOptions] = useState<AppData['options']>({
    locations: [],
    vehicleTypes: [],
    drivers: [],
    licensePlates: [],
    employerCompanies: [],
    productTypes: [],
    contacts: [],
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialSyncComplete, setInitialSyncComplete] = useState(false);

  // Combine jobs and options into AppData
  const data: AppData | null = jobs || options ? { jobs, options } : null;

  // RefreshData is now a no-op since we use real-time subscriptions
  // But we keep it for API compatibility
  const refreshData = useCallback(async () => {
    console.log('[DataContext] refreshData called - using real-time subscription');
    // Real-time subscriptions automatically update data
  }, []);

  useEffect(() => {
    console.log('[DataContext] Setting up Firebase real-time subscriptions...');

    // Initialize default options if needed
    initializeDefaultOptions().catch(console.error);

    // Subscribe to jobs collection
    const unsubscribeJobs = subscribeToJobs(
      (newJobs) => {
        console.log(`[DataContext] Received ${newJobs.length} jobs from Firebase`);
        setJobs(newJobs);
        setLastUpdate(new Date());
        setLoading(false);
        setSyncing(false);
        setInitialSyncComplete(true);
      },
      (err) => {
        console.error('[DataContext] Jobs subscription error:', err);
        setError(err.message);
        setLoading(false);
        setSyncing(false);
      }
    );

    // Subscribe to options collection
    const unsubscribeOptions = subscribeToOptions(
      (newOptions) => {
        console.log('[DataContext] Received options from Firebase:', newOptions);
        setOptions(newOptions);
      },
      (err) => {
        console.error('[DataContext] Options subscription error:', err);
      }
    );

    // Cleanup subscriptions on unmount
    return () => {
      console.log('[DataContext] Cleaning up Firebase subscriptions...');
      unsubscribeJobs();
      unsubscribeOptions();
    };
  }, []);

  return (
    <DataContext.Provider value={{ 
      data, 
      loading, 
      syncing, 
      lastUpdate, 
      error, 
      refreshData,
      initialSyncComplete 
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = (): DataContextType => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

export default DataContext;
