import React, { useState, useMemo } from 'react';
import { AppData, JobEntry } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Truck, MapPin, Calendar, CheckCircle2, Filter, X, ChevronDown } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useData } from '../contexts/DataContext';

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

const Dashboard: React.FC = () => {
  const { theme } = useTheme();
  const { data } = useData();
  const isDark = theme === 'dark';
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    month: null,
    year: null,
    driver: '',
    vehicleType: '',
    licensePlate: ''
  });

  // Extract unique years from data
  const availableYears = useMemo(() => {
    if (!data) return [];
    const years = new Set(data.jobs.map(job => new Date(job.date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [data]);

  // Filter jobs based on selected filters
  const filteredJobs = useMemo(() => {
    if (!data) return [];
    
    return data.jobs.filter(job => {
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
  }, [data, filters]);

  const clearFilters = () => {
    setFilters({
      month: null,
      year: null,
      driver: '',
      vehicleType: '',
      licensePlate: ''
    });
  };

  const hasActiveFilters = filters.month || filters.year || filters.driver || filters.vehicleType || filters.licensePlate;

  if (!data) return (
    <div className={`p-10 text-center animate-pulse ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
      กำลังโหลดข้อมูล...
    </div>
  );

  const totalJobs = filteredJobs.length;
  const totalRounds = filteredJobs.reduce((acc, job) => acc + job.rounds, 0);
  const uniqueDrivers = new Set(filteredJobs.map(j => j.driverName)).size;
  const uniqueVehicles = new Set(filteredJobs.map(j => j.licensePlate)).size;

  // Prepare Chart Data: Jobs per Driver
  const jobsPerDriver = filteredJobs.reduce((acc, job) => {
    acc[job.driverName] = (acc[job.driverName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const driverChartData = Object.entries(jobsPerDriver).map(([name, count]) => ({
    name,
    jobs: count
  }));

  // Prepare Chart Data: Job types (Vehicle type)
  const vehicleTypeData = filteredJobs.reduce((acc, job) => {
    acc[job.vehicleType] = (acc[job.vehicleType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(vehicleTypeData).map(([name, value]) => ({ name, value }));
  const CHART_COLORS = ['#7c3aed', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#ec4899'];

  const chartTextColor = isDark ? '#9aa5ce' : '#64748b';
  const chartGridColor = isDark ? '#414868' : '#e2e8f0';
  const tooltipBg = isDark ? '#1a1b26' : '#ffffff';
  const tooltipBorder = isDark ? '#414868' : '#e2e8f0';
  const tooltipTextColor = isDark ? '#e0e7ff' : '#1e293b';

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className={`text-3xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            ภาพรวมงานวิ่ง
          </h2>
          <p className={isDark ? 'text-dark-muted' : 'text-light-muted'}>
            สรุปข้อมูลสถิติและการดำเนินงานทั้งหมด
          </p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
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
        <div className={`p-6 rounded-2xl border animate-fade-in ${
          isDark ? 'bg-dark-card border-dark-muted/20' : 'bg-light-card border-light-muted/20 shadow-lg'
        }`}>
          <div className="flex flex-wrap gap-4">
            {/* Month Filter */}
            <div className="flex-1 min-w-[140px]">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                เดือน
              </label>
              <select
                value={filters.month || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, month: e.target.value ? parseInt(e.target.value) : null }))}
                className={`w-full px-3 py-2 rounded-lg border transition-colors ${
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
            <div className="flex-1 min-w-[120px]">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                ปี
              </label>
              <select
                value={filters.year || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, year: e.target.value ? parseInt(e.target.value) : null }))}
                className={`w-full px-3 py-2 rounded-lg border transition-colors ${
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
            <div className="flex-1 min-w-[150px]">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                คนขับ
              </label>
              <select
                value={filters.driver}
                onChange={(e) => setFilters(prev => ({ ...prev, driver: e.target.value }))}
                className={`w-full px-3 py-2 rounded-lg border transition-colors ${
                  isDark 
                    ? 'bg-dark-bg border-dark-muted/30 text-dark-text' 
                    : 'bg-light-bg border-light-muted/30 text-light-text'
                }`}
              >
                <option value="">ทั้งหมด</option>
                {data.options.drivers.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Vehicle Type Filter */}
            <div className="flex-1 min-w-[140px]">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                ประเภทรถ
              </label>
              <select
                value={filters.vehicleType}
                onChange={(e) => setFilters(prev => ({ ...prev, vehicleType: e.target.value }))}
                className={`w-full px-3 py-2 rounded-lg border transition-colors ${
                  isDark 
                    ? 'bg-dark-bg border-dark-muted/30 text-dark-text' 
                    : 'bg-light-bg border-light-muted/30 text-light-text'
                }`}
              >
                <option value="">ทั้งหมด</option>
                {data.options.vehicleTypes.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            {/* License Plate Filter */}
            <div className="flex-1 min-w-[140px]">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                ป้ายทะเบียน
              </label>
              <select
                value={filters.licensePlate}
                onChange={(e) => setFilters(prev => ({ ...prev, licensePlate: e.target.value }))}
                className={`w-full px-3 py-2 rounded-lg border transition-colors ${
                  isDark 
                    ? 'bg-dark-bg border-dark-muted/30 text-dark-text' 
                    : 'bg-light-bg border-light-muted/30 text-light-text'
                }`}
              >
                <option value="">ทั้งหมด</option>
                {data.options.licensePlates.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Clear Button */}
            {hasActiveFilters && (
              <div className="flex items-end">
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-danger/10 text-accent-danger hover:bg-accent-danger/20 transition-colors"
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className={`p-6 rounded-2xl border shadow-xl ${
          isDark ? 'bg-dark-card border-dark-muted/10' : 'bg-light-card border-light-muted/10'
        }`}>
          <h3 className={`text-xl font-semibold mb-6 ${isDark ? 'text-dark-text' : 'text-light-text'}`}>
            งานแยกตามคนขับ
          </h3>
          <div className="h-80">
            {driverChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={driverChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                  <XAxis dataKey="name" stroke={chartTextColor} tick={{fill: chartTextColor}} />
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

        <div className={`p-6 rounded-2xl border shadow-xl ${
          isDark ? 'bg-dark-card border-dark-muted/10' : 'bg-light-card border-light-muted/10'
        }`}>
          <h3 className={`text-xl font-semibold mb-6 ${isDark ? 'text-dark-text' : 'text-light-text'}`}>
            สัดส่วนประเภทรถ
          </h3>
          <div className="h-80">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
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