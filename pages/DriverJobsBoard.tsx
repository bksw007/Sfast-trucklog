import React, { useEffect, useMemo, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { CalendarClock, CheckCircle2, Circle, CircleDashed, Clock3, MapPin, Package2, Search, Truck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
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
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isDark = theme === 'dark';

  const [jobs, setJobs] = useState<TodayJobEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchText, setSearchText] = useState('');
  const [historyMonth, setHistoryMonth] = useState('');
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
    if (!search) return todayJobs;

    return todayJobs.filter((job) => {
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
    if (view === 'today') return filteredTodayJobs;
    if (view === 'active') return filteredActiveJobs;
    if (view === 'ready-to-close') return filteredReadyToCloseJobs;
    return filteredHistoryJobs;
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
      ? 'bg-emerald-500/15 text-emerald-600'
      : status === 'in_progress'
        ? 'bg-amber-500/15 text-amber-600'
        : 'bg-slate-500/15 text-slate-600';

  const statusIcon = (status: JobStatus) => {
    if (status === 'completed') return <CheckCircle2 size={13} />;
    if (status === 'in_progress') return <CircleDashed size={13} />;
    return <Circle size={13} />;
  };

  const cardClass = isDark
    ? 'rounded-2xl border border-dark-muted/30 bg-dark-card/70 p-4 shadow-lg shadow-black/15'
    : 'rounded-2xl border border-light-muted/25 bg-white p-4 shadow-lg shadow-slate-200/70';

  const inputClass = isDark
    ? 'w-full min-h-11 rounded-xl border border-dark-muted/35 bg-dark-bg/45 px-3 py-2.5 text-[16px] md:text-sm text-dark-text focus:border-accent-primary focus:outline-none'
    : 'w-full min-h-11 rounded-xl border border-light-muted/30 bg-white px-3 py-2.5 text-[16px] md:text-sm text-light-text focus:border-accent-primary focus:outline-none';

  const { title, subtitle } = viewMetaMap[view];

  return (
    <section className="space-y-4">
      <div className={cardClass}>
        <h1 className="text-lg font-bold">{title}</h1>
        <p className={`mt-1 text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>{subtitle}</p>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className={isDark ? 'rounded-xl bg-dark-bg/50 p-3' : 'rounded-xl bg-slate-50 p-3'}>
            <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>งานวันนี้</p>
            <p className="mt-1 text-lg font-bold">{todayJobs.length}</p>
          </div>
          <div className={isDark ? 'rounded-xl bg-dark-bg/50 p-3' : 'rounded-xl bg-slate-50 p-3'}>
            <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>กำลังทำ</p>
            <p className="mt-1 text-lg font-bold">{inProgressJobs.length}</p>
          </div>
          <div className={isDark ? 'rounded-xl bg-dark-bg/50 p-3' : 'rounded-xl bg-slate-50 p-3'}>
            <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>จบแล้ว</p>
            <p className="mt-1 text-lg font-bold">{historyJobs.length}</p>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`} />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className={`pl-9 ${inputClass}`}
              placeholder="ค้นหา Job no., สินค้า, จุดรับ/ส่ง"
            />
          </div>

          {view === 'history' && (
            <select value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)} className={inputClass}>
              <option value="">ทุกเดือน</option>
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading && (
        <div className={cardClass}>
          <p className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>กำลังโหลดงาน...</p>
        </div>
      )}

      {!loading && errorMessage && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          โหลดข้อมูลงานไม่สำเร็จ: {errorMessage}
        </div>
      )}

      {!loading && !errorMessage && jobsByView.length === 0 && (
        <div className={cardClass}>
          <p className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
            ยังไม่มีงานในรายการนี้ หรือยังไม่มีงานที่มอบหมายให้บัญชีนี้
          </p>
        </div>
      )}

      {!loading &&
        !errorMessage &&
        jobsByView.map((job) => (
          <article key={job.id} className={cardClass}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-bold">
                  {job.employerCompany || '-'} | {job.productName || '-'}
                </p>
                <p className={`truncate text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                  เลขที่ใบสั่งงาน: {job.workOrderNo || job.ticketNo || '-'}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${statusBadgeClass(job.status)}`}>
                {statusIcon(job.status)}
                {statusLabelMap[job.status]}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CalendarClock size={14} className={isDark ? 'text-dark-muted' : 'text-light-muted'} />
                <span>วันที่แจ้งงาน: {asDateOnly(job.workDate) || '-'}</span>
              </div>

              <div className="flex items-start gap-2">
                <MapPin size={14} className={`mt-0.5 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`} />
                <div className="min-w-0 space-y-1">
                  <p className="truncate">รับ: {job.pickup.location || '-'}</p>
                  {(hasValue(job.pickup.date) || hasValue(job.pickup.time)) && (
                    <p className={`flex items-center gap-1 text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                      <Clock3 size={12} />
                      {`${job.pickup.date || '-'} ${job.pickup.time || ''}`.trim()}
                    </p>
                  )}
                  {hasValue(job.pickup.contact) && (
                    <p className={`flex items-center gap-1 text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                      <UserRound size={12} />
                      ผู้ติดต่อ: {job.pickup.contact}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2">
                <MapPin size={14} className={`mt-0.5 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`} />
                <div className="min-w-0 space-y-1">
                  <p className="truncate">ส่ง: {job.delivery.location || '-'}</p>
                  {(hasValue(job.delivery.date) || hasValue(job.delivery.time)) && (
                    <p className={`flex items-center gap-1 text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                      <Clock3 size={12} />
                      {`${job.delivery.date || '-'} ${job.delivery.time || ''}`.trim()}
                    </p>
                  )}
                  {hasValue(job.delivery.contact) && (
                    <p className={`flex items-center gap-1 text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                      <UserRound size={12} />
                      ผู้ติดต่อ: {job.delivery.contact}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Package2 size={14} className={isDark ? 'text-dark-muted' : 'text-light-muted'} />
                <span>จำนวน: {job.quantity || '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Truck size={14} className={isDark ? 'text-dark-muted' : 'text-light-muted'} />
                <span>ทะเบียนรถ: {job.plateNo || '-'}</span>
              </div>
              {job.readyToClose && (
                <p className="text-xs font-medium text-amber-600">พร้อมจบงานแล้ว</p>
              )}
            </div>

            {job.importantNote && (
              <div className={`mt-3 rounded-xl px-3 py-2 text-xs ${isDark ? 'bg-dark-bg/60 text-dark-muted' : 'bg-slate-50 text-slate-600'}`}>
                หมายเหตุ: {job.importantNote}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              {job.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => handleAcceptJob(job)}
                  disabled={updatingJobId === job.id}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#0f766e] to-[#16a34a] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  <Truck size={15} />
                  {updatingJobId === job.id ? 'กำลังรับงาน...' : 'รับงาน'}
                </button>
              )}

              {job.status === 'in_progress' && job.readyToClose && (view === 'ready-to-close' || view === 'today') && (
                <button
                  type="button"
                  onClick={() => handleCompleteJob(job)}
                  disabled={updatingJobId === job.id}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#0284c7] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  <CheckCircle2 size={15} />
                  {updatingJobId === job.id ? 'กำลังจบงาน...' : 'จบงาน'}
                </button>
              )}

              {job.status === 'in_progress' && !job.readyToClose && (view === 'active' || view === 'today') && (
                <button
                  type="button"
                  onClick={() => handleOpenEntryForm(job)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#d97706] to-[#f59e0b] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  <CircleDashed size={15} />
                  อัพเดทข้อมูล
                </button>
              )}
            </div>
          </article>
        ))}
    </section>
  );
};

export default DriverJobsBoard;
