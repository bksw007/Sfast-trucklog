import React, { Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';

// Lazy load pages for better performance
const Dashboard = lazy(() => import('./pages/Dashboard'));
const EntryForm = lazy(() => import('./pages/EntryForm'));
const DataTable = lazy(() => import('./pages/DataTable'));

// Loading spinner component
const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-12 h-12 border-4 border-accent-primary border-t-transparent rounded-full animate-spin"></div>
  </div>
);

const App: React.FC = () => {
  return (
    <Router>
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/entry" element={<EntryForm />} />
            <Route path="/data" element={<DataTable />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </Router>
  );
};

export default App;