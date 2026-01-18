import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { AppData } from '../types';
import { dataService } from '../services/dataService';

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

const DATA_LAST_UPDATE_KEY = 'sfast_trucklog_last_update';

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialSyncComplete, setInitialSyncComplete] = useState(false);

  const refreshData = useCallback(async () => {
    try {
      setSyncing(true);
      setError(null);
      const result = await dataService.getAllData();
      setData(result);
      const now = new Date();
      setLastUpdate(now);
      localStorage.setItem(DATA_LAST_UPDATE_KEY, now.toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setSyncing(false);
      setLoading(false);
      setInitialSyncComplete(true);
    }
  }, []);

  useEffect(() => {
    // Load last update time from localStorage
    const storedLastUpdate = localStorage.getItem(DATA_LAST_UPDATE_KEY);
    if (storedLastUpdate) {
      setLastUpdate(new Date(storedLastUpdate));
    }
    
    // Initial data fetch
    refreshData();
  }, [refreshData]);

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
