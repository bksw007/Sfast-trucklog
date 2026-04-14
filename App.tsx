import React, { Suspense, lazy, useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import DriverLayout from './components/DriverLayout';
import { AdminUsersProvider } from './contexts/AdminUsersContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataProvider, useData } from './contexts/DataContext';
import { ThemeProvider } from './contexts/ThemeContext';
import SyncModal from './components/SyncModal';
import { Loader2 } from 'lucide-react';
import type { DriverView } from './pages/DriverJobsBoard';

// Lazy load pages for better performance
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AdminAccounting = lazy(() => import('./pages/AdminAccounting'));
const EntryForm = lazy(() => import('./pages/EntryForm'));
const DataTable = lazy(() => import('./pages/DataTable'));
const TodayJobs = lazy(() => import('./pages/TodayJobs'));
const DriverJobsBoard = lazy(() => import('./pages/DriverJobsBoard'));
const DriverDataTable = lazy(() => import('./pages/DriverDataTable'));
const DriverProfile = lazy(() => import('./pages/DriverProfile'));
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

const DriverPage: React.FC<{ view: DriverView }> = ({ view }) => (
  <DriverLayout>
    <Suspense fallback={<PageLoader />}>
      <DriverJobsBoard view={view} />
    </Suspense>
  </DriverLayout>
);

const AdminRoutes: React.FC = () => (
  <ProtectedContent>
    <AdminUsersProvider>
      <Routes>
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={
          <Layout>
            <Suspense fallback={<PageLoader />}>
              <Dashboard />
            </Suspense>
          </Layout>
        } />
        <Route path="/accounting" element={
          <Layout>
            <Suspense fallback={<PageLoader />}>
              <AdminAccounting />
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
        <Route path="/driver/*" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AdminUsersProvider>
  </ProtectedContent>
);

const DriverRoutes: React.FC = () => (
  <Routes>
    <Route path="/login" element={<Navigate to="/driver/today" replace />} />
    <Route path="/driver/today" element={<DriverPage view="today" />} />
    <Route path="/driver/active" element={<DriverPage view="active" />} />
    <Route path="/driver/ready-to-close" element={<Navigate to="/driver/active" replace />} />
    <Route path="/driver/history" element={<DriverPage view="history" />} />
    <Route path="/driver/data" element={
      <DriverLayout>
        <Suspense fallback={<PageLoader />}>
          <DriverDataTable />
        </Suspense>
      </DriverLayout>
    } />
    <Route path="/driver/entry" element={
      <DataProvider>
        <DriverLayout>
          <Suspense fallback={<PageLoader />}>
            <EntryForm />
          </Suspense>
        </DriverLayout>
      </DataProvider>
    } />
    <Route path="/driver/profile" element={
      <DriverLayout>
        <Suspense fallback={<PageLoader />}>
          <DriverProfile />
        </Suspense>
      </DriverLayout>
    } />
    <Route path="/driver" element={<Navigate to="/driver/today" replace />} />
    <Route path="*" element={<Navigate to="/driver/today" replace />} />
  </Routes>
);

const ScrollToTopOnRouteChange: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    const scrollRoot = document.scrollingElement as HTMLElement | null;
    if (scrollRoot) {
      scrollRoot.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, location.search]);

  return null;
};

// App Routes component (needs to be inside AuthProvider)
const AppRoutes: React.FC = () => {
  const { user, userProfile, loading } = useAuth();

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

  if (userProfile?.role === 'admin') return <AdminRoutes />;

  return <DriverRoutes />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Router>
          <ScrollToTopOnRouteChange />
          <AppRoutes />
        </Router>
      </ThemeProvider>
    </AuthProvider>
  );
};

export default App;
