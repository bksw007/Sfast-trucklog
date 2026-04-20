import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Eye,
  FileText,
  Fuel,
  Image as ImageIcon,
  MapPin,
  Package2,
  Search,
  Truck,
  UserRound,
} from 'lucide-react';
import Modal from '../components/Modal';
import { useAuth } from '../contexts/AuthContext';
import { fetchDriverJobsByMonth } from '../services/firebaseService';
import { JobEntry } from '../types';
import { formatDate } from '../utils/formatters';

const normalizeText = (value: string) => value.trim().toLowerCase();
const dateKey = (date: string) => (date || '').split('T')[0];
const resolveRounds = (job: Pick<JobEntry, 'rounds'>) =>
  typeof job.rounds === 'number' && Number.isFinite(job.rounds) ? job.rounds : 0;
const getCurrentMonthYear = () => {
  const now = new Date();
  return {
    month: String(now.getMonth() + 1).padStart(2, '0'),
    year: String(now.getFullYear()),
  };
};

const getJobImageSections = (job: JobEntry) => {
  const toUniqueUrls = (urls?: string[], single?: string) =>
    Array.from(
      new Set(
        [...(Array.isArray(urls) ? urls : []), single || '']
          .map((url) => (url || '').trim())
          .filter(Boolean)
      )
    );

  return [
    { title: 'รูปภาพต้นทาง', urls: toUniqueUrls(job.originImageUrls, job.originImageUrl || job.imageUrl) },
    { title: 'รูปภาพปลายทาง', urls: toUniqueUrls(job.destinationImageUrls, job.destinationImageUrl) },
    { title: 'รูปภาพเอกสาร', urls: toUniqueUrls(job.documentImageUrls, job.documentImageUrl) },
  ].filter((section) => section.urls.length > 0);
};

const DriverDataTable: React.FC = () => {
  const { userProfile, user } = useAuth();
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchText, setSearchText] = useState('');
  const [monthFilter, setMonthFilter] = useState(getCurrentMonthYear().month);
  const [yearFilter, setYearFilter] = useState(getCurrentMonthYear().year);
  const [selectedJob, setSelectedJob] = useState<JobEntry | null>(null);

  const driverNameCandidates = useMemo(
    () =>
      Array.from(
        new Set(
          [
            userProfile?.fullName,
            userProfile?.displayName,
            userProfile?.nickname,
            user?.email?.split('@')[0],
          ]
            .map((value) => (value || '').trim())
            .filter(Boolean)
        )
      ),
    [user?.email, userProfile?.displayName, userProfile?.fullName, userProfile?.nickname]
  );
  const canLookupJobs = Boolean(user?.uid) || driverNameCandidates.length > 0;

  useEffect(() => {
    if (!canLookupJobs || !monthFilter || !yearFilter) {
      setJobs([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setErrorMessage('');
    let cancelled = false;

    fetchDriverJobsByMonth(
      Number(yearFilter),
      Number(monthFilter),
      user?.uid,
      driverNameCandidates
    )
      .then((rows) => {
        if (cancelled) return;
        setJobs(rows);
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Driver data table fetch failed:', error);
        setErrorMessage(error.message || 'โหลดข้อมูลงานวิ่งไม่สำเร็จ');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canLookupJobs, driverNameCandidates, monthFilter, yearFilter, user?.uid]);

  const yearOptions = useMemo(() => {
    const currentYear = Number(getCurrentMonthYear().year);
    return Array.from({ length: 6 }, (_, index) => String(currentYear - index));
  }, []);

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
          job.productName,
          job.remarks,
        ]
          .map((value) => value || '')
          .join(' ')
      );

      return haystack.includes(search);
    });
  }, [jobs, monthFilter, searchText, yearFilter]);

  const totalRounds = useMemo(
    () => filteredJobs.reduce((sum, job) => sum + (Number(job.rounds) || 0), 0),
    [filteredJobs]
  );

  const totalFuelAndToll = useMemo(
    () =>
      filteredJobs.reduce((sum, job) => {
        const value = Number(job.fuelAndToll);
        return Number.isFinite(value) ? sum + value : sum;
      }, 0),
    [filteredJobs]
  );

  if (!canLookupJobs) {
    return (
      <section className="driver-clay-card p-5 sm:p-6">
        <h2 className="text-2xl font-black text-slate-700">ข้อมูลงานวิ่งของฉัน</h2>
        <p className="mt-2 text-sm text-slate-500">
          กรุณาตั้งค่าชื่อในหน้าโปรไฟล์ก่อน เพื่อให้ระบบค้นหาประวัติงานของคุณได้ถูกต้อง
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <section className="driver-clay-card p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">My Records</p>
          <h2 className="mt-1 text-2xl font-black text-slate-700">ข้อมูลงานวิ่งของฉัน</h2>
          <p className="mt-1 text-sm text-slate-500">
            {driverNameCandidates.length > 0
              ? `ค้นหาด้วยบัญชีนี้และชื่อที่เกี่ยวข้อง ${driverNameCandidates.join(' / ')}`
              : 'ค้นหาจากบัญชีผู้ใช้ที่กำลังเข้าสู่ระบบ'}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <SummaryCard label="จำนวนงาน" value={filteredJobs.length} />
            <SummaryCard label="จำนวนรอบรวม" value={totalRounds} />
            <SummaryCard label="ค่าน้ำมันรวม" value={Number(totalFuelAndToll.toFixed(0))} />
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
              className="driver-clay-input w-full pl-10 pr-3 py-2.5 text-base"
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <select
              value={monthFilter}
              onChange={(event) => setMonthFilter(event.target.value)}
              className="driver-clay-input w-full py-2.5 text-base"
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
              className="driver-clay-input w-full py-2.5 text-base"
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
            filteredJobs.map((job) => {
              return (
                <article
                  key={job.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedJob(job)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedJob(job);
                    }
                  }}
                  className="driver-clay-card cursor-pointer p-4 transition hover:-translate-y-[1px] sm:p-5"
                >
                  <div className="min-w-0">
                    <p className="break-words text-base font-black text-slate-700">
                      {formatDate(job.date)}
                    </p>
                    <p className="mt-1 break-words text-sm font-semibold text-slate-600">
                      {job.productName || '-'}
                    </p>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-slate-700">
                    <DetailRow
                      icon={<MapPin size={14} className="driver-clay-muted mt-0.5" />}
                      value={`รับ: ${job.pickupLocation || '-'}`}
                    />
                    <DetailRow
                      icon={<MapPin size={14} className="driver-clay-muted mt-0.5" />}
                      value={`ส่ง: ${job.dropoffLocation || '-'}`}
                    />
                    <DetailRow
                      icon={<Truck size={14} className="driver-clay-muted" />}
                      value={`รถ: ${job.vehicleType || '-'} | ทะเบียน: ${job.licensePlate || '-'}`}
                    />
                  </div>
                  <p className="driver-clay-muted mt-3 text-xs">แตะการ์ดเพื่อดูรายละเอียดงาน</p>
                </article>
              );
            })
          )}
        </div>
      </div>

      <Modal
        isOpen={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        title="รายละเอียดงาน"
        panelClassName="max-w-2xl"
        bodyClassName="hide-scrollbar max-h-[calc(100dvh-8rem)] space-y-4 overflow-y-auto pr-1"
      >
        {selectedJob && (
          <div className="space-y-4 text-sm text-slate-700">
            <div className="space-y-3">
              <DetailRow
                icon={<FileText size={15} className="driver-clay-muted" />}
                value={`เลขที่ใบแจ้งงาน: ${selectedJob.workOrderNo || '-'}`}
              />
              <DetailRow
                icon={<CalendarClock size={15} className="driver-clay-muted" />}
                value={`วันที่งาน: ${formatDate(selectedJob.date)}`}
              />
              <DetailRow
                icon={<Package2 size={15} className="driver-clay-muted" />}
                value={`ประเภทสินค้า: ${selectedJob.productName || '-'}`}
              />
              <DetailRow
                icon={<MapPin size={15} className="driver-clay-muted mt-0.5" />}
                value={`จุดรับ: ${selectedJob.pickupLocation || '-'}`}
              />
              <DetailRow
                icon={<MapPin size={15} className="driver-clay-muted mt-0.5" />}
                value={`จุดส่ง: ${selectedJob.dropoffLocation || '-'}`}
              />
              <DetailRow
                icon={<Truck size={15} className="driver-clay-muted" />}
                value={`รถ: ${selectedJob.vehicleType || '-'} | ทะเบียน: ${selectedJob.licensePlate || '-'}`}
              />
              <DetailRow
                icon={<UserRound size={15} className="driver-clay-muted" />}
                value={`พนักงานขับรถ: ${selectedJob.driverName || '-'}`}
              />
              <DetailRow
                icon={<Package2 size={15} className="driver-clay-muted" />}
                value={`จำนวนรอบ: ${resolveRounds(selectedJob)}`}
              />
              <DetailRow
                icon={<FileText size={15} className="driver-clay-muted" />}
                value={`Job No.: ${selectedJob.jobNo || '-'}`}
              />
              <DetailRow
                icon={<FileText size={15} className="driver-clay-muted" />}
                value={`Invoice No.: ${selectedJob.invNo || '-'}`}
              />
              <DetailRow
                icon={<FileText size={15} className="driver-clay-muted" />}
                value={`เลขที่ใบขนส่ง: ${selectedJob.transportDocNo || '-'}`}
              />
              <DetailRow
                icon={<Fuel size={15} className="driver-clay-muted" />}
                value={`ค่าน้ำมัน/ทางด่วน: ${
                  selectedJob.fuelAndToll !== null && selectedJob.fuelAndToll !== undefined && selectedJob.fuelAndToll !== ''
                    ? Number(selectedJob.fuelAndToll).toLocaleString('en-US')
                    : '-'
                }`}
              />
            </div>

            {getJobImageSections(selectedJob).map((section) => (
              <div key={section.title} className="space-y-3">
                <DetailRow
                  icon={<ImageIcon size={16} className="driver-clay-muted" />}
                  value={`${section.title} (${section.urls.length})`}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {section.urls.map((url, index) => (
                    <button
                      key={`${section.title}-${index}`}
                      type="button"
                      onClick={() => window.open(url, '_blank')}
                      className="overflow-hidden rounded-2xl border border-white/80 text-left"
                    >
                      <img src={url} alt={`${section.title} ${index + 1}`} className="h-44 w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
};

const SummaryCard: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="driver-clay-soft rounded-2xl p-3 text-center">
    <p className="text-xs text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-black text-slate-700">{value.toLocaleString('en-US')}</p>
  </div>
);

const DetailRow: React.FC<{ icon: React.ReactNode; value: string }> = ({ icon, value }) => (
  <div className="flex items-start gap-2">
    <div className="mt-0.5 shrink-0">{icon}</div>
    <div className="min-w-0 break-words leading-relaxed">{value}</div>
  </div>
);

export default DriverDataTable;
