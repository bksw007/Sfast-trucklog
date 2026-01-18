import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './contexts/ThemeContext';
import { DataProvider, useData } from './contexts/DataContext';
import SyncModal from './components/SyncModal';

const AppWithSync: React.FC = () => {
  const { syncing, error, initialSyncComplete, refreshData } = useData();
  const [showSyncModal, setShowSyncModal] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'success' | 'error'>('syncing');

  useEffect(() => {
    if (initialSyncComplete) {
      if (error) {
        setSyncStatus('error');
      } else {
        setSyncStatus('success');
        // Auto-close success modal after 1.5 seconds
        setTimeout(() => {
          setShowSyncModal(false);
        }, 1500);
      }
    }
  }, [initialSyncComplete, error]);

  const handleClose = () => {
    if (syncStatus === 'error') {
      // Retry sync
      setSyncStatus('syncing');
      refreshData();
    } else {
      setShowSyncModal(false);
    }
  };

  return (
    <>
      <SyncModal 
        isOpen={showSyncModal} 
        status={syncStatus}
        onClose={handleClose}
        errorMessage={error || undefined}
      />
      <App />
    </>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ThemeProvider>
        <DataProvider>
          <AppWithSync />
        </DataProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}