import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, FileText, Fuel, MapPin, Search, Truck, UserRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToJobsByDriverName } from '../services/firebaseService';
import { JobEntry } from '../types';
import { formatDate } from '../utils/formatters';

const normalizeText = (value: string) => value.trim().toLowerCase();
const dateKey = (date: string) => (date || '').split('T')[0];
const getCurrentMonthYear = () => {
  const now = new Date();
  return {
    month: String(now.getMonth() + 1).padStart(2, '0'),
    year: String(now.getFullYear()),
  };
};

const DriverDataTable: React.FC = () => {
  const { userProfile } = useAuth();
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchText, setSearchText] = useState('');
  const [monthFilter, setMonthFilter] = useState(getCurrentMonthYear().month);
  const [yearFilter, setYearFilter] = useState(getCurrentMonthYear().year);

  const driverFullName = (userProfile?.fullName || '').trim();

  useEffect(() => {
    if (!driverFullName) {
      setJobs([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setErrorMessage('');

    const unsubscribe = subscribeToJobsByDriverName(
      driverFullName,
      (rows) => {
        setJobs(rows);
        setLoading(false);
      },
      (error) => {
        console.error('Driver data table subscribe failed:', error);
        setErrorMessage(error.message || 'โหลดข้อมูลงานวิ่งไม่สำเร็จ');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [driverFullName]);

  const yearOptions = useMemo(() => {
    const years = new Set(
      jobs
        .map((job) => dateKey(job.date).slice(0, 4))
        .filter(Boolean)
    );
    years.add(getCurrentMonthYear().year);
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [jobs]);

  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')),
    []
  );

  const filteredJobs = useMemo(() => {
    const search = normalizeText(searchText);
    return jobs.filter((job) => {
      const jobDate = dateKey(job.date);
      if (yearFilter && jobDate.slice(0, 4) !== yearFilter) return false;
      if (monthFilter && jobDate.slice(5, 7) !== monthFilter) return false;
      if (!search) return true;

      const haystack = normalizeText(
        [
          job.jobNo,
          job.workOrderNo,
          job.invNo,
          job.pickupLocation,
          job.dropoffLocation,
          job.vehicleType,
          job.licensePlate,
          job.remarks,
        ]
          .map((value) => value || '')
          .join(' ')
      );

      return haystack.includes(search);
    });
  }, [jobs, monthFilter, searchText]);

  const totalRounds = useMemo(
    () => filteredJobs.reduce((sum, job) => sum + (Number(job.rounds) || 0), 0),
    [filteredJobs]
  );

  if (!driverFullName) {
    return (
      <section className="driver-clay-card p-5 sm:p-6">
        <h2 className="text-2xl font-black text-slate-700">ข้อมูลงานวิ่งของฉัน</h2>
        <p className="mt-2 text-sm text-slate-500">
          กรุณากรอก ชื่อ-นามสกุลจริง ในหน้าโปรไฟล์ก่อน เพื่อให้ระบบแมตช์ข้อมูลกับพนักงานขับรถ
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="driver-clay-card p-5 sm:p-6">
        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">My Records</p>
        <h2 className="mt-1 text-2xl font-black text-slate-700">ข้อมูลงานวิ่งของฉัน</h2>
        <p className="mt-1 text-sm text-slate-500">แสดงเฉพาะรายการที่ พนักงานขับรถ = {driverFullName}</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="driver-clay-soft rounded-2xl p-3">
            <p className="text-xs text-slate-500">จำนวนงาน</p>
            <p className="mt-1 text-2xl font-black text-slate-700">{filteredJobs.length}</p>
          </div>
          <div className="driver-clay-soft rounded-2xl p-3">
            <p className="text-xs text-slate-500">จำนวนรอบรวม</p>
            <p className="mt-1 text-2xl font-black text-slate-700">{totalRounds}</p>
          </div>
        </div>
      </section>

      <section className="driver-clay-card p-4 sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="ค้นหาเลขงาน, จุดรับ/ส่ง, ทะเบียน..."
            className="driver-clay-input w-full pl-10 pr-3 py-2.5 text-sm"
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <select
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value)}
            className="driver-clay-input w-full py-2.5 text-sm"
          >
            <option value="">ทุกเดือน</option>
            {monthOptions.map((month) => (
              <option key={month} value={month}>
                เดือน {month}
              </option>
            ))}
          </select>
          <select
            value={yearFilter}
            onChange={(event) => setYearFilter(event.target.value)}
            className="driver-clay-input w-full py-2.5 text-sm"
          >
            <option value="">ทุกปี</option>
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                ปี {year}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="space-y-3">
        {loading ? (
          <article className="driver-clay-card p-4 sm:p-5">
            <p className="text-sm text-slate-500">กำลังโหลดข้อมูล...</p>
          </article>
        ) : errorMessage ? (
          <article className="driver-clay-card border border-rose-200/70 p-4 sm:p-5">
            <p className="text-sm font-semibold text-rose-500">{errorMessage}</p>
          </article>
        ) : filteredJobs.length === 0 ? (
          <article className="driver-clay-card p-4 sm:p-5">
            <p className="text-sm text-slate-500">ไม่พบข้อมูลงานวิ่ง</p>
          </article>
        ) : (
          filteredJobs.map((job) => (
            <article key={job.id} className="driver-clay-card p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-black text-slate-700">{job.workOrderNo || '-'}</p>
                  <p className="truncate text-xs text-slate-500">Job No.: {job.jobNo || '-'}</p>
                </div>
                <span className="driver-clay-chip bg-slate-100/85 text-slate-700">{job.rounds || 0} รอบ</span>
              </div>

              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <CalendarClock size={14} className="driver-clay-muted" />
                  <span>วันที่งาน: {formatDate(job.date)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin size={14} className="driver-clay-muted mt-0.5" />
                  <div className="min-w-0 space-y-1">
                    <p className="truncate">รับ: {job.pickupLocation || '-'}</p>
                    <p className="truncate">ส่ง: {job.dropoffLocation || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Truck size={14} className="driver-clay-muted" />
                  <span>รถ: {job.vehicleType || '-'} | ทะเบียน: {job.licensePlate || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <UserRound size={14} className="driver-clay-muted" />
                  <span>พนักงานขับรถ: {job.driverName || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText size={14} className="driver-clay-muted" />
                  <span>Invoice No.: {job.invNo || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Fuel size={14} className="driver-clay-muted" />
                  <span>
                    ค่าน้ำมัน/ทางด่วน:{' '}
                    {job.fuelAndToll !== null && job.fuelAndToll !== undefined && job.fuelAndToll !== ''
                      ? Number(job.fuelAndToll).toLocaleString('en-US')
                      : '-'}
                  </span>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
};

export default DriverDataTable;
