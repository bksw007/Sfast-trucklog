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
import { subscribeToJobsByDriverNames } from '../services/firebaseService';
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
  const [expandedJobIds, setExpandedJobIds] = useState<string[]>([]);
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

  useEffect(() => {
    if (driverNameCandidates.length === 0) {
      setJobs([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setErrorMessage('');

    const unsubscribe = subscribeToJobsByDriverNames(
      driverNameCandidates,
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
  }, [driverNameCandidates]);

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

  const toggleExpanded = (jobId: string) => {
    setExpandedJobIds((prev) =>
      prev.includes(jobId)
        ? prev.filter((id) => id !== jobId)
        : [...prev, jobId]
    );
  };

  if (driverNameCandidates.length === 0) {
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
            ค้นหาด้วยชื่อที่เกี่ยวข้องกับบัญชีนี้ {driverNameCandidates.join(' / ')}
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
              const expanded = expandedJobIds.includes(job.id);
              const imageSections = getJobImageSections(job);

              return (
                <article
                  key={job.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpanded(job.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggleExpanded(job.id);
                    }
                  }}
                  className="driver-clay-card cursor-pointer p-4 transition hover:-translate-y-[1px] sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-base font-black text-slate-700">{job.workOrderNo || '-'}</p>
                      <p className="mt-1 break-words text-sm font-semibold text-slate-600">{job.productName || '-'}</p>
                      <p className="mt-1 break-words text-xs text-slate-500">Job No.: {job.jobNo || '-'}</p>
                    </div>
                    <span className="driver-clay-chip whitespace-nowrap bg-slate-100/85 text-slate-700">
                      {job.rounds || 0} รอบ
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-slate-700">
                    <DetailRow
                      icon={<CalendarClock size={14} className="driver-clay-muted" />}
                      value={`วันที่งาน: ${formatDate(job.date)}`}
                    />
                    <DetailRow
                      icon={<MapPin size={14} className="driver-clay-muted mt-0.5" />}
                      value={`รับ: ${job.pickupLocation || '-'}`}
                    />
                    <DetailRow
                      icon={<MapPin size={14} className="driver-clay-muted mt-0.5" />}
                      value={`ส่ง: ${job.dropoffLocation || '-'}`}
                    />
                  </div>

                  {expanded && (
                    <div className="mt-4 space-y-2 border-t border-white/70 pt-4 text-sm text-slate-700">
                      <DetailRow
                        icon={<Truck size={14} className="driver-clay-muted" />}
                        value={`รถ: ${job.vehicleType || '-'} | ทะเบียน: ${job.licensePlate || '-'}`}
                      />
                      <DetailRow
                        icon={<UserRound size={14} className="driver-clay-muted" />}
                        value={`พนักงานขับรถ: ${job.driverName || '-'}`}
                      />
                      <DetailRow
                        icon={<FileText size={14} className="driver-clay-muted" />}
                        value={`Invoice No.: ${job.invNo || '-'}`}
                      />
                      <DetailRow
                        icon={<Package2 size={14} className="driver-clay-muted" />}
                        value={`จำนวนรอบ: ${job.rounds || 0}`}
                      />
                      <DetailRow
                        icon={<Fuel size={14} className="driver-clay-muted" />}
                        value={`ค่าน้ำมัน/ทางด่วน: ${
                          job.fuelAndToll !== null && job.fuelAndToll !== undefined && job.fuelAndToll !== ''
                            ? Number(job.fuelAndToll).toLocaleString('en-US')
                            : '-'
                        }`}
                      />
                      {job.remarks && (
                        <div className="driver-clay-soft px-3 py-2 text-xs leading-relaxed text-slate-600">
                          หมายเหตุ: {job.remarks}
                        </div>
                      )}
                      {imageSections.length > 0 && (
                        <div className="driver-clay-soft px-3 py-2 text-xs text-slate-600">
                          รูปแนบทั้งหมด {imageSections.reduce((sum, section) => sum + section.urls.length, 0)} รูป
                        </div>
                      )}
                    </div>
                  )}

                  {expanded && (
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedJob(job);
                        }}
                        className="driver-clay-btn driver-clay-btn-ghost"
                      >
                        <Eye size={15} />
                        ดูรายละเอียด
                      </button>
                    </div>
                  )}

                  <p className="driver-clay-muted mt-3 text-xs">
                    แตะการ์ดเพื่อ{expanded ? 'ย่อ' : 'ขยาย'}รายละเอียด
                  </p>
                </article>
              );
            })
          )}
        </div>
      </div>

      <Modal
        isOpen={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        title={selectedJob?.workOrderNo || 'รายละเอียดงานวิ่ง'}
        panelClassName="max-w-2xl"
        bodyClassName="max-h-[calc(100dvh-8rem)] space-y-4 overflow-y-auto pr-1"
      >
        {selectedJob && (
          <div className="space-y-4 text-sm text-slate-700">
            <div className="driver-clay-soft rounded-2xl p-4">
              <p className="break-words text-base font-black text-slate-700">{selectedJob.workOrderNo || '-'}</p>
              <p className="mt-1 break-words text-sm font-semibold text-slate-600">{selectedJob.productName || '-'}</p>
              <p className="mt-1 break-words text-xs text-slate-500">Job No.: {selectedJob.jobNo || '-'}</p>
            </div>

            <div className="space-y-3">
              <DetailRow
                icon={<CalendarClock size={15} className="driver-clay-muted" />}
                value={`วันที่งาน: ${formatDate(selectedJob.date)}`}
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
                value={`จำนวนรอบ: ${selectedJob.rounds || 0}`}
              />
              <DetailRow
                icon={<FileText size={15} className="driver-clay-muted" />}
                value={`Invoice No.: ${selectedJob.invNo || '-'}`}
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

            {selectedJob.remarks && (
              <div className="driver-clay-soft rounded-2xl p-4">
                <p className="mb-2 text-sm font-semibold text-slate-700">หมายเหตุ</p>
                <p className="break-words text-sm leading-relaxed text-slate-600">{selectedJob.remarks}</p>
              </div>
            )}

            {getJobImageSections(selectedJob).map((section) => (
              <div key={section.title} className="driver-clay-soft rounded-2xl p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ImageIcon size={16} className="driver-clay-muted" />
                  <p className="text-sm font-semibold text-slate-700">
                    {section.title} ({section.urls.length})
                  </p>
                </div>
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
