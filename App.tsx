import React, { Suspense, lazy, useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataProvider, useData } from './contexts/DataContext';
import SyncModal from './components/SyncModal';
import { Loader2 } from 'lucide-react';

// Lazy load pages for better performance
const Dashboard = lazy(() => import('./pages/Dashboard'));
const EntryForm = lazy(() => import('./pages/EntryForm'));
const DataTable = lazy(() => import('./pages/DataTable'));
const TodayJobs = lazy(() => import('./pages/TodayJobs'));
const Login = lazy(() => import('./pages/Login'));
const Settings = lazy(() => import('./pages/Settings'));

// Loading spinner component
const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-12 h-12 border-4 border-accent-primary border-t-transparent rounded-full animate-spin"></div>
  </div>
);

// Full screen loader for auth
const AuthLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-dark-bg">
    <Loader2 className="w-12 h-12 text-accent-primary animate-spin" />
  </div>
);

// Sync modal wrapper for authenticated users
const SyncWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { syncing, error, initialSyncComplete, refreshData } = useData();
  const [showSyncModal, setShowSyncModal] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'success' | 'error'>('syncing');

  useEffect(() => {
    if (initialSyncComplete) {
      if (error) {
        setSyncStatus('error');
      } else {
        setSyncStatus('success');
        setTimeout(() => setShowSyncModal(false), 1500);
      }
    }
  }, [initialSyncComplete, error]);

  const handleClose = () => {
    if (syncStatus === 'error') {
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
      {children}
    </>
  );
};

// Protected content with DataProvider
const ProtectedContent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <DataProvider>
      <SyncWrapper>
        {children}
      </SyncWrapper>
    </DataProvider>
  );
};

// Protected Route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <AuthLoader />;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

// App Routes component (needs to be inside AuthProvider)
const AppRoutes: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthLoader />;
  }

  // If not authenticated, show login
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Authenticated - wrap with DataProvider
  return (
    <ProtectedContent>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/" element={
          <Layout>
            <Suspense fallback={<PageLoader />}>
              <Dashboard />
            </Suspense>
          </Layout>
        } />
        <Route path="/entry" element={
          <Layout>
            <Suspense fallback={<PageLoader />}>
              <EntryForm />
            </Suspense>
          </Layout>
        } />
        <Route path="/today" element={
          <Layout>
            <Suspense fallback={<PageLoader />}>
              <TodayJobs />
            </Suspense>
          </Layout>
        } />
        <Route path="/data" element={
          <Layout>
            <Suspense fallback={<PageLoader />}>
              <DataTable />
            </Suspense>
          </Layout>
        } />
        <Route path="/settings" element={
          <Layout>
            <Suspense fallback={<PageLoader />}>
              <Settings />
            </Suspense>
          </Layout>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ProtectedContent>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
};

export default App;
