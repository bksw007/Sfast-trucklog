import React, { useEffect, useMemo, useState } from 'react';
import { JobEntry } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Truck, MapPin, Calendar, CheckCircle2, Filter, X, ChevronDown, Droplets, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  rebuildDashboardMetricsMonth,
  subscribeToDashboardMetricsByMonth,
  subscribeToJobsByMonth,
  subscribeToLatestDieselPrice,
  type DashboardMetricSummary,
  type LatestDieselPrice,
} from '../services/firebaseService';

const MONTHS = [
  { value: 1, label: 'มกราคม' },
  { value: 2, label: 'กุมภาพันธ์' },
  { value: 3, label: 'มีนาคม' },
  { value: 4, label: 'เมษายน' },
  { value: 5, label: 'พฤษภาคม' },
  { value: 6, label: 'มิถุนายน' },
  { value: 7, label: 'กรกฎาคม' },
  { value: 8, label: 'สิงหาคม' },
  { value: 9, label: 'กันยายน' },
  { value: 10, label: 'ตุลาคม' },
  { value: 11, label: 'พฤศจิกายน' },
  { value: 12, label: 'ธันวาคม' },
];

interface Filters {
  month: number | null;
  year: number | null;
  driver: string;
  vehicleType: string;
  licensePlate: string;
}

const getCurrentMonthYear = () => {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };
};

const createDefaultFilters = (): Filters => {
  const { month, year } = getCurrentMonthYear();
  return {
    month,
    year,
    driver: '',
    vehicleType: '',
    licensePlate: ''
  };
};

const toMonthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

const Dashboard: React.FC = () => {
  const { data: appData } = useData();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(() => createDefaultFilters());
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [metricSummary, setMetricSummary] = useState<DashboardMetricSummary | null>(null);
  const [latestDieselPrice, setLatestDieselPrice] = useState<LatestDieselPrice | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [rebuildingMetrics, setRebuildingMetrics] = useState(false);
  const [rebuildRequestedMonth, setRebuildRequestedMonth] = useState('');

  // Extract unique years from data
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, index) => currentYear - index);
  }, []);

  const hasDimensionFilters = Boolean(filters.driver || filters.vehicleType || filters.licensePlate);
  const monthKey =
    filters.month && filters.year
      ? toMonthKey(filters.year, filters.month)
      : '';

  useEffect(() => {
    if (!monthKey || hasDimensionFilters) {
      setMetricSummary(null);
      setMetricsLoading(false);
      return undefined;
    }

    setMetricsLoading(true);
    const unsubscribe = subscribeToDashboardMetricsByMonth(
      monthKey,
      (summary) => {
        setMetricSummary(summary);
        setMetricsLoading(false);
      },
      (error) => {
        console.error('Dashboard metrics subscribe failed:', error);
        setMetricSummary(null);
        setMetricsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [hasDimensionFilters, monthKey]);

  useEffect(() => {
    if (!monthKey || !hasDimensionFilters) {
      setJobs([]);
      setJobsLoading(false);
      return undefined;
    }

    setJobsLoading(true);
    const unsubscribe = subscribeToJobsByMonth(
      filters.year,
      filters.month,
      (rows) => {
        setJobs(rows);
        setJobsLoading(false);
      },
      (error) => {
        console.error('Dashboard jobs subscribe failed:', error);
        setJobs([]);
        setJobsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [filters.month, filters.year, hasDimensionFilters, monthKey]);

  useEffect(() => {
    const unsubscribe = subscribeToLatestDieselPrice(
      (price) => {
        setLatestDieselPrice(price);
      },
      (error) => {
        console.error('Latest diesel price subscribe failed:', error);
        setLatestDieselPrice(null);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!monthKey || hasDimensionFilters || metricsLoading || metricSummary || rebuildRequestedMonth === monthKey) {
      return;
    }

    setRebuildRequestedMonth(monthKey);
    setRebuildingMetrics(true);
    rebuildDashboardMetricsMonth(monthKey)
      .catch((error) => {
        console.error('Rebuild dashboard metrics failed:', error);
      })
      .finally(() => {
        setRebuildingMetrics(false);
      });
  }, [hasDimensionFilters, metricSummary, metricsLoading, monthKey, rebuildRequestedMonth]);

  // Filter jobs based on selected filters
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const jobDate = new Date(job.date);
      const jobMonth = jobDate.getMonth() + 1;
      const jobYear = jobDate.getFullYear();

      if (filters.month && jobMonth !== filters.month) return false;
      if (filters.year && jobYear !== filters.year) return false;
      if (filters.driver && job.driverName !== filters.driver) return false;
      if (filters.vehicleType && job.vehicleType !== filters.vehicleType) return false;
      if (filters.licensePlate && job.licensePlate !== filters.licensePlate) return false;

      return true;
    });
  }, [filters, jobs]);

  const clearFilters = () => {
    setFilters(createDefaultFilters());
  };

  const hasActiveFilters = filters.month || filters.year || filters.driver || filters.vehicleType || filters.licensePlate;
  const loading = hasDimensionFilters ? jobsLoading : (metricsLoading || rebuildingMetrics);

  if (loading) return (
    <div className={`p-10 text-center animate-pulse ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
      กำลังโหลดข้อมูล...
    </div>
  );

  const totalJobs = hasDimensionFilters
    ? filteredJobs.length
    : (metricSummary?.totalJobs || 0);
  const totalRounds = hasDimensionFilters
    ? filteredJobs.reduce((acc, job) => acc + job.rounds, 0)
    : (metricSummary?.totalRounds || 0);
  const uniqueDrivers = hasDimensionFilters
    ? new Set(filteredJobs.map((job) => job.driverName)).size
    : (metricSummary?.uniqueDrivers || 0);
  const uniqueVehicles = hasDimensionFilters
    ? new Set(filteredJobs.map((job) => job.licensePlate)).size
    : (metricSummary?.uniqueVehicles || 0);

  // Prepare Chart Data: Jobs per Driver
  const driverChartData = hasDimensionFilters
    ? Object.entries(
        filteredJobs.reduce((acc, job) => {
          acc[job.driverName] = (acc[job.driverName] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      ).map(([name, count]) => ({
        name,
        jobs: count,
      }))
    : (metricSummary?.jobsPerDriver || []).map(({ name, count }) => ({
        name,
        jobs: count,
      }));

  // Prepare Chart Data: Job types (Vehicle type)
  const pieData = hasDimensionFilters
    ? Object.entries(
        filteredJobs.reduce((acc, job) => {
          acc[job.vehicleType] = (acc[job.vehicleType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      ).map(([name, value]) => ({ name, value }))
    : (metricSummary?.vehicleTypeCounts || []).map(({ name, count }) => ({ name, value: count }));
  const CHART_COLORS = ['#7c3aed', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#ec4899'];

  const chartTextColor = isDark ? '#9aa5ce' : '#64748b';
  const chartGridColor = isDark ? '#414868' : '#e2e8f0';
  const tooltipBg = isDark ? '#1a1b26' : '#ffffff';
  const tooltipBorder = isDark ? '#414868' : '#e2e8f0';
  const tooltipTextColor = isDark ? '#e0e7ff' : '#1e293b';
  const dieselDelta = latestDieselPrice?.differenceFromYesterday || 0;
  const DieselTrendIcon =
    dieselDelta > 0 ? TrendingUp : dieselDelta < 0 ? TrendingDown : Minus;
  const dieselTrendClass =
    dieselDelta > 0
      ? 'bg-rose-500/15 text-rose-300'
      : dieselDelta < 0
        ? 'bg-emerald-500/15 text-emerald-300'
        : isDark
          ? 'bg-white/10 text-[#dfe7ff]'
          : 'bg-slate-100 text-slate-600';

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className={`text-3xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            ภาพรวมงานวิ่ง
          </h2>
          <p className={isDark ? 'text-dark-muted' : 'text-light-muted'}>
            สรุปข้อมูลสถิติและการดำเนินงานทั้งหมด
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${
              isDark
                ? 'bg-sky-500/12 text-[#eef6ff] ring-1 ring-sky-400/20'
                : 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
            }`}>
              <Droplets size={16} />
              {latestDieselPrice ? `ดีเซล ${latestDieselPrice.priceToday.toFixed(2)} บาท/ลิตร` : 'กำลังโหลดราคาดีเซล'}
            </div>
            {latestDieselPrice && (
              <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${dieselTrendClass}`}>
                <DieselTrendIcon size={15} />
                {latestDieselPrice.changeDirection === 'up'
                  ? `เพิ่มขึ้น ${dieselDelta.toFixed(2)} บาท`
                  : latestDieselPrice.changeDirection === 'down'
                    ? `ลดลง ${Math.abs(dieselDelta).toFixed(2)} บาท`
                    : 'คงเดิม'}
              </div>
            )}
          </div>
          {latestDieselPrice && (
            <p className={`mt-2 text-sm ${isDark ? 'text-[#d9e4ff]' : 'text-slate-600'}`}>
              {latestDieselPrice.summaryText}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 transition-all sm:w-auto ${
            hasActiveFilters 
              ? 'bg-accent-primary text-white' 
              : isDark 
                ? 'bg-dark-card border border-dark-muted/30 hover:bg-white/5' 
                : 'bg-light-card border border-light-muted/20 hover:bg-black/5 shadow-sm'
          }`}
        >
          <Filter size={18} />
          <span className="font-medium">ตัวกรอง</span>
          {hasActiveFilters && (
            <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full">
              {[filters.month, filters.year, filters.driver, filters.vehicleType, filters.licensePlate].filter(Boolean).length}
            </span>
          )}
          <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
      </header>

      {/* Filter Panel */}
      {showFilters && (
        <div className={`animate-fade-in rounded-2xl border p-4 sm:p-6 ${
          isDark ? 'bg-dark-card border-dark-muted/20' : 'bg-light-card border-light-muted/20 shadow-lg'
        }`}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {/* Month Filter */}
            <div className="w-full sm:flex-1 sm:min-w-[140px]">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                เดือน
              </label>
              <select
                value={filters.month || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, month: e.target.value ? parseInt(e.target.value) : null }))}
                className={`min-h-11 w-full rounded-lg border px-3 py-2.5 text-[16px] transition-colors md:text-sm ${
                  isDark 
                    ? 'bg-dark-bg border-dark-muted/30 text-dark-text' 
                    : 'bg-light-bg border-light-muted/30 text-light-text'
                }`}
              >
                <option value="">ทั้งหมด</option>
                {MONTHS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Year Filter */}
            <div className="w-full sm:flex-1 sm:min-w-[120px]">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                ปี
              </label>
              <select
                value={filters.year || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, year: e.target.value ? parseInt(e.target.value) : null }))}
                className={`min-h-11 w-full rounded-lg border px-3 py-2.5 text-[16px] transition-colors md:text-sm ${
                  isDark 
                    ? 'bg-dark-bg border-dark-muted/30 text-dark-text' 
                    : 'bg-light-bg border-light-muted/30 text-light-text'
                }`}
              >
                <option value="">ทั้งหมด</option>
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Driver Filter */}
            <div className="w-full sm:flex-1 sm:min-w-[150px]">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                คนขับ
              </label>
              <select
                value={filters.driver}
                onChange={(e) => setFilters(prev => ({ ...prev, driver: e.target.value }))}
                className={`min-h-11 w-full rounded-lg border px-3 py-2.5 text-[16px] transition-colors md:text-sm ${
                  isDark 
                    ? 'bg-dark-bg border-dark-muted/30 text-dark-text' 
                    : 'bg-light-bg border-light-muted/30 text-light-text'
                }`}
              >
                <option value="">ทั้งหมด</option>
                {(appData?.options.drivers || []).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Vehicle Type Filter */}
            <div className="w-full sm:flex-1 sm:min-w-[140px]">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                ประเภทรถ
              </label>
              <select
                value={filters.vehicleType}
                onChange={(e) => setFilters(prev => ({ ...prev, vehicleType: e.target.value }))}
                className={`min-h-11 w-full rounded-lg border px-3 py-2.5 text-[16px] transition-colors md:text-sm ${
                  isDark 
                    ? 'bg-dark-bg border-dark-muted/30 text-dark-text' 
                    : 'bg-light-bg border-light-muted/30 text-light-text'
                }`}
              >
                <option value="">ทั้งหมด</option>
                {(appData?.options.vehicleTypes || []).map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            {/* License Plate Filter */}
            <div className="w-full sm:flex-1 sm:min-w-[140px]">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                ป้ายทะเบียน
              </label>
              <select
                value={filters.licensePlate}
                onChange={(e) => setFilters(prev => ({ ...prev, licensePlate: e.target.value }))}
                className={`min-h-11 w-full rounded-lg border px-3 py-2.5 text-[16px] transition-colors md:text-sm ${
                  isDark 
                    ? 'bg-dark-bg border-dark-muted/30 text-dark-text' 
                    : 'bg-light-bg border-light-muted/30 text-light-text'
                }`}
              >
                <option value="">ทั้งหมด</option>
                {(appData?.options.licensePlates || []).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Clear Button */}
            {hasActiveFilters && (
              <div className="flex items-end">
                <button
                  onClick={clearFilters}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-danger/10 px-4 py-2 text-accent-danger transition-colors hover:bg-accent-danger/20"
                >
                  <X size={16} />
                  ล้าง
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
        <StatCard 
          title="งานทั้งหมด" 
          value={totalJobs} 
          icon={<CheckCircle2 />} 
          color="accent-primary"
          isDark={isDark}
        />
        <StatCard 
          title="จำนวนรอบรวม" 
          value={totalRounds} 
          icon={<Calendar />} 
          color="accent-secondary"
          isDark={isDark}
        />
        <StatCard 
          title="พนักงานขับรถ" 
          value={uniqueDrivers} 
          icon={<Truck />} 
          color="accent-success"
          isDark={isDark}
        />
        <StatCard 
          title="จำนวนรถ" 
          value={uniqueVehicles} 
          icon={<MapPin />} 
          color="accent-warning"
          isDark={isDark}
        />
      </div>

      {/* Charts */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <div className={`rounded-2xl border p-4 shadow-xl sm:p-6 ${
          isDark ? 'bg-dark-card border-dark-muted/10' : 'bg-light-card border-light-muted/10'
        }`}>
          <h3 className={`mb-4 text-lg font-semibold sm:mb-6 sm:text-xl ${isDark ? 'text-dark-text' : 'text-light-text'}`}>
            งานแยกตามคนขับ
          </h3>
          <div className="h-[18rem] sm:h-80">
            {driverChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={driverChartData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke={chartTextColor} 
                    tick={{fill: chartTextColor, fontSize: 12}} 
                    angle={-45}
                    textAnchor="end"
                    height={70}
                    interval={0}
                  />
                  <YAxis stroke={chartTextColor} tick={{fill: chartTextColor}} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: '8px', color: tooltipTextColor }}
                    cursor={{fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}}
                    itemStyle={{ color: tooltipTextColor }}
                    labelStyle={{ color: tooltipTextColor }}
                  />
                  <Bar dataKey="jobs" fill="#7c3aed" radius={[4, 4, 0, 0]}>
                    {driverChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className={`h-full flex items-center justify-center ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                ไม่มีข้อมูล
              </div>
            )}
          </div>
        </div>

        <div className={`rounded-2xl border p-4 shadow-xl sm:p-6 ${
          isDark ? 'bg-dark-card border-dark-muted/10' : 'bg-light-card border-light-muted/10'
        }`}>
          <h3 className={`mb-4 text-lg font-semibold sm:mb-6 sm:text-xl ${isDark ? 'text-dark-text' : 'text-light-text'}`}>
            สัดส่วนประเภทรถ
          </h3>
          <div className="h-[18rem] sm:h-80">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={0}
                    stroke="none"
                    strokeWidth={0}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: '8px', color: tooltipTextColor }}
                    itemStyle={{ color: tooltipTextColor }}
                  />
                  <Legend 
                    layout="horizontal" 
                    verticalAlign="bottom" 
                    align="center"
                    wrapperStyle={{ paddingTop: '20px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className={`h-full flex items-center justify-center ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                ไม่มีข้อมูล
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ 
  title: string; 
  value: number; 
  icon: React.ReactNode; 
  color: string;
  isDark: boolean;
}> = ({ title, value, icon, color, isDark }) => {
  const colorMap: Record<string, { bg: string; text: string }> = {
    'accent-primary': { bg: 'bg-purple-500/10', text: 'text-purple-500' },
    'accent-secondary': { bg: 'bg-sky-500/10', text: 'text-sky-500' },
    'accent-success': { bg: 'bg-green-500/10', text: 'text-green-500' },
    'accent-warning': { bg: 'bg-amber-500/10', text: 'text-amber-500' },
    'accent-danger': { bg: 'bg-red-500/10', text: 'text-red-500' },
  };

  const colors = colorMap[color] || colorMap['accent-primary'];

  return (
    <div className={`p-6 rounded-2xl border shadow-lg hover:translate-y-[-2px] transition-transform ${
      isDark ? 'bg-dark-card border-dark-muted/10' : 'bg-light-card border-light-muted/10'
    }`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm font-medium mb-1 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>{title}</p>
          <h3 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{value}</h3>
        </div>
        <div className={`p-3 rounded-xl ${colors.bg}`}>
          {React.cloneElement(icon as React.ReactElement, { size: 28, className: colors.text })}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
