import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { AppData } from '../types';
import { subscribeToOptions, initializeDefaultOptions } from '../services/firebaseService';

interface DataContextType {
  data: AppData | null;
  loading: boolean;
  syncing: boolean;
  syncStage: 'idle' | 'connecting' | 'subscribing' | 'seeding' | 'ready' | 'error';
  lastUpdate: Date | null;
  error: string | null;
  refreshData: () => Promise<void>;
  initialSyncComplete: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
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
  const [syncStage, setSyncStage] = useState<DataContextType['syncStage']>('idle');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialSyncComplete, setInitialSyncComplete] = useState(false);
  const seedAttemptedRef = useRef(false);

  // Shared context now carries lightweight option data only.
  const data: AppData | null = { jobs: [], options };

  // RefreshData is now a no-op since we use real-time subscriptions
  // But we keep it for API compatibility
  const refreshData = useCallback(async () => {
    console.log('[DataContext] refreshData called - using real-time subscription');
    // Real-time subscriptions automatically update data
  }, []);

  useEffect(() => {
    console.log('[DataContext] Setting up Firebase real-time subscriptions...');
    setSyncStage('connecting');

    // Subscribe to options collection
    setSyncStage('subscribing');
    const unsubscribeOptions = subscribeToOptions(
      (newOptions) => {
        console.log('[DataContext] Received options from Firebase:', newOptions);
        setOptions(newOptions);
        const totalOptionCount = Object.values(newOptions).reduce((sum, items) => sum + items.length, 0);
        if (totalOptionCount === 0 && !seedAttemptedRef.current) {
          seedAttemptedRef.current = true;
          setSyncStage('seeding');
          initializeDefaultOptions(true).catch(console.error);
        }
        setLastUpdate(new Date());
        setLoading(false);
        setSyncing(false);
        setSyncStage('ready');
        setInitialSyncComplete(true);
      },
      (err) => {
        console.error('[DataContext] Options subscription error:', err);
        setError(err.message);
        setLoading(false);
        setSyncing(false);
        setSyncStage('error');
      }
    );

    // Cleanup subscriptions on unmount
    return () => {
      console.log('[DataContext] Cleaning up Firebase subscriptions...');
      unsubscribeOptions();
    };
  }, []);

  return (
    <DataContext.Provider value={{ 
      data, 
      loading, 
      syncing, 
      syncStage,
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
