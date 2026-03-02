import React, { useEffect, useMemo, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { CalendarClock, CheckCircle2, Circle, CircleDashed, Clock3, MapPin, Package2, Search, Truck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToTodayJobsByAssignee, triggerTodayJobNotification, updateTodayJob } from '../services/firebaseService';
import { TodayJobEntry } from '../types';

export type DriverView = 'today' | 'active' | 'ready-to-close' | 'history';

type JobStatus = TodayJobEntry['status'];

interface DriverJobsBoardProps {
  view: DriverView;
}

const asDateOnly = (dateStr: string) => (dateStr || '').split('T')[0];

const getLocalDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split('T')[0];
};

const normalizeText = (value: string) => value.trim().toLowerCase();
const hasValue = (value?: string) => !!value && value.trim().length > 0;
const parseRounds = (value?: string) => {
  const match = (value || '').match(/\d+/);
  if (!match) return 1;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const parsePickupTimestamp = (job: TodayJobEntry): number => {
  const pickupDate = (job.pickup?.date || '').trim();
  const fallbackDate = asDateOnly(job.workDate || '').trim();
  const datePart = pickupDate || fallbackDate;
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
  } else {
    if (timeA !== timeB) return timeB - timeA;
  }

  const roundA = parseRoundSuffix(a);
  const roundB = parseRoundSuffix(b);
  if (roundA !== roundB) return roundA - roundB;

  return (a.workOrderNo || a.ticketNo || '').localeCompare(b.workOrderNo || b.ticketNo || '');
};

const statusLabelMap: Record<JobStatus, string> = {
  pending: 'รอรับงาน',
  in_progress: 'กำลังทำงาน',
  completed: 'เสร็จงาน',
};

const viewMetaMap: Record<DriverView, { title: string; subtitle: string }> = {
  today: {
    title: 'งานวันนี้ของฉัน',
    subtitle: 'รวมงานที่ได้รับมอบหมายในวันนี้',
  },
  active: {
    title: 'งานที่กำลังทำ',
    subtitle: 'งานที่ต้องรับหรือกำลังดำเนินการอยู่',
  },
  'ready-to-close': {
    title: 'งานที่รอจบงาน',
    subtitle: 'งานที่พนักงานกดพร้อมจบงานแล้ว',
  },
  history: {
    title: 'สรุปงานของฉัน',
    subtitle: 'ดูงานที่จบแล้วและกรองย้อนหลังได้',
  },
};

const DriverJobsBoard: React.FC<DriverJobsBoardProps> = ({ view }) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<TodayJobEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchText, setSearchText] = useState('');
  const [historyMonth, setHistoryMonth] = useState('');
  const [compactHistoryCards, setCompactHistoryCards] = useState(true);
  const [updatingJobId, setUpdatingJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setJobs([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const unsubscribe = subscribeToTodayJobsByAssignee(
      user.uid,
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
  }, [user?.uid]);

  const todayDate = asDateOnly(getLocalDate());

  const myJobs = useMemo(() => jobs, [jobs]);

  const todayJobs = useMemo(
    () => myJobs.filter((job) => asDateOnly(job.workDate) === todayDate),
    [myJobs, todayDate]
  );
  const activeJobs = useMemo(
    () => myJobs.filter((job) => job.status === 'pending' || (job.status === 'in_progress' && !job.readyToClose)),
    [myJobs]
  );
  const readyToCloseJobs = useMemo(
    () => myJobs.filter((job) => job.status === 'in_progress' && !!job.readyToClose),
    [myJobs]
  );
  const inProgressJobs = useMemo(
    () => myJobs.filter((job) => job.status === 'in_progress'),
    [myJobs]
  );
  const historyJobs = useMemo(
    () => myJobs.filter((job) => job.status === 'completed'),
    [myJobs]
  );

  const monthOptions = useMemo(() => {
    const months = new Set(
      historyJobs
        .map((job) => asDateOnly(job.workDate).slice(0, 7))
        .filter(Boolean)
    );

    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [historyJobs]);

  const filteredHistoryJobs = useMemo(() => {
    const search = normalizeText(searchText);

    return historyJobs.filter((job) => {
      if (historyMonth && !asDateOnly(job.workDate).startsWith(historyMonth)) return false;
      if (!search) return true;

      const haystack = normalizeText(
        [
          job.jobNo,
          job.employerCompany,
          job.productName,
          job.plateNo,
          job.pickup.location,
          job.delivery.location,
        ].join(' ')
      );

      return haystack.includes(search);
    });
  }, [historyJobs, historyMonth, searchText]);

  const filteredActiveJobs = useMemo(() => {
    const search = normalizeText(searchText);
    if (!search) return activeJobs;

    return activeJobs.filter((job) => {
      const haystack = normalizeText(
        [job.jobNo, job.employerCompany, job.productName, job.pickup.location, job.delivery.location].join(' ')
      );
      return haystack.includes(search);
    });
  }, [activeJobs, searchText]);

  const filteredTodayJobs = useMemo(() => {
    const search = normalizeText(searchText);
    const visibleTodayJobs = todayJobs.filter((job) => job.status !== 'completed');
    if (!search) return visibleTodayJobs;

    return visibleTodayJobs.filter((job) => {
      const haystack = normalizeText(
        [job.jobNo, job.employerCompany, job.productName, job.pickup.location, job.delivery.location].join(' ')
      );
      return haystack.includes(search);
    });
  }, [todayJobs, searchText]);

  const filteredReadyToCloseJobs = useMemo(() => {
    const search = normalizeText(searchText);
    if (!search) return readyToCloseJobs;

    return readyToCloseJobs.filter((job) => {
      const haystack = normalizeText(
        [job.jobNo, job.employerCompany, job.productName, job.pickup.location, job.delivery.location].join(' ')
      );
      return haystack.includes(search);
    });
  }, [readyToCloseJobs, searchText]);

  const jobsByView = useMemo(() => {
    if (view === 'today') return [...filteredTodayJobs].sort(compareByPickupSchedule);
    if (view === 'active') return [...filteredActiveJobs].sort(compareByPickupSchedule);
    if (view === 'ready-to-close') return [...filteredReadyToCloseJobs].sort(compareByPickupSchedule);
    return [...filteredHistoryJobs];
  }, [filteredActiveJobs, filteredHistoryJobs, filteredReadyToCloseJobs, filteredTodayJobs, view]);

  const handleAcceptJob = async (job: TodayJobEntry) => {
    if (!user?.uid || updatingJobId) return;
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
          date: job.workDate || '',
          pickupLocation: job.pickup.location || '',
          dropoffLocation: job.delivery.location || '',
          vehicleType: job.vehicleType || '',
          licensePlate: job.plateNo || '',
          driverName: job.driverName || '',
          workOrderNo: job.workOrderNo || job.ticketNo || '',
          rounds: job.rounds || parseRounds(job.quantity),
        },
      },
    });
  };

  const statusBadgeClass = (status: JobStatus) =>
    status === 'completed'
      ? 'text-emerald-700 bg-emerald-100/80'
      : status === 'in_progress'
        ? 'text-amber-700 bg-amber-100/85'
        : 'text-slate-600 bg-slate-100/90';

  const statusIcon = (status: JobStatus) => {
    if (status === 'completed') return <CheckCircle2 size={13} />;
    if (status === 'in_progress') return <CircleDashed size={13} />;
    return <Circle size={13} />;
  };

  const cardClass = 'driver-clay-card p-4 sm:p-5';
  const inputClass = 'driver-clay-input px-3 py-2.5 text-[16px] md:text-sm';

  const { title, subtitle } = viewMetaMap[view];

  return (
    <section className="space-y-4">
      <div className={cardClass}>
        <h1 className="text-lg font-black tracking-tight text-slate-700">{title}</h1>
        <p className="driver-clay-muted mt-1 text-sm">{subtitle}</p>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="driver-clay-soft p-3">
            <p className="driver-clay-muted text-xs">งานวันนี้</p>
            <p className="mt-1 text-lg font-black text-slate-700">{todayJobs.length}</p>
          </div>
          <div className="driver-clay-soft p-3">
            <p className="driver-clay-muted text-xs">กำลังทำ</p>
            <p className="mt-1 text-lg font-black text-slate-700">{inProgressJobs.length}</p>
          </div>
          <div className="driver-clay-soft p-3">
            <p className="driver-clay-muted text-xs">จบแล้ว</p>
            <p className="mt-1 text-lg font-black text-slate-700">{historyJobs.length}</p>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className="driver-clay-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className={`pl-9 ${inputClass}`}
              placeholder="ค้นหา Job no., สินค้า, จุดรับ/ส่ง"
            />
          </div>

          {view === 'history' && (
            <div className="flex items-center gap-2">
              <select
                value={historyMonth}
                onChange={(e) => setHistoryMonth(e.target.value)}
                className={`flex-1 ${inputClass}`}
              >
                <option value="">ทุกเดือน</option>
                {monthOptions.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setCompactHistoryCards((prev) => !prev)}
                className="driver-clay-input px-3 py-2.5 text-xs font-semibold text-slate-700 whitespace-nowrap"
              >
                {compactHistoryCards ? 'ขยายการ์ด' : 'ย่อการ์ด'}
              </button>
            </div>
          )}
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
        jobsByView.map((job) => (
          <article key={job.id} className={cardClass}>
            {(() => {
              const isCompactHistoryCard = view === 'history' && compactHistoryCards;
              return (
                <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-black text-slate-700">
                  {job.employerCompany || '-'} | {job.productName || '-'}
                </p>
                <p className="driver-clay-muted truncate text-xs">
                  เลขที่ใบสั่งงาน: {job.workOrderNo || job.ticketNo || '-'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <span className={`driver-clay-chip ${statusBadgeClass(job.status)}`}>
                  {statusIcon(job.status)}
                  {statusLabelMap[job.status]}
                </span>
                {job.status === 'in_progress' && job.readyToClose && (
                  <span className="driver-clay-chip bg-indigo-100/90 text-indigo-700">
                    <CheckCircle2 size={13} />
                    รอจบงาน
                  </span>
                )}
              </div>
            </div>

            {isCompactHistoryCard ? (
              <div className="mt-3 space-y-1 text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <CalendarClock size={14} className="driver-clay-muted" />
                  <span>{asDateOnly(job.workDate) || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="driver-clay-muted" />
                  <span className="truncate">{job.pickup.location || '-'} → {job.delivery.location || '-'}</span>
                </div>
              </div>
            ) : (
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <CalendarClock size={14} className="driver-clay-muted" />
                <span>วันที่แจ้งงาน: {asDateOnly(job.workDate) || '-'}</span>
              </div>

              <div className="flex items-start gap-2">
                <MapPin size={14} className="driver-clay-muted mt-0.5" />
                <div className="min-w-0 space-y-1">
                  <p className="truncate">รับ: {job.pickup.location || '-'}</p>
                  {(hasValue(job.pickup.date) || hasValue(job.pickup.time)) && (
                    <p className="driver-clay-muted flex items-center gap-1 text-xs">
                      <Clock3 size={12} />
                      {`${job.pickup.date || '-'} ${job.pickup.time || ''}`.trim()}
                    </p>
                  )}
                  {hasValue(job.pickup.contact) && (
                    <p className="driver-clay-muted flex items-center gap-1 text-xs">
                      <UserRound size={12} />
                      ผู้ติดต่อ: {job.pickup.contact}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2">
                <MapPin size={14} className="driver-clay-muted mt-0.5" />
                <div className="min-w-0 space-y-1">
                  <p className="truncate">ส่ง: {job.delivery.location || '-'}</p>
                  {(hasValue(job.delivery.date) || hasValue(job.delivery.time)) && (
                    <p className="driver-clay-muted flex items-center gap-1 text-xs">
                      <Clock3 size={12} />
                      {`${job.delivery.date || '-'} ${job.delivery.time || ''}`.trim()}
                    </p>
                  )}
                  {hasValue(job.delivery.contact) && (
                    <p className="driver-clay-muted flex items-center gap-1 text-xs">
                      <UserRound size={12} />
                      ผู้ติดต่อ: {job.delivery.contact}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Package2 size={14} className="driver-clay-muted" />
                <span>จำนวนรอบ: {job.rounds || parseRounds(job.quantity)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Truck size={14} className="driver-clay-muted" />
                <span>ทะเบียนรถ: {job.plateNo || '-'}</span>
              </div>
              {job.readyToClose && (
                <p className="text-xs font-medium text-amber-600">พร้อมจบงานแล้ว</p>
              )}
            </div>
            )}

            {job.importantNote && !isCompactHistoryCard && (
              <div className="driver-clay-soft driver-clay-muted mt-3 px-3 py-2 text-xs">
                หมายเหตุ: {job.importantNote}
              </div>
            )}

            {!isCompactHistoryCard && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {job.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => handleAcceptJob(job)}
                  disabled={updatingJobId === job.id}
                  className="driver-clay-btn driver-clay-btn-success"
                >
                  <Truck size={15} />
                  {updatingJobId === job.id ? 'กำลังรับงาน...' : 'รับงาน'}
                </button>
              )}

              {job.status === 'in_progress' && (view === 'active' || view === 'today' || view === 'ready-to-close') && (
                <button
                  type="button"
                  onClick={() => handleOpenEntryForm(job)}
                  className="driver-clay-btn driver-clay-btn-warning"
                >
                  <CircleDashed size={15} />
                  อัพเดทข้อมูล
                </button>
              )}

              {job.status === 'in_progress' && job.readyToClose && (view === 'ready-to-close' || view === 'today') && (
                <button
                  type="button"
                  onClick={() => handleCompleteJob(job)}
                  disabled={updatingJobId === job.id}
                  className="driver-clay-btn driver-clay-btn-info"
                >
                  <CheckCircle2 size={15} />
                  {updatingJobId === job.id ? 'กำลังจบงาน...' : 'จบงาน'}
                </button>
              )}

            </div>
            )}
                </>
              );
            })()}
          </article>
        ))}
    </section>
  );
};

export default DriverJobsBoard;
