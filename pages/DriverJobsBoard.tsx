import React, { useEffect, useMemo, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  CircleDashed,
  Clock3,
  Eye,
  FileText,
  Image as ImageIcon,
  MapPin,
  Package2,
  Search,
  Truck,
  UserRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchTodayJobsByAssigneeAndPickupDateRange,
  subscribeToTodayJobsByAssigneeAndPickupDateRange,
  triggerTodayJobNotification,
  updateTodayJob,
} from '../services/firebaseService';
import { TodayJobEntry } from '../types';

export type DriverView = 'today' | 'active' | 'ready-to-close' | 'history';

type JobStatus = TodayJobEntry['status'];

interface DriverJobsBoardProps {
  view: DriverView;
}

const asDateOnly = (dateStr: string) => (dateStr || '').split('T')[0];
const getJobDate = (job: Pick<TodayJobEntry, 'pickup'>) =>
  asDateOnly(job.pickup?.date || '');

const getLocalDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split('T')[0];
};

const getMonthKey = (dateStr = getLocalDate()) => asDateOnly(dateStr).slice(0, 7);

const shiftMonthKey = (monthKey: string, offset: number) => {
  const [yearPart, monthPart] = monthKey.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return getMonthKey();

  const shifted = new Date(year, month - 1 + offset, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
};

const getMonthRange = (monthKey: string) => ({
  startDate: `${monthKey}-01`,
  endDateExclusive: `${shiftMonthKey(monthKey, 1)}-01`,
});

const addDays = (dateStr: string, days: number) => {
  const base = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(base.getTime())) return dateStr;
  base.setDate(base.getDate() + days);
  return base.toISOString().split('T')[0];
};

const normalizeText = (value: string) => value.trim().toLowerCase();
const hasValue = (value?: string) => !!value && value.trim().length > 0;
const parseRounds = (value?: string) => {
  const match = (value || '').match(/(\d+(\.\d+)?)/);
  if (!match) return 1;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};
const resolveRounds = (job: Pick<TodayJobEntry, 'rounds' | 'quantity'>) =>
  typeof job.rounds === 'number' && Number.isFinite(job.rounds) && job.rounds > 0
    ? job.rounds
    : parseRounds(job.quantity);

const parsePickupTimestamp = (job: TodayJobEntry): number => {
  const datePart = getJobDate(job).trim();
  if (!datePart) return Number.POSITIVE_INFINITY;

  const pickupTime = (job.pickup?.time || '').trim();
  const timePart = pickupTime ? `${pickupTime}:00` : '00:00:00';
  const parsed = new Date(`${datePart}T${timePart}`).getTime();
  if (Number.isNaN(parsed)) return Number.POSITIVE_INFINITY;
  return parsed;
};

const parseRoundSuffix = (job: TodayJobEntry): number => {
  const workOrder = (job.workOrderNo || job.ticketNo || '').trim();
  const matched = /-R(\d+)\b/i.exec(workOrder);
  if (!matched) return Number.POSITIVE_INFINITY;
  const parsed = Number(matched[1]);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};

const compareByPickupSchedule = (a: TodayJobEntry, b: TodayJobEntry): number => {
  const now = Date.now();
  const timeA = parsePickupTimestamp(a);
  const timeB = parsePickupTimestamp(b);

  const isFutureA = Number.isFinite(timeA) && timeA >= now;
  const isFutureB = Number.isFinite(timeB) && timeB >= now;

  if (isFutureA !== isFutureB) {
    return isFutureA ? -1 : 1;
  }

  if (isFutureA && isFutureB) {
    const diffToNowA = timeA - now;
    const diffToNowB = timeB - now;
    if (diffToNowA !== diffToNowB) return diffToNowA - diffToNowB;
  } else if (timeA !== timeB) {
    return timeB - timeA;
  }

  const roundA = parseRoundSuffix(a);
  const roundB = parseRoundSuffix(b);
  if (roundA !== roundB) return roundA - roundB;

  return (a.workOrderNo || a.ticketNo || '').localeCompare(b.workOrderNo || b.ticketNo || '');
};

const compareHistoryJobs = (a: TodayJobEntry, b: TodayJobEntry) =>
  (b.completedAt || parsePickupTimestamp(b) || 0) - (a.completedAt || parsePickupTimestamp(a) || 0);

const getDatePriority = (jobDate: string, todayDate: string) => {
  if (jobDate === todayDate) return 0;
  if (jobDate > todayDate) return 1;
  return 2;
};

const getStatusPriority = (job: TodayJobEntry, todayDate: string) => {
  if (job.status === 'in_progress') return 0;
  const jobDate = getJobDate(job);
  if (job.status === 'pending' && jobDate === todayDate) return 1;
  if (job.status === 'pending' && jobDate > todayDate) return 2;
  return 3;
};

const compareDriverQueue = (a: TodayJobEntry, b: TodayJobEntry, todayDate: string) => {
  const datePriorityDiff = getDatePriority(getJobDate(a), todayDate) - getDatePriority(getJobDate(b), todayDate);
  if (datePriorityDiff !== 0) return datePriorityDiff;

  const statusPriorityDiff = getStatusPriority(a, todayDate) - getStatusPriority(b, todayDate);
  if (statusPriorityDiff !== 0) return statusPriorityDiff;

  return compareByPickupSchedule(a, b);
};

const getFutureDayOffset = (jobDate: string, todayDate: string) => {
  const start = new Date(`${todayDate}T00:00:00`).getTime();
  const end = new Date(`${jobDate}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86400000);
};

const isFutureJob = (jobDate: string, todayDate: string) => jobDate > todayDate;

const matchesSearch = (job: TodayJobEntry, search: string) => {
  if (!search) return true;

  const haystack = normalizeText(
    [
      job.jobNo,
      job.workOrderNo,
      job.ticketNo,
      job.invNo,
      job.employerCompany,
      job.productName,
      job.plateNo,
      job.pickup.location,
      job.delivery.location,
      job.importantNote,
    ]
      .map((value) => value || '')
      .join(' ')
  );

  return haystack.includes(search);
};

const getJobImageSections = (job: TodayJobEntry) => {
  const toUniqueUrls = (urls?: string[], single?: string) =>
    Array.from(
      new Set(
        [...(Array.isArray(urls) ? urls : []), single || '']
          .map((url) => (url || '').trim())
          .filter(Boolean)
      )
    );

  return [
    { title: 'รูปภาพต้นทาง', urls: toUniqueUrls(job.originImageUrls, job.originImageUrl) },
    { title: 'รูปภาพปลายทาง', urls: toUniqueUrls(job.destinationImageUrls, job.destinationImageUrl) },
    { title: 'รูปภาพเอกสาร', urls: toUniqueUrls(job.documentImageUrls, job.documentImageUrl) },
  ].filter((section) => section.urls.length > 0);
};

const statusLabelMap: Record<JobStatus, string> = {
  pending: 'รอรับงาน',
  in_progress: 'กำลังทำงาน',
  completed: 'เสร็จงาน',
};

const viewMetaMap: Record<DriverView, { title: string; subtitle: string }> = {
  today: {
    title: 'งานวันนี้ของฉัน',
    subtitle: 'รวมงานวันนี้ งานค้าง และงานล่วงหน้าอีก 7 วัน',
  },
  active: {
    title: 'งานที่กำลังทำ',
    subtitle: 'งานที่รับแล้วและกำลังดำเนินการอยู่ในตอนนี้',
  },
  'ready-to-close': {
    title: 'กำลังทำงาน',
    subtitle: 'งานที่คุณรับแล้วและกำลังดำเนินการอยู่',
  },
  history: {
    title: 'สรุปงานของฉัน',
    subtitle: 'สรุปงานของฉันในเดือนนี้',
  },
};

const DriverJobsBoard: React.FC<DriverJobsBoardProps> = ({ view }) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<TodayJobEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchText, setSearchText] = useState('');
  const [expandedJobIds, setExpandedJobIds] = useState<string[]>([]);
  const [selectedJob, setSelectedJob] = useState<TodayJobEntry | null>(null);
  const [updatingJobId, setUpdatingJobId] = useState<string | null>(null);

  const todayDate = asDateOnly(getLocalDate());
  const currentMonthKey = getMonthKey(todayDate);
  const currentMonthRange = useMemo(() => getMonthRange(currentMonthKey), [currentMonthKey]);
  const upcomingLimitDate = useMemo(() => addDays(todayDate, 7), [todayDate]);
  const driverRange = useMemo(
    () => ({
      startDate: `${shiftMonthKey(currentMonthKey, -1)}-01`,
      endDateExclusive: addDays(todayDate, 8),
    }),
    [currentMonthKey, todayDate]
  );

  useEffect(() => {
    setExpandedJobIds([]);
    setSelectedJob(null);
  }, [view]);

  useEffect(() => {
    if (!user?.uid) {
      setJobs([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setErrorMessage('');

    const range = view === 'history' ? currentMonthRange : driverRange;

    if (view === 'history') {
      let cancelled = false;
      fetchTodayJobsByAssigneeAndPickupDateRange(
        user.uid,
        range.startDate,
        range.endDateExclusive
      )
        .then((rows) => {
          if (cancelled) return;
          setJobs(rows);
          setLoading(false);
        })
        .catch((error) => {
          if (cancelled) return;
          console.error('Driver jobs history fetch failed:', error);
          setErrorMessage(error.message);
          setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }

    const unsubscribe = subscribeToTodayJobsByAssigneeAndPickupDateRange(
      user.uid,
      range.startDate,
      range.endDateExclusive,
      (rows) => {
        setJobs(rows);
        setLoading(false);
      },
      (error) => {
        console.error('Driver jobs subscribe failed:', error);
        setErrorMessage(error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentMonthRange, driverRange, user?.uid, view]);

  const search = useMemo(() => normalizeText(searchText), [searchText]);
  const myJobs = useMemo(() => jobs, [jobs]);

  const todayJobs = useMemo(
    () => myJobs.filter((job) => getJobDate(job) === todayDate && job.status === 'pending'),
    [myJobs, todayDate]
  );
  const upcomingJobs = useMemo(
    () =>
      myJobs.filter((job) => {
        const jobDate = getJobDate(job);
        return job.status === 'pending' && jobDate > todayDate && jobDate <= upcomingLimitDate;
      }),
    [myJobs, todayDate, upcomingLimitDate]
  );
  const inProgressJobs = useMemo(
    () => myJobs.filter((job) => job.status === 'in_progress'),
    [myJobs]
  );
  const readyToCloseJobs = useMemo(
    () => myJobs.filter((job) => job.status === 'in_progress' && !!job.readyToClose),
    [myJobs]
  );
  const historyJobs = useMemo(
    () => myJobs.filter((job) => job.status === 'completed'),
    [myJobs]
  );

  const filteredHistoryJobs = useMemo(
    () => historyJobs.filter((job) => matchesSearch(job, search)),
    [historyJobs, search]
  );
  const filteredActiveJobs = useMemo(
    () => myJobs.filter((job) => job.status === 'in_progress' && matchesSearch(job, search)),
    [myJobs, search]
  );
  const filteredReadyToCloseJobs = useMemo(
    () => readyToCloseJobs.filter((job) => matchesSearch(job, search)),
    [readyToCloseJobs, search]
  );
  const filteredTodayJobs = useMemo(
    () =>
      myJobs.filter((job) => {
        if (job.status !== 'pending') return false;
        const jobDate = getJobDate(job);
        if (!jobDate || jobDate > upcomingLimitDate) return false;
        return matchesSearch(job, search);
      }),
    [myJobs, upcomingLimitDate, search]
  );

  const jobsByView = useMemo(() => {
    if (view === 'today') return [...filteredTodayJobs].sort((a, b) => compareDriverQueue(a, b, todayDate));
    if (view === 'active') return [...filteredActiveJobs].sort((a, b) => compareDriverQueue(a, b, todayDate));
    if (view === 'ready-to-close') return [...filteredReadyToCloseJobs].sort((a, b) => compareDriverQueue(a, b, todayDate));
    return [...filteredHistoryJobs].sort(compareHistoryJobs);
  }, [filteredActiveJobs, filteredHistoryJobs, filteredReadyToCloseJobs, filteredTodayJobs, todayDate, view]);

  const toggleExpanded = (jobId: string) => {
    setExpandedJobIds((prev) =>
      prev.includes(jobId)
        ? prev.filter((id) => id !== jobId)
        : [...prev, jobId]
    );
  };

  const handleAcceptJob = async (job: TodayJobEntry) => {
    const jobDate = getJobDate(job);
    if (!user?.uid || updatingJobId || !jobDate || jobDate > todayDate) return;
    setUpdatingJobId(job.id);

    try {
      await updateTodayJob(job.id, {
        status: 'in_progress',
        readyToClose: false,
        readyToCloseAt: null,
        completedAt: null,
        driverUpdateCount: 0,
        acceptedAt: Date.now(),
        acceptedByUid: user.uid,
        lastSavedAt: Date.now(),
        updatedByUid: user.uid,
      });
      try {
        await triggerTodayJobNotification('accept', job.id);
      } catch (notifyError) {
        console.error('Notify accept event failed:', notifyError);
      }
    } catch (error) {
      console.error('Accept job failed:', error);
      if (error instanceof FirebaseError) {
        alert(`รับงานไม่สำเร็จ: ${error.code}`);
      } else {
        alert('รับงานไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
      setUpdatingJobId(null);
    }
  };

  const handleCompleteJob = async (job: TodayJobEntry) => {
    if (!user?.uid || updatingJobId) return;
    setUpdatingJobId(job.id);

    try {
      await updateTodayJob(job.id, {
        status: 'completed',
        readyToClose: false,
        readyToCloseAt: null,
        completedAt: Date.now(),
        completedByUid: user.uid,
        lastSavedAt: Date.now(),
        updatedByUid: user.uid,
      });
      try {
        await triggerTodayJobNotification('complete', job.id);
      } catch (notifyError) {
        console.error('Notify complete event failed:', notifyError);
      }
    } catch (error) {
      console.error('Complete job failed:', error);
      if (error instanceof FirebaseError) {
        alert(`จบงานไม่สำเร็จ: ${error.code}`);
      } else {
        alert('จบงานไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
      setUpdatingJobId(null);
    }
  };

  const handleOpenEntryForm = (job: TodayJobEntry) => {
    navigate(`/driver/entry?jobId=${encodeURIComponent(job.id)}`, {
      state: {
        fromTodayJob: {
          id: job.id,
          jobNo: job.jobNo || '',
          invNo: job.invNo || '',
          transportDocNo: job.transportDocNo || '',
          date: getJobDate(job),
          pickupLocation: job.pickup.location || '',
          dropoffLocation: job.delivery.location || '',
          vehicleType: job.vehicleType || '',
          licensePlate: job.plateNo || '',
          driverName: job.driverName || '',
          workOrderNo: job.workOrderNo || job.ticketNo || '',
          rounds: resolveRounds(job),
          productName: job.productName || '',
        },
      },
    });
  };

  const statusBadgeClass = (status: JobStatus) =>
    status === 'completed'
      ? 'bg-emerald-100/90 text-emerald-700'
      : status === 'in_progress'
        ? 'bg-amber-100/90 text-amber-700'
        : 'bg-slate-100/95 text-slate-600';

  const statusIcon = (status: JobStatus) => {
    if (status === 'completed') return <CheckCircle2 size={13} />;
    if (status === 'in_progress') return <CircleDashed size={13} />;
    return <Circle size={13} />;
  };

  const cardClass = 'driver-clay-card p-4 sm:p-5';
  const inputClass = 'driver-clay-input px-3 py-2.5 text-[16px] md:text-base';
  const { title, subtitle } = viewMetaMap[view];

  return (
    <>
      <section className="space-y-4">
        <div className={cardClass}>
          <h1 className="text-lg font-black tracking-tight text-slate-700">{title}</h1>
          <p className="driver-clay-muted mt-1 text-sm">{subtitle}</p>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryCard label="งานวันนี้" value={todayJobs.length} />
            <SummaryCard label="งานล่วงหน้า" value={upcomingJobs.length} />
            <SummaryCard label="กำลังทำ" value={inProgressJobs.length} />
            <SummaryCard label="จบแล้ว" value={historyJobs.length} />
          </div>
        </div>

        <div className={cardClass}>
          <div className="relative">
            <Search size={16} className="driver-clay-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className={`pl-9 ${inputClass}`}
              placeholder="ค้นหาเลขงาน, ลูกค้า, สินค้า, จุดรับ/ส่ง"
            />
          </div>
        </div>

        {loading && (
          <div className={cardClass}>
            <p className="driver-clay-muted text-sm">กำลังโหลดงาน...</p>
          </div>
        )}

        {!loading && errorMessage && (
          <div className="driver-clay-card rounded-2xl border-red-300 bg-red-100/80 px-4 py-3 text-sm text-red-600">
            โหลดข้อมูลงานไม่สำเร็จ: {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && jobsByView.length === 0 && (
          <div className={cardClass}>
            <p className="driver-clay-muted text-sm">
              ยังไม่มีงานในรายการนี้ หรือยังไม่มีงานที่มอบหมายให้บัญชีนี้
            </p>
          </div>
        )}

        {!loading &&
          !errorMessage &&
          jobsByView.map((job) => {
            const jobDate = getJobDate(job);
            const expanded = expandedJobIds.includes(job.id);
            const futureOffset = getFutureDayOffset(jobDate, todayDate);
            const isFutureScheduled = view === 'today' && futureOffset > 0;
            const isTodayScheduled = view === 'today' && jobDate === todayDate;
            const isOverdueScheduled = view === 'today' && !!jobDate && jobDate < todayDate;
            const canAcceptNow =
              job.status === 'pending' &&
              !!jobDate &&
              jobDate <= todayDate;
            const isFutureLockedPending = job.status === 'pending' && !!jobDate && jobDate > todayDate;
            const canUpdateJob =
              job.status === 'in_progress' &&
              (view === 'active' || view === 'ready-to-close');
            const canCompleteJob =
              job.status === 'in_progress' &&
              job.readyToClose &&
              (view === 'active' || view === 'ready-to-close');
            const imageSections = getJobImageSections(job);
            const futureToneClass = isFutureScheduled
              ? 'border border-sky-300/90 bg-[linear-gradient(145deg,rgba(224,242,254,0.96),rgba(240,249,255,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),10px_10px_22px_rgba(125,171,203,0.18),-8px_-8px_18px_rgba(255,255,255,0.88)]'
              : '';
            const todayToneClass = isTodayScheduled
              ? 'border border-orange-200/90 bg-[linear-gradient(145deg,rgba(255,247,237,0.98),rgba(255,251,235,0.94))] shadow-[inset_0_1px_0_rgba(255,255,255,0.88),10px_10px_22px_rgba(215,176,126,0.14),-8px_-8px_18px_rgba(255,255,255,0.9)]'
              : '';
            const overdueToneClass = isOverdueScheduled
              ? 'border border-slate-300/90 bg-[linear-gradient(145deg,rgba(241,245,249,0.98),rgba(248,250,252,0.95))] shadow-[inset_0_1px_0_rgba(255,255,255,0.86),10px_10px_22px_rgba(148,163,184,0.16),-8px_-8px_18px_rgba(255,255,255,0.9)]'
              : '';
            const cardToneClass = futureToneClass || todayToneClass || overdueToneClass;

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
                className={`${cardClass} cursor-pointer transition hover:-translate-y-[1px] ${cardToneClass}`}
              >
                {isFutureScheduled && (
                  <div className="-mx-4 -mt-4 mb-3 flex items-center justify-between rounded-t-[1.45rem] border-b border-sky-200/80 bg-[linear-gradient(90deg,#0284c7,#38bdf8)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white sm:-mx-5 sm:-mt-5 sm:px-5">
                    <span>งานล่วงหน้า</span>
                    <span>อีก {futureOffset} วัน</span>
                  </div>
                )}
                {isTodayScheduled && (
                  <div className="-mx-4 -mt-4 mb-3 flex items-center justify-between rounded-t-[1.45rem] border-b border-orange-200/80 bg-[linear-gradient(90deg,#f59e0b,#fbbf24)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white sm:-mx-5 sm:-mt-5 sm:px-5">
                    <span>งานวันนี้</span>
                    <span>พร้อมดำเนินงาน</span>
                  </div>
                )}
                {isOverdueScheduled && (
                  <div className="-mx-4 -mt-4 mb-3 flex items-center justify-between rounded-t-[1.45rem] border-b border-slate-300/80 bg-[linear-gradient(90deg,#64748b,#94a3b8)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white sm:-mx-5 sm:-mt-5 sm:px-5">
                    <span>งานล่าช้า</span>
                    <span>ย้อนหลัง</span>
                  </div>
                )}

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-base font-black text-slate-700">
                      {job.employerCompany || '-'}
                    </p>
                    <p className="mt-1 break-words text-sm font-semibold text-slate-600">
                      {job.productName || '-'}
                    </p>
                    <p className="driver-clay-muted mt-1 break-words text-xs">
                      เลขที่ใบสั่งงาน: {job.workOrderNo || job.ticketNo || '-'}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={`driver-clay-chip whitespace-nowrap ${statusBadgeClass(job.status)}`}>
                      {statusIcon(job.status)}
                      {statusLabelMap[job.status]}
                    </span>
                    {job.status === 'in_progress' && job.readyToClose && (
                      <span className="driver-clay-chip whitespace-nowrap bg-indigo-100/90 text-indigo-700">
                        <CheckCircle2 size={13} />
                        รอจบงาน
                      </span>
                    )}
                    {isFutureScheduled && (
                      <span className="driver-clay-chip whitespace-nowrap border border-sky-200/70 bg-white/75 text-sky-700">
                        นัดล่วงหน้า
                      </span>
                    )}
                    {isTodayScheduled && (
                      <span className="driver-clay-chip whitespace-nowrap border border-orange-200/80 bg-white/80 text-orange-700">
                        วันนี้
                      </span>
                    )}
                    {isOverdueScheduled && (
                      <span className="driver-clay-chip whitespace-nowrap border border-slate-300/80 bg-white/80 text-slate-600">
                        ล่าช้า
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 text-[13px] text-slate-700 sm:mt-4 sm:space-y-2 sm:text-sm">
                  <DetailRow
                    icon={<CalendarClock size={14} className="driver-clay-muted" />}
                    value={
                      isFutureScheduled
                        ? `งานล่วงหน้า วันที่ ${jobDate || '-'}`
                        : `วันที่งาน: ${jobDate || '-'}`
                    }
                  />
                  <DetailRow
                    icon={<MapPin size={14} className="driver-clay-muted mt-0.5" />}
                    value={`รับ: ${job.pickup.location || '-'}`}
                  />
                  <DetailRow
                    icon={<MapPin size={14} className="driver-clay-muted mt-0.5" />}
                    value={`ส่ง: ${job.delivery.location || '-'}`}
                  />
                </div>

                {expanded && (
                  <div className="mt-3 space-y-2 border-t border-white/70 pt-3 text-[13px] text-slate-700 sm:mt-4 sm:pt-4 sm:text-sm">
                    <DetailRow
                      icon={<Clock3 size={14} className="driver-clay-muted" />}
                      value={`เวลารับ: ${`${job.pickup.date || '-'} ${job.pickup.time || ''}`.trim()}`}
                    />
                    <DetailRow
                      icon={<Clock3 size={14} className="driver-clay-muted" />}
                      value={`เวลาส่ง: ${`${job.delivery.date || '-'} ${job.delivery.time || ''}`.trim()}`}
                    />
                    {hasValue(job.pickup.contact) && (
                      <DetailRow
                        icon={<UserRound size={14} className="driver-clay-muted" />}
                        value={`ผู้ติดต่อจุดรับ: ${job.pickup.contact}`}
                      />
                    )}
                    {hasValue(job.delivery.contact) && (
                      <DetailRow
                        icon={<UserRound size={14} className="driver-clay-muted" />}
                        value={`ผู้ติดต่อจุดส่ง: ${job.delivery.contact}`}
                      />
                    )}
                    <DetailRow
                      icon={<Package2 size={14} className="driver-clay-muted" />}
                      value={`จำนวนรอบ: ${resolveRounds(job)}`}
                    />
                    <DetailRow
                      icon={<Truck size={14} className="driver-clay-muted" />}
                      value={`รถ: ${job.vehicleType || '-'} | ทะเบียน: ${job.plateNo || '-'}`}
                    />
                    {hasValue(job.jobNo) && (
                      <DetailRow
                        icon={<FileText size={14} className="driver-clay-muted" />}
                        value={`Job No.: ${job.jobNo}`}
                      />
                    )}
                    {hasValue(job.invNo) && (
                      <DetailRow
                        icon={<FileText size={14} className="driver-clay-muted" />}
                        value={`Invoice No.: ${job.invNo}`}
                      />
                    )}
                    {hasValue(job.transportDocNo) && (
                      <DetailRow
                        icon={<FileText size={14} className="driver-clay-muted" />}
                        value={`เลขที่ใบขนส่ง: ${job.transportDocNo}`}
                      />
                    )}
                    {job.fuelAndToll !== null && job.fuelAndToll !== undefined && job.fuelAndToll !== '' && (
                      <DetailRow
                        icon={<FileText size={14} className="driver-clay-muted" />}
                        value={`ค่าน้ำมัน/ทางด่วน: ${Number(job.fuelAndToll).toLocaleString('en-US')}`}
                      />
                    )}
                    {job.importantNote && (
                      <div className="driver-clay-soft driver-clay-muted mt-2 px-3 py-2 text-xs leading-relaxed">
                        หมายเหตุ: {job.importantNote}
                      </div>
                    )}
                    {imageSections.length > 0 && (
                      <div className="driver-clay-soft px-3 py-2 text-xs text-slate-600">
                        รูปแนบทั้งหมด {imageSections.reduce((sum, section) => sum + section.urls.length, 0)} รูป
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2">
                  {(canUpdateJob || canCompleteJob) && (
                    <div className={`grid gap-2 ${canUpdateJob && canCompleteJob ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {canUpdateJob && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenEntryForm(job);
                          }}
                          className="driver-clay-btn driver-clay-btn-warning min-h-[2.85rem] justify-center text-sm"
                        >
                          <CircleDashed size={15} />
                          อัพเดทข้อมูล
                        </button>
                      )}

                      {canCompleteJob && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleCompleteJob(job);
                          }}
                          disabled={updatingJobId === job.id}
                          className="driver-clay-btn driver-clay-btn-info min-h-[2.85rem] justify-center text-sm"
                        >
                          <CheckCircle2 size={15} />
                          {updatingJobId === job.id ? 'กำลังจบงาน...' : 'จบงาน'}
                        </button>
                      )}
                    </div>
                  )}

                  {job.status === 'pending' && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleAcceptJob(job);
                      }}
                      disabled={!canAcceptNow || updatingJobId === job.id}
                      className={`driver-clay-btn driver-clay-btn-success min-h-[2.85rem] justify-center text-sm ${!canAcceptNow ? 'opacity-70' : ''}`}
                    >
                      <Truck size={15} />
                      {canAcceptNow
                        ? updatingJobId === job.id
                          ? 'กำลังรับงาน...'
                          : 'รับงาน'
                        : isFutureLockedPending
                          ? 'รับงานได้ในวันนัด'
                          : 'ยังไม่พร้อมรับงาน'}
                    </button>
                  )}

                  {expanded && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedJob(job);
                      }}
                      className="driver-clay-btn driver-clay-btn-ghost min-h-[2.85rem] justify-center text-sm"
                    >
                      <Eye size={15} />
                      ดูรายละเอียด
                    </button>
                  )}
                </div>

                <p className="driver-clay-muted mt-2 text-[11px] sm:mt-3 sm:text-xs">
                  แตะการ์ดเพื่อ{expanded ? 'ย่อ' : 'ขยาย'}รายละเอียด
                </p>
              </article>
            );
          })}
      </section>

      <Modal
        isOpen={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        title={selectedJob?.workOrderNo || selectedJob?.ticketNo || 'รายละเอียดงาน'}
        panelClassName="max-w-2xl"
        bodyClassName="hide-scrollbar max-h-[calc(100dvh-8rem)] space-y-4 overflow-y-auto pr-1"
      >
        {selectedJob && (
          <div className="space-y-4 text-sm text-slate-700">
            <div className="driver-clay-soft space-y-2 rounded-2xl p-4">
              <div className="flex flex-wrap justify-end gap-2">
                <span className={`driver-clay-chip whitespace-nowrap ${statusBadgeClass(selectedJob.status)}`}>
                  {statusIcon(selectedJob.status)}
                  {statusLabelMap[selectedJob.status]}
                </span>
                {selectedJob.readyToClose && (
                  <span className="driver-clay-chip whitespace-nowrap bg-indigo-100/90 text-indigo-700">
                    <CheckCircle2 size={13} />
                    รอจบงาน
                  </span>
                )}
              </div>
              <p className="break-words text-base font-black text-slate-700">
                {selectedJob.employerCompany || '-'}
              </p>
              <p className="break-words text-sm font-semibold text-slate-600">
                {selectedJob.productName || '-'}
              </p>
            </div>

            <div className="space-y-3">
              <DetailRow
                icon={<CalendarClock size={15} className="driver-clay-muted" />}
                value={`วันที่งาน: ${getJobDate(selectedJob) || '-'}`}
              />
              <DetailRow
                icon={<Package2 size={15} className="driver-clay-muted" />}
                value={`จำนวนรอบ: ${resolveRounds(selectedJob)}`}
              />
              <DetailRow
                icon={<Truck size={15} className="driver-clay-muted" />}
                value={`รถ: ${selectedJob.vehicleType || '-'} | ทะเบียน: ${selectedJob.plateNo || '-'}`}
              />
              <DetailRow
                icon={<UserRound size={15} className="driver-clay-muted" />}
                value={`พนักงานขับรถ: ${selectedJob.driverName || '-'}`}
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
              {(selectedJob.fuelAndToll ?? '') !== '' && selectedJob.fuelAndToll !== null && (
                <DetailRow
                  icon={<FileText size={15} className="driver-clay-muted" />}
                  value={`ค่าน้ำมัน/ทางด่วน: ${Number(selectedJob.fuelAndToll).toLocaleString('en-US')}`}
                />
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="driver-clay-soft rounded-2xl p-4">
                <p className="mb-2 text-sm font-semibold text-slate-700">จุดรับ</p>
                <div className="space-y-2">
                  <DetailRow
                    icon={<MapPin size={15} className="driver-clay-muted mt-0.5" />}
                    value={selectedJob.pickup.location || '-'}
                  />
                  <DetailRow
                    icon={<Clock3 size={15} className="driver-clay-muted" />}
                    value={`${selectedJob.pickup.date || '-'} ${selectedJob.pickup.time || ''}`.trim()}
                  />
                  {hasValue(selectedJob.pickup.contact) && (
                    <DetailRow
                      icon={<UserRound size={15} className="driver-clay-muted" />}
                      value={selectedJob.pickup.contact}
                    />
                  )}
                </div>
              </div>

              <div className="driver-clay-soft rounded-2xl p-4">
                <p className="mb-2 text-sm font-semibold text-slate-700">จุดส่ง</p>
                <div className="space-y-2">
                  <DetailRow
                    icon={<MapPin size={15} className="driver-clay-muted mt-0.5" />}
                    value={selectedJob.delivery.location || '-'}
                  />
                  <DetailRow
                    icon={<Clock3 size={15} className="driver-clay-muted" />}
                    value={`${selectedJob.delivery.date || '-'} ${selectedJob.delivery.time || ''}`.trim()}
                  />
                  {hasValue(selectedJob.delivery.contact) && (
                    <DetailRow
                      icon={<UserRound size={15} className="driver-clay-muted" />}
                      value={selectedJob.delivery.contact}
                    />
                  )}
                </div>
              </div>
            </div>

            {selectedJob.importantNote && (
              <div className="driver-clay-soft rounded-2xl p-4">
                <p className="mb-2 text-sm font-semibold text-slate-700">หมายเหตุ</p>
                <p className="break-words text-sm leading-relaxed text-slate-600">{selectedJob.importantNote}</p>
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
    <p className="driver-clay-muted text-[11px]">{label}</p>
    <p className="mt-1 text-lg font-black text-slate-700">{value}</p>
  </div>
);

const DetailRow: React.FC<{ icon: React.ReactNode; value: string }> = ({ icon, value }) => (
  <div className="flex items-start gap-2">
    <div className="mt-0.5 shrink-0">{icon}</div>
    <div className="min-w-0 break-words leading-relaxed">{value}</div>
  </div>
);

export default DriverJobsBoard;
