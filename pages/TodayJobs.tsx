import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import jsPDF from 'jspdf';
import { FirebaseError } from 'firebase/app';
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  CircleDashed,
  ClipboardCheck,
  Copy,
  FileDown,
  Loader2,
  Plus,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  Truck,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import {
  addTodayJob,
  addOption,
  deleteTodayJob,
  getTodayJobById,
  RevisionConflictError,
  subscribeToTodayJobs,
  triggerTodayJobNotification,
  updateTodayJob
} from '../services/firebaseService';
import { getAllUsers, getUserProfile } from '../services/userService';
import { DispatchPoint, OptionCategory, TodayJobEntry, UserProfile } from '../types';
import { NotoSansThaiBase64 } from '../fonts/NotoSansThai';
import ConfirmModal from '../components/ConfirmModal';
import Modal from '../components/Modal';

type TodayJobForm = {
  employerCompany: string;
  jobNo: string;
  workOrderNo: string;
  workDate: string;
  vehicleType: string;
  productName: string;
  quantity: string;
  pickup: DispatchPoint;
  delivery: DispatchPoint;
  assignedToUid: string;
  driverName: string;
  plateNo: string;
  driverPhone: string;
  importantNote: string;
};

type JobStatus = TodayJobEntry['status'];
type MainSectionTab = 'overview' | 'form' | 'table';
type QuickAddTarget =
  | { kind: 'field'; field: keyof TodayJobForm }
  | { kind: 'point'; point: 'pickup' | 'delivery'; field: keyof DispatchPoint };

const resolveMainTabFromSearch = (search: string): MainSectionTab | null => {
  const params = new URLSearchParams(search);
  const tab = (params.get('tab') || '').trim().toLowerCase();
  if (tab === 'overview') return 'overview';
  if (tab === 'form') return 'form';
  if (tab === 'table') return 'table';
  return null;
};

const statusLabelMap: Record<JobStatus, string> = {
  pending: 'รอดำเนินการ',
  in_progress: 'กำลังทำงาน',
  completed: 'เสร็จแล้ว',
};

const getLocalDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split('T')[0];
};

const asDateOnly = (dateStr: string) => (dateStr || '').split('T')[0];

const parseDate = (dateStr: string) => {
  const dateOnly = asDateOnly(dateStr);
  if (!dateOnly) return null;
  const parsed = new Date(`${dateOnly}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const extractUserPhone = (user?: (Partial<UserProfile> & Record<string, unknown>) | null): string => {
  if (!user) return '';
  const candidates = [
    user.phoneNumber,
    user.driverPhone as string | undefined,
    user.phone as string | undefined,
    user.phoneNo as string | undefined,
    user.mobile as string | undefined,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
};

const pad2 = (value: number) => value.toString().padStart(2, '0');

const generateWorkOrderNo = () => {
  const now = new Date();
  const dd = pad2(now.getDate());
  const mm = pad2(now.getMonth() + 1);
  const yy = pad2(now.getFullYear() % 100);
  const HH = pad2(now.getHours());
  const min = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
  return `w${dd}${mm}${yy}${HH}${min}${ss}`;
};

const toRoundCount = (value: string): number | null => {
  const normalized = (value || '').trim();
  if (!normalized) return null;
  const match = normalized.match(/(\d+(\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  if (parsed < 1) return 1;
  return Math.floor(parsed);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const initialFormData = (): TodayJobForm => ({
  employerCompany: '',
  jobNo: '',
  workOrderNo: generateWorkOrderNo(),
  workDate: getLocalDate(),
  vehicleType: '',
  productName: '',
  quantity: '1',
  pickup: { location: '', date: getLocalDate(), time: '', contact: '' },
  delivery: { location: '', date: getLocalDate(), time: '', contact: '' },
  assignedToUid: '',
  driverName: '',
  plateNo: '',
  driverPhone: '',
  importantNote: ''
});

const toEditableForm = (job: TodayJobEntry): TodayJobForm => ({
  employerCompany: job.employerCompany,
  jobNo: job.jobNo,
  workOrderNo: job.workOrderNo || job.ticketNo || '',
  workDate: job.workDate,
  vehicleType: job.vehicleType,
  productName: job.productName,
  quantity: job.quantity,
  pickup: { ...job.pickup },
  delivery: { ...job.delivery },
  assignedToUid: job.assignedToUid || '',
  driverName: job.driverName,
  plateNo: job.plateNo,
  driverPhone: job.driverPhone,
  importantNote: job.importantNote,
});

const buildSummaryText = (data: TodayJobForm) => {
  const lines = [
    'ใบแจ้งงาน',
    `เลขที่ใบสั่งงาน: ${data.workOrderNo || '-'}`,
    `ประเภทสินค้า: ${data.productName || '-'}`,
    `จำนวนรอบ: ${data.quantity || '-'}`,
    `ประเภทรถ: ${data.vehicleType || '-'}`,
    `ทะเบียนรถ: ${data.plateNo || '-'}`,
    '',
    'จุดรับ',
    `- สถานที่: ${data.pickup.location || '-'}`,
    `- วันที่: ${data.pickup.date || '-'}`,
    `- เวลา: ${data.pickup.time || '-'}`,
    `- ผู้ติดต่อ: ${data.pickup.contact || '-'}`,
    '',
    'จุดส่ง',
    `- สถานที่: ${data.delivery.location || '-'}`,
    `- วันที่: ${data.delivery.date || '-'}`,
    `- เวลา: ${data.delivery.time || '-'}`,
    `- ผู้ติดต่อ: ${data.delivery.contact || '-'}`,
    '',
    `พนักงานขับรถ: ${data.driverName || '-'}`,
    `เบอร์ติดต่อคนขับ: ${data.driverPhone || '-'}`,
    `หมายเหตุ: ${data.importantNote || '-'}`,
  ];

  return lines.join('\n');
};

const TodayJobs: React.FC = () => {
  const location = useLocation();
  const { user, userProfile } = useAuth();
  const { data: appData } = useData();
  const isDark = false;
  const isAdmin = userProfile?.role === 'admin';

  const [formData, setFormData] = useState<TodayJobForm>(initialFormData());
  const [assignableUsers, setAssignableUsers] = useState<UserProfile[]>([]);
  const [jobs, setJobs] = useState<TodayJobEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopySuccess, setIsCopySuccess] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showDeleteSuccessModal, setShowDeleteSuccessModal] = useState(false);
  const [updatingJobId, setUpdatingJobId] = useState<string | null>(null);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | JobStatus>('all');
  const [activeMainTab, setActiveMainTab] = useState<MainSectionTab>(
    () => resolveMainTabFromSearch(location.search) ?? 'overview'
  );
  const [quickAddValue, setQuickAddValue] = useState('');
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false);
  const [quickAddModal, setQuickAddModal] = useState<{
    open: boolean;
    category: OptionCategory;
    label: string;
    target: QuickAddTarget | null;
  }>({
    open: false,
    category: OptionCategory.LOCATION,
    label: '',
    target: null,
  });

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TodayJobForm | null>(null);
  const [editBaseRevision, setEditBaseRevision] = useState<number | null>(null);
  const [isEditingSave, setIsEditingSave] = useState(false);

  const [jobToDelete, setJobToDelete] = useState<TodayJobEntry | null>(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [cardModalTitle, setCardModalTitle] = useState('');
  const [cardModalJobs, setCardModalJobs] = useState<TodayJobEntry[]>([]);
  const [showCardModal, setShowCardModal] = useState(false);

  const inputClass = isDark
    ? 'w-full min-h-11 rounded-xl border border-dark-muted/35 bg-dark-bg/40 px-3 py-2.5 text-[16px] md:text-sm text-dark-text focus:border-accent-primary focus:outline-none'
    : 'w-full min-h-11 rounded-xl border border-light-muted/35 bg-white px-3 py-2.5 text-[16px] md:text-sm text-light-text focus:border-accent-primary focus:outline-none';

  const pointInputClass = isDark
    ? 'w-full min-h-11 rounded-xl border border-dark-muted/35 bg-dark-bg/40 px-3 py-2.5 text-[16px] md:text-sm text-dark-text focus:border-accent-primary focus:outline-none'
    : 'w-full min-h-11 rounded-xl border border-light-muted/35 bg-white px-3 py-2.5 text-[16px] md:text-sm text-light-text focus:border-accent-primary focus:outline-none';

  const cardClass = isDark
    ? 'rounded-2xl border border-dark-muted/30 bg-dark-card/70 shadow-xl shadow-black/20'
    : 'rounded-2xl border border-light-muted/20 bg-light-card shadow-xl shadow-slate-200/60';

  const selectClass = isDark
    ? 'w-full min-h-11 rounded-xl border border-dark-muted/35 bg-dark-bg/40 px-3 py-2.5 text-[16px] md:text-sm text-dark-text focus:border-accent-primary focus:outline-none'
    : 'w-full min-h-11 rounded-xl border border-light-muted/35 bg-white px-3 py-2.5 text-[16px] md:text-sm text-light-text focus:border-accent-primary focus:outline-none';
  const quickAddButtonClass = isDark
    ? 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dark-muted/35 bg-dark-bg/50 text-dark-text shadow-sm transition hover:bg-dark-bg disabled:opacity-55'
    : 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/80 bg-gradient-to-br from-[#d9e6f2] to-[#bcd0e0] text-[#34495e] shadow-[4px_4px_10px_rgba(166,180,200,0.35),-4px_-4px_8px_rgba(255,255,255,0.88)] transition hover:brightness-105 active:translate-y-px disabled:opacity-55';

  const options = appData?.options;
  const sortUniqueOptions = (items: string[]) =>
    Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));

  const vehicleTypeOptions = useMemo(() => sortUniqueOptions(options?.vehicleTypes ?? []), [options?.vehicleTypes]);
  const locationOptions = useMemo(() => sortUniqueOptions(options?.locations ?? []), [options?.locations]);
  const driverOptions = useMemo(() => sortUniqueOptions(options?.drivers ?? []), [options?.drivers]);
  const plateOptions = useMemo(() => sortUniqueOptions(options?.licensePlates ?? []), [options?.licensePlates]);
  const employerCompanyOptions = useMemo(() => sortUniqueOptions(options?.employerCompanies ?? []), [options?.employerCompanies]);
  const productTypeOptions = useMemo(() => sortUniqueOptions(options?.productTypes ?? []), [options?.productTypes]);
  const contactOptions = useMemo(() => sortUniqueOptions(options?.contacts ?? []), [options?.contacts]);

  useEffect(() => {
    const unsubscribe = subscribeToTodayJobs((rows) => setJobs(rows), (error) => {
      console.error('Today jobs subscribe failed:', error);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    getAllUsers()
      .then((users) => {
        setAssignableUsers(users);
      })
      .catch((error) => {
        console.error('Load assignable users failed:', error);
      });
  }, [isAdmin]);

  useEffect(() => {
    const fromSearch = resolveMainTabFromSearch(location.search);
    if (fromSearch) {
      setActiveMainTab(fromSearch);
    }
  }, [location.search]);

  const selectedAssignedUser = useMemo(
    () => assignableUsers.find((row) => row.uid === formData.assignedToUid) || null,
    [assignableUsers, formData.assignedToUid]
  );

  const summaryText = useMemo(() => buildSummaryText(formData), [formData]);

  const todayDate = asDateOnly(getLocalDate());
  const todayJobs = useMemo(() => jobs.filter((job) => asDateOnly(job.workDate) === todayDate), [jobs, todayDate]);
  const todayCompletedJobs = useMemo(
    () => todayJobs.filter((job) => job.status === 'completed'),
    [todayJobs]
  );

  const upcomingWeeklyJobs = useMemo(() => {
    const today = parseDate(todayDate);
    if (!today) return [] as TodayJobEntry[];

    const upcomingLimit = new Date(today);
    upcomingLimit.setDate(today.getDate() + 7);

    return jobs.filter((job) => {
      const jobDate = parseDate(job.workDate);
      if (!jobDate) return false;
      return jobDate > today && jobDate <= upcomingLimit && job.status !== 'completed';
    });
  }, [jobs, todayDate]);

  const dashboardStats = useMemo(() => {
    const today = parseDate(todayDate);
    if (!today) {
      return {
        todayTotal: 0,
        todayCompleted: 0,
        upcomingWeekly: 0,
        weekByDriver: [] as Array<{ name: string; count: number }>,
        monthByDriver: [] as Array<{ name: string; count: number }>,
        topDriverWeekJobs: [] as TodayJobEntry[],
      };
    }

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const month = today.getMonth();
    const year = today.getFullYear();

    const weekCountMap = new Map<string, number>();
    const monthCountMap = new Map<string, number>();
    const weekJobsByDriver = new Map<string, TodayJobEntry[]>();

    jobs.forEach((job) => {
      const driver = job.driverName || 'ไม่ระบุคนขับ';
      const jobDate = parseDate(job.workDate);
      if (!jobDate) return;

      if (jobDate >= startOfWeek && jobDate <= endOfWeek) {
        weekCountMap.set(driver, (weekCountMap.get(driver) || 0) + 1);
        const current = weekJobsByDriver.get(driver) || [];
        weekJobsByDriver.set(driver, [...current, job]);
      }

      if (jobDate.getMonth() === month && jobDate.getFullYear() === year) {
        monthCountMap.set(driver, (monthCountMap.get(driver) || 0) + 1);
      }
    });

    const toSortedArray = (source: Map<string, number>) =>
      Array.from(source.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const weekByDriver = toSortedArray(weekCountMap);
    const monthByDriver = toSortedArray(monthCountMap);

    return {
      todayTotal: todayJobs.length,
      todayCompleted: todayCompletedJobs.length,
      upcomingWeekly: upcomingWeeklyJobs.length,
      weekByDriver,
      monthByDriver,
      topDriverWeekJobs: weekByDriver[0] ? weekJobsByDriver.get(weekByDriver[0].name) || [] : [],
    };
  }, [jobs, todayDate, todayJobs, todayCompletedJobs, upcomingWeeklyJobs]);

  const driverNameByUid = useMemo(() => {
    const map = new Map<string, string>();
    assignableUsers.forEach((user) => {
      map.set(user.uid, user.fullName?.trim() || user.displayName || '');
    });
    return map;
  }, [assignableUsers]);

  const getDriverFullName = (job: TodayJobEntry) =>
    (job.assignedToUid ? driverNameByUid.get(job.assignedToUid) : '') ||
    job.driverName ||
    '-';

  const getAssignedAppLabel = (job: TodayJobEntry) => (job.assignedToUid ? 'Yes' : 'No');

  const filteredJobs = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return jobs.filter((job) => {
      if (statusFilter !== 'all' && job.status !== statusFilter) return false;
      if (!keyword) return true;

      const haystack = [
        job.jobNo,
        job.workOrderNo || job.ticketNo || '',
        job.employerCompany,
        job.driverName,
        job.plateNo,
        job.vehicleType,
        job.productName,
        job.pickup.location,
        job.delivery.location,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [jobs, searchText, statusFilter]);

  const selectedJob = useMemo(() => {
    if (!selectedJobId) return null;
    return jobs.find((job) => job.id === selectedJobId) || null;
  }, [jobs, selectedJobId]);

  const updateField = (field: keyof TodayJobForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateAssignedUser = (assignedToUid: string) => {
    const assignedUser = assignableUsers.find((row) => row.uid === assignedToUid);
    const driverFullName =
      assignedUser?.fullName?.trim() ||
      assignedUser?.displayName ||
      '';
    const profilePhone = extractUserPhone(assignedUser as (Partial<UserProfile> & Record<string, unknown>) | undefined);
    setFormData((prev) => ({
      ...prev,
      assignedToUid,
      driverName: driverFullName || prev.driverName,
      driverPhone: profilePhone || '',
    }));

    if (!assignedToUid || profilePhone) return;
    void getUserProfile(assignedToUid)
      .then((profile) => {
        const fetchedPhone = extractUserPhone(profile as (Partial<UserProfile> & Record<string, unknown>) | null);
        if (!fetchedPhone) return;
        setFormData((prev) =>
          prev.assignedToUid === assignedToUid
            ? { ...prev, driverPhone: fetchedPhone }
            : prev
        );
      })
      .catch((error) => {
        console.error('Load assigned user phone failed:', error);
      });
  };

  const updatePoint = (point: 'pickup' | 'delivery', field: keyof DispatchPoint, value: string) => {
    setFormData((prev) => ({ ...prev, [point]: { ...prev[point], [field]: value } }));
  };

  const handleReset = () => setFormData(initialFormData());

  const openQuickAddModal = (
    category: OptionCategory,
    label: string,
    target: QuickAddTarget
  ) => {
    if (quickAddSubmitting) return;
    setQuickAddValue('');
    setQuickAddModal({
      open: true,
      category,
      label,
      target,
    });
  };

  const closeQuickAddModal = () => {
    if (quickAddSubmitting) return;
    setQuickAddModal((prev) => ({ ...prev, open: false, target: null }));
    setQuickAddValue('');
  };

  const handleConfirmQuickAdd = async () => {
    if (!quickAddModal.open || !quickAddModal.target || quickAddSubmitting) return;

    const normalized = quickAddValue.trim();
    if (!normalized) {
      alert(`กรุณากรอก${quickAddModal.label}`);
      return;
    }

    setQuickAddSubmitting(true);
    try {
      await addOption(quickAddModal.category, normalized);
      const target = quickAddModal.target;
      if (target.kind === 'field') {
        setFormData((prev) => ({ ...prev, [target.field]: normalized }));
      } else {
        setFormData((prev) => ({
          ...prev,
          [target.point]: { ...prev[target.point], [target.field]: normalized },
        }));
      }
      closeQuickAddModal();
    } catch (error) {
      console.error(`Add ${quickAddModal.label} option failed:`, error);
      alert(`เพิ่ม${quickAddModal.label}ไม่สำเร็จ กรุณาลองใหม่`);
    } finally {
      setQuickAddSubmitting(false);
    }
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      setIsCopySuccess(true);
      setTimeout(() => setIsCopySuccess(false), 1500);
    } catch (error) {
      console.error('Copy summary failed:', error);
      alert('คัดลอกข้อความไม่สำเร็จ กรุณาลองอีกครั้ง');
    }
  };

  const openNativePicker = (event: React.MouseEvent<HTMLInputElement> | React.FocusEvent<HTMLInputElement>) => {
    const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
    if (typeof input.showPicker === 'function') input.showPicker();
  };

  const drawLineField = (doc: jsPDF, label: string, value: string, labelX: number, valueX: number, y: number) => {
    doc.setFontSize(12);
    doc.text(label, labelX, y);
    doc.text(value || '-', valueX, y);
    doc.line(valueX, y + 1.3, 195, y + 1.3);
  };

  const handleDownloadPdf = (source: TodayJobForm) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    doc.addFileToVFS('NotoSansThai.ttf', NotoSansThaiBase64);
    doc.addFont('NotoSansThai.ttf', 'NotoSansThai', 'normal');
    doc.setFont('NotoSansThai');

    doc.setFontSize(17);
    doc.text('S FAST TRANSPORTATION LIMITED PARTNERSHIP', 105, 16, { align: 'center' });
    doc.setFontSize(20);
    doc.text('ใบสั่งงาน', 105, 26, { align: 'center' });

    drawLineField(doc, 'บริษัทผู้ว่าจ้าง :', source.employerCompany, 12, 45, 40);
    drawLineField(doc, 'เลขที่ใบสั่งงาน :', source.workOrderNo, 130, 154, 40);
    drawLineField(doc, 'วันที่รับงาน :', source.workDate, 12, 45, 50);
    drawLineField(doc, 'ชนิดรถ :', source.vehicleType, 84, 108, 50);
    drawLineField(doc, 'Job No. :', source.jobNo, 130, 154, 50);
    drawLineField(doc, 'สินค้าที่รับ :', source.productName, 12, 45, 60);
    drawLineField(doc, 'ปริมาณ :', source.quantity, 130, 154, 60);

    doc.rect(12, 70, 183, 45);
    doc.line(42, 70, 42, 115);
    doc.line(118.5, 70, 118.5, 115);
    doc.line(12, 80, 195, 80);
    doc.line(12, 89, 195, 89);
    doc.line(12, 98, 195, 98);
    doc.line(12, 106.5, 195, 106.5);
    doc.text('รับงาน', 80, 76, { align: 'center' });
    doc.text('ส่งงาน', 157, 76, { align: 'center' });
    doc.text('สถานที่', 22, 85, { align: 'center' });
    doc.text('วันที่', 22, 94, { align: 'center' });
    doc.text('เวลา', 22, 102.5, { align: 'center' });
    doc.text('ติดต่อ', 22, 111, { align: 'center' });

    doc.text(source.pickup.location || '-', 80, 85, { align: 'center' });
    doc.text(source.delivery.location || '-', 157, 85, { align: 'center' });
    doc.text(source.pickup.date || '-', 80, 94, { align: 'center' });
    doc.text(source.delivery.date || '-', 157, 94, { align: 'center' });
    doc.text(source.pickup.time || '-', 80, 102.5, { align: 'center' });
    doc.text(source.delivery.time || '-', 157, 102.5, { align: 'center' });
    doc.text(source.pickup.contact || '-', 80, 111, { align: 'center' });
    doc.text(source.delivery.contact || '-', 157, 111, { align: 'center' });

    drawLineField(doc, 'พนักงานขับรถ :', source.driverName, 12, 45, 126);
    drawLineField(doc, 'ทะเบียน :', source.plateNo, 130, 154, 126);
    drawLineField(doc, 'เบอร์ติดต่อ :', source.driverPhone, 12, 45, 136);

    doc.text('หมายเหตุสำคัญ :', 12, 150);
    doc.line(42, 151.3, 195, 151.3);
    doc.text(source.importantNote || '-', 12, 159);
    doc.line(12, 161.3, 195, 161.3);

    doc.setFontSize(11);
    doc.text('การแต่งกายของพนักงานขับรถ', 12, 176);
    doc.text('- สวมใส่เสื้อสะท้อนแสง', 12, 183);
    doc.text('- สวมหมวกนิรภัย', 12, 190);
    doc.text('- สวมรองเท้านิรภัย', 12, 197);

    doc.text('อุปกรณ์ประจำรถ', 110, 176);
    doc.text('- สายรัด 6 เส้น', 110, 183);
    doc.text('- ผ้าใบคลุมงาน (รถ OPEN)', 110, 190);
    doc.text('- ผ้าริ้วธง 30 ผืน', 110, 197);

    doc.text('F-TR-002', 180, 285);
    doc.save(`today-job-${source.workDate || getLocalDate()}.pdf`);
  };

  const handleSaveToFirebase = async () => {
    if (isSaving) return;
    if (!user?.uid) {
      alert('ไม่พบผู้ใช้งานที่ล็อกอิน กรุณาออกแล้วเข้าใหม่');
      return;
    }
    if (!formData.assignedToUid) {
      alert('กรุณาระบุพนักงานผู้รับงาน');
      return;
    }

    const totalRounds = toRoundCount(formData.quantity);
    if (!totalRounds) {
      alert('กรุณาระบุจำนวนรอบเป็นตัวเลขที่มากกว่า 0');
      return;
    }

    setIsSaving(true);
    let createdCount = 0;
    try {
      const assignedName = selectedAssignedUser?.displayName || formData.driverName || '-';
      const baseWorkOrderNo = (formData.workOrderNo || generateWorkOrderNo()).trim();

      for (let index = 0; index < totalRounds; index += 1) {
        const roundNumber = index + 1;
        const roundWorkOrderNo =
          totalRounds > 1 ? `${baseWorkOrderNo}-R${roundNumber}` : baseWorkOrderNo;
        const roundForm = {
          ...formData,
          quantity: '1',
          workOrderNo: roundWorkOrderNo,
        };
        const roundSummaryText = buildSummaryText(roundForm);

        const createdJob = await addTodayJob({
          ...roundForm,
          rounds: 1,
          ticketNo: roundWorkOrderNo,
          assignedToName: assignedName,
          summaryText: roundSummaryText,
          status: 'pending',
          readyToClose: false,
          readyToCloseAt: null,
          acceptedAt: null,
          driverUpdateCount: 0,
          completedAt: null,
          completedByUid: '',
          lastSavedAt: Date.now(),
          updatedByUid: user.uid,
          createdByUid: user.uid,
          createdByName: userProfile?.displayName || user.email || 'unknown'
        });
        createdCount += 1;

        try {
          await triggerTodayJobNotification('create', createdJob.id);
        } catch (notifyError) {
          console.error('Notify create event failed:', notifyError);
        }

        if (index < totalRounds - 1) {
          await sleep(3000);
        }
      }
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 1300);
      setFormData(initialFormData());
    } catch (error) {
      console.error('Save today job failed:', error);
      if (createdCount > 0) {
        alert(`สร้างสำเร็จแล้ว ${createdCount} รอบ แต่เกิดข้อผิดพลาดระหว่างทำรายการ กรุณาตรวจสอบข้อมูลล่าสุด`);
        return;
      }
      if (error instanceof FirebaseError) {
        if (error.code === 'permission-denied') {
          alert('บันทึกไม่สำเร็จ: ไม่มีสิทธิ์เขียนคอลเลกชัน today_jobs (permission-denied)\nกรุณาเพิ่ม Firestore Rules สำหรับ today_jobs');
        } else {
          alert(`บันทึกไม่สำเร็จ: ${error.code}`);
        }
      } else {
        alert('บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (jobId: string, status: JobStatus) => {
    if (updatingJobId) return;

    setUpdatingJobId(jobId);
    try {
      const target = jobs.find((job) => job.id === jobId);
      const keepReady = status === 'in_progress' ? !!target?.readyToClose : false;
      await updateTodayJob(jobId, {
        status,
        readyToClose: keepReady,
        readyToCloseAt: keepReady ? (target?.readyToCloseAt || Date.now()) : null,
        completedAt: status === 'completed' ? Date.now() : null,
      });
      if (status === 'completed') {
        try {
          await triggerTodayJobNotification('complete', jobId);
        } catch (notifyError) {
          console.error('Notify complete event failed:', notifyError);
        }
      }
    } catch (error) {
      console.error('Update status failed:', error);
      if (error instanceof FirebaseError) {
        alert(`อัปเดตสถานะไม่สำเร็จ: ${error.code}`);
      } else {
        alert('อัปเดตสถานะไม่สำเร็จ');
      }
    } finally {
      setUpdatingJobId(null);
    }
  };

  const openJobDetail = (job: TodayJobEntry) => {
    setSelectedJobId(job.id);
    setShowDetailModal(true);
  };

  const openEditModal = (job: TodayJobEntry) => {
    setEditingJobId(job.id);
    setEditForm(toEditableForm(job));
    setEditBaseRevision(
      typeof job.revision === 'number' && Number.isFinite(job.revision)
        ? job.revision
        : null
    );
  };

  const handleEditField = (field: keyof TodayJobForm, value: string) => {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleEditAssignedUser = (assignedToUid: string) => {
    const assignedUser = assignableUsers.find((row) => row.uid === assignedToUid);
    const driverFullName =
      assignedUser?.fullName?.trim() ||
      assignedUser?.displayName ||
      '';
    const profilePhone = extractUserPhone(assignedUser as (Partial<UserProfile> & Record<string, unknown>) | undefined);
    setEditForm((prev) => (
      prev
        ? {
            ...prev,
            assignedToUid,
            driverName: driverFullName || prev.driverName,
            driverPhone: profilePhone || '',
          }
        : prev
    ));

    if (!assignedToUid || profilePhone) return;
    void getUserProfile(assignedToUid)
      .then((profile) => {
        const fetchedPhone = extractUserPhone(profile as (Partial<UserProfile> & Record<string, unknown>) | null);
        if (!fetchedPhone) return;
        setEditForm((prev) =>
          prev && prev.assignedToUid === assignedToUid
            ? { ...prev, driverPhone: fetchedPhone }
            : prev
        );
      })
      .catch((error) => {
        console.error('Load assigned user phone for edit failed:', error);
      });
  };

  const handleEditPoint = (point: 'pickup' | 'delivery', field: keyof DispatchPoint, value: string) => {
    setEditForm((prev) => (prev ? { ...prev, [point]: { ...prev[point], [field]: value } } : prev));
  };

  const handleSaveEdit = async () => {
    if (!editingJobId || !editForm || isEditingSave) return;
    setIsEditingSave(true);

    try {
      const assignedName =
        assignableUsers.find((row) => row.uid === editForm.assignedToUid)?.displayName ||
        editForm.driverName ||
        '-';

      await updateTodayJob(editingJobId, {
        ...editForm,
        ticketNo: editForm.workOrderNo,
        assignedToName: assignedName,
        summaryText: buildSummaryText(editForm),
        lastSavedAt: Date.now(),
        updatedByUid: user?.uid || '',
      }, editBaseRevision ?? undefined);
      try {
        await triggerTodayJobNotification('update', editingJobId);
      } catch (notifyError) {
        console.error('Notify update event failed:', notifyError);
      }
      setEditingJobId(null);
      setEditForm(null);
      setEditBaseRevision(null);
    } catch (error) {
      console.error('Save edit failed:', error);
      if (error instanceof RevisionConflictError) {
        const latest = await getTodayJobById(editingJobId);
        if (latest) {
          setEditForm(toEditableForm(latest));
          setEditBaseRevision(
            typeof latest.revision === 'number' && Number.isFinite(latest.revision)
              ? latest.revision
              : null
          );
        }
        alert('ใบแจ้งงานนี้ถูกแก้ไขจากอุปกรณ์อื่น ระบบโหลดข้อมูลล่าสุดแล้ว กรุณาตรวจสอบอีกครั้งก่อนกดบันทึก');
        return;
      }
      if (error instanceof FirebaseError) {
        alert(`บันทึกการแก้ไขไม่สำเร็จ: ${error.code}`);
      } else {
        alert('บันทึกการแก้ไขไม่สำเร็จ');
      }
    } finally {
      setIsEditingSave(false);
    }
  };

  const handleRequestDelete = (job: TodayJobEntry) => {
    if (!isAdmin) return;
    setJobToDelete(job);
    setShowDeleteConfirmModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!jobToDelete || isDeleting) return;
    setIsDeleting(true);

    try {
      await deleteTodayJob(jobToDelete.id);
      setShowDeleteConfirmModal(false);
      setShowDetailModal(false);
      setSelectedJobId(null);
      setJobToDelete(null);
      setShowDeleteSuccessModal(true);
      setTimeout(() => setShowDeleteSuccessModal(false), 1000);
    } catch (error) {
      console.error('Delete today job failed:', error);
      if (error instanceof FirebaseError) {
        alert(`ลบไม่สำเร็จ: ${error.code}`);
      } else {
        alert('ลบไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const openBadgeModal = (title: string, list: TodayJobEntry[]) => {
    setCardModalTitle(title);
    setCardModalJobs(list);
    setShowCardModal(true);
  };

  const statusBadgeClass = (status: JobStatus) =>
    status === 'completed'
      ? 'bg-emerald-500/15 text-emerald-500'
      : status === 'in_progress'
        ? 'bg-amber-500/15 text-amber-500'
        : 'bg-slate-500/15 text-slate-500';

  const mainTabs: Array<{ id: MainSectionTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
    { id: 'overview', label: 'งานวันนี้', icon: CalendarClock },
    { id: 'form', label: 'ฟอร์มแจ้งงาน', icon: Pencil },
    { id: 'table', label: 'ตารางข้อมูลแจ้งงาน', icon: Truck },
  ];

  return (
    <div className="space-y-6 animate-fade-in overflow-x-hidden">
      <section className={`${cardClass} p-3 md:p-4`}>
        <div className={`rounded-2xl border p-2 ${isDark ? 'border-dark-muted/30 bg-dark-bg/45' : 'border-white/80 bg-[#e8ecf1]'}`}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="tablist" aria-label="งานวันนี้แท็บหลัก">
            {mainTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeMainTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`today-tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`today-panel-${tab.id}`}
                  onClick={() => setActiveMainTab(tab.id)}
                  className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-gradient-to-r from-[#0f766e] via-[#0e7490] to-[#075985] text-white shadow-lg'
                      : isDark
                        ? 'text-dark-muted hover:bg-white/5'
                        : 'text-light-muted hover:bg-white/60'
                  }`}
                >
                  <Icon size={16} className={isActive ? 'text-white' : 'text-current'} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {activeMainTab === 'overview' && (
        <div role="tabpanel" id="today-panel-overview" aria-labelledby="today-tab-overview" className="space-y-6">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#0f766e] via-[#0e7490] to-[#075985] px-6 py-4 text-white md:px-7 md:py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/80">Dispatch Center</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight md:text-[2rem]">งานวันนี้</h1>
              <p className="mt-1 text-sm text-white/90">แดชบอร์ด + ฟอร์มแจ้งงาน + ตารางประวัติในหน้าเดียว</p>
            </div>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/30 bg-white/15 shadow-[inset_1px_1px_0_rgba(255,255,255,0.35)]">
              <ClipboardCheck className="h-7 w-7 text-white" />
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2 md:p-7 xl:grid-cols-4">
          <button type="button" onClick={() => openBadgeModal('งานวันนี้ทั้งหมด', todayJobs)} className={`rounded-xl p-4 text-left transition hover:-translate-y-0.5 ${isDark ? 'bg-dark-bg/60 hover:bg-dark-bg/80' : 'bg-cyan-50 hover:bg-cyan-100'}`}>
            <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-slate-600'}`}>งานวันนี้ทั้งหมด</p>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-2xl font-semibold">{dashboardStats.todayTotal}</p>
              <Truck className="h-5 w-5 text-cyan-500" />
            </div>
          </button>
          <button type="button" onClick={() => openBadgeModal('งานเสร็จแล้ววันนี้', todayCompletedJobs)} className={`rounded-xl p-4 text-left transition hover:-translate-y-0.5 ${isDark ? 'bg-dark-bg/60 hover:bg-dark-bg/80' : 'bg-emerald-50 hover:bg-emerald-100'}`}>
            <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-slate-600'}`}>งานเสร็จแล้ววันนี้</p>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-2xl font-semibold">{dashboardStats.todayCompleted}</p>
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
          </button>
          <button type="button" onClick={() => openBadgeModal('งานที่กำลังจะมา (7 วัน)', upcomingWeeklyJobs)} className={`rounded-xl p-4 text-left transition hover:-translate-y-0.5 ${isDark ? 'bg-dark-bg/60 hover:bg-dark-bg/80' : 'bg-amber-50 hover:bg-amber-100'}`}>
            <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-slate-600'}`}>งานที่กำลังจะมา (7 วัน)</p>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-2xl font-semibold">{dashboardStats.upcomingWeekly}</p>
              <CalendarClock className="h-5 w-5 text-amber-500" />
            </div>
          </button>
          <button type="button" onClick={() => openBadgeModal('งานของพนักงานที่รับงานสูงสุดสัปดาห์นี้', dashboardStats.topDriverWeekJobs)} className={`rounded-xl p-4 text-left transition hover:-translate-y-0.5 ${isDark ? 'bg-dark-bg/60 hover:bg-dark-bg/80' : 'bg-violet-50 hover:bg-violet-100'}`}>
            <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-slate-600'}`}>พนักงานที่รับงานสูงสุดสัปดาห์นี้</p>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-sm font-semibold">{dashboardStats.weekByDriver[0]?.name || '-'}</p>
              <UserCheck className="h-5 w-5 text-violet-500" />
            </div>
            <p className="mt-1 text-xs text-violet-500">{dashboardStats.weekByDriver[0]?.count || 0} งาน</p>
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className={`${cardClass} p-5`}>
          <h2 className="text-base font-semibold">จำนวนงานที่พนักงานได้รับ (รายสัปดาห์)</h2>
          <div className="mt-3 space-y-2">
            {dashboardStats.weekByDriver.length === 0 ? (
              <p className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>ยังไม่มีข้อมูลงานในสัปดาห์นี้</p>
            ) : (
              dashboardStats.weekByDriver.map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded-lg border border-accent-primary/15 px-3 py-2 text-sm">
                  <span>{item.name}</span>
                  <span className="font-semibold text-accent-primary">{item.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={`${cardClass} p-5`}>
          <h2 className="text-base font-semibold">จำนวนงานที่พนักงานได้รับ (รายเดือน)</h2>
          <div className="mt-3 space-y-2">
            {dashboardStats.monthByDriver.length === 0 ? (
              <p className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>ยังไม่มีข้อมูลงานในเดือนนี้</p>
            ) : (
              dashboardStats.monthByDriver.map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded-lg border border-accent-secondary/15 px-3 py-2 text-sm">
                  <span>{item.name}</span>
                  <span className="font-semibold text-accent-secondary">{item.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
        </div>
      )}

      {activeMainTab === 'form' && (
        <div role="tabpanel" id="today-panel-form" aria-labelledby="today-tab-form" className="space-y-6">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#0f766e] via-[#0e7490] to-[#075985] px-5 py-4 text-white md:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/80">Dispatch Center</p>
              <h2 className="mt-1 text-xl font-black tracking-tight md:text-2xl">ฟอร์มแจ้งงาน</h2>
              <p className="mt-1 text-sm text-white/90">สร้างใบแจ้งงานและบันทึกเข้าระบบ</p>
            </div>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/30 bg-white/15 shadow-[inset_1px_1px_0_rgba(255,255,255,0.35)]">
              <Pencil className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="space-y-6 p-5 md:p-7">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>เลขที่ใบสั่งงาน</span>
              <input className={inputClass} value={formData.workOrderNo} onChange={(e) => updateField('workOrderNo', e.target.value)} />
            </label>
            <label className="text-sm">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>บริษัทผู้ว่าจ้าง</span>
              <div className="flex items-center gap-2">
                <input
                  list="employer-company-options"
                  className={inputClass}
                  value={formData.employerCompany}
                  onChange={(e) => updateField('employerCompany', e.target.value)}
                  placeholder="พิมพ์ค้นหาหรือเลือกบริษัทผู้ว่าจ้าง"
                />
                <button
                  type="button"
                  onClick={() =>
                    openQuickAddModal(OptionCategory.EMPLOYER_COMPANY, 'บริษัทผู้ว่าจ้าง', {
                      kind: 'field',
                      field: 'employerCompany',
                    })
                  }
                  disabled={quickAddSubmitting}
                  className={quickAddButtonClass}
                  aria-label="เพิ่มบริษัทผู้ว่าจ้าง"
                >
                  <Plus size={16} />
                </button>
              </div>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <label className="text-sm md:col-span-1">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>วันที่รับงานจากผู้ว่าจ้าง</span>
              <input type="date" className={inputClass} value={formData.workDate} onChange={(e) => updateField('workDate', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
            </label>
            <label className="text-sm md:col-span-1">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>ประเภทสินค้า</span>
              <div className="flex items-center gap-2">
                <input
                  list="product-type-options"
                  className={inputClass}
                  value={formData.productName}
                  onChange={(e) => updateField('productName', e.target.value)}
                  placeholder="พิมพ์ค้นหาหรือเลือกประเภทสินค้า"
                />
                <button
                  type="button"
                  onClick={() =>
                    openQuickAddModal(OptionCategory.PRODUCT_TYPE, 'ประเภทสินค้า', {
                      kind: 'field',
                      field: 'productName',
                    })
                  }
                  disabled={quickAddSubmitting}
                  className={quickAddButtonClass}
                  aria-label="เพิ่มประเภทสินค้า"
                >
                  <Plus size={16} />
                </button>
              </div>
            </label>
            <label className="text-sm md:col-span-1">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>ประเภทรถ</span>
              <div className="flex items-center gap-2">
                <input
                  list="vehicle-type-options"
                  className={selectClass}
                  value={formData.vehicleType}
                  onChange={(e) => updateField('vehicleType', e.target.value)}
                  placeholder="พิมพ์ค้นหาหรือเลือกประเภทรถ"
                />
                <button
                  type="button"
                  onClick={() =>
                    openQuickAddModal(OptionCategory.VEHICLE, 'ประเภทรถ', {
                      kind: 'field',
                      field: 'vehicleType',
                    })
                  }
                  disabled={quickAddSubmitting}
                  className={quickAddButtonClass}
                  aria-label="เพิ่มประเภทรถ"
                >
                  <Plus size={16} />
                </button>
              </div>
            </label>
            <label className="text-sm md:col-span-1">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>จำนวนรอบ</span>
              <input className={inputClass} value={formData.quantity} onChange={(e) => updateField('quantity', e.target.value)} />
            </label>
          </div>

          <div className={`space-y-3 md:hidden`}>
            <div className={`rounded-xl border p-3 ${isDark ? 'border-dark-muted/30 bg-dark-bg/35' : 'border-light-muted/30 bg-slate-50'}`}>
              <p className="mb-2 text-sm font-semibold">รับงาน</p>
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>สถานที่</span>
                  <div className="flex items-center gap-2">
                    <input
                      list="location-options"
                      className={selectClass}
                      value={formData.pickup.location}
                      onChange={(e) => updatePoint('pickup', 'location', e.target.value)}
                      placeholder="พิมพ์ค้นหาสถานที่รับ"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickAddModal(OptionCategory.LOCATION, 'สถานที่', {
                          kind: 'point',
                          point: 'pickup',
                          field: 'location',
                        })
                      }
                      disabled={quickAddSubmitting}
                      className={quickAddButtonClass}
                      aria-label="เพิ่มสถานที่รับ"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </label>
                <label className="block text-sm">
                  <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>วันที่</span>
                  <input type="date" className={pointInputClass} value={formData.pickup.date} onChange={(e) => updatePoint('pickup', 'date', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                </label>
                <label className="block text-sm">
                  <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>เวลา</span>
                  <input type="time" lang="en-GB" step={60} className={pointInputClass} value={formData.pickup.time} onChange={(e) => updatePoint('pickup', 'time', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                </label>
                <label className="block text-sm">
                  <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>ติดต่อ</span>
                  <div className="flex items-center gap-2">
                    <input
                      list="contact-options"
                      className={pointInputClass}
                      value={formData.pickup.contact}
                      onChange={(e) => updatePoint('pickup', 'contact', e.target.value)}
                      placeholder="พิมพ์ค้นหาหรือเลือกผู้ติดต่อ"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickAddModal(OptionCategory.CONTACT, 'ผู้ติดต่อ', {
                          kind: 'point',
                          point: 'pickup',
                          field: 'contact',
                        })
                      }
                      disabled={quickAddSubmitting}
                      className={quickAddButtonClass}
                      aria-label="เพิ่มผู้ติดต่อจุดรับ"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </label>
              </div>
            </div>
            <div className={`rounded-xl border p-3 ${isDark ? 'border-dark-muted/30 bg-dark-bg/35' : 'border-light-muted/30 bg-slate-50'}`}>
              <p className="mb-2 text-sm font-semibold">ส่งงาน</p>
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>สถานที่</span>
                  <div className="flex items-center gap-2">
                    <input
                      list="location-options"
                      className={selectClass}
                      value={formData.delivery.location}
                      onChange={(e) => updatePoint('delivery', 'location', e.target.value)}
                      placeholder="พิมพ์ค้นหาสถานที่ส่ง"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickAddModal(OptionCategory.LOCATION, 'สถานที่', {
                          kind: 'point',
                          point: 'delivery',
                          field: 'location',
                        })
                      }
                      disabled={quickAddSubmitting}
                      className={quickAddButtonClass}
                      aria-label="เพิ่มสถานที่ส่ง"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </label>
                <label className="block text-sm">
                  <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>วันที่</span>
                  <input type="date" className={pointInputClass} value={formData.delivery.date} onChange={(e) => updatePoint('delivery', 'date', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                </label>
                <label className="block text-sm">
                  <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>เวลา</span>
                  <input type="time" lang="en-GB" step={60} className={pointInputClass} value={formData.delivery.time} onChange={(e) => updatePoint('delivery', 'time', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                </label>
                <label className="block text-sm">
                  <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>ติดต่อ</span>
                  <div className="flex items-center gap-2">
                    <input
                      list="contact-options"
                      className={pointInputClass}
                      value={formData.delivery.contact}
                      onChange={(e) => updatePoint('delivery', 'contact', e.target.value)}
                      placeholder="พิมพ์ค้นหาหรือเลือกผู้ติดต่อ"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickAddModal(OptionCategory.CONTACT, 'ผู้ติดต่อ', {
                          kind: 'point',
                          point: 'delivery',
                          field: 'contact',
                        })
                      }
                      disabled={quickAddSubmitting}
                      className={quickAddButtonClass}
                      aria-label="เพิ่มผู้ติดต่อจุดส่ง"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className={`hidden overflow-hidden rounded-xl border md:block ${isDark ? 'border-dark-muted/30' : 'border-light-muted/30'}`}>
            <div className={`grid grid-cols-[120px_1fr_1fr] ${isDark ? 'bg-dark-bg/60' : 'bg-slate-100/70'}`}>
              <div className={`border-r px-3 py-2 text-center text-sm font-medium ${isDark ? 'border-dark-muted/30 text-dark-muted' : 'border-light-muted/30 text-light-muted'}`}>หัวข้อ</div>
              <div className={`border-r px-3 py-2 text-center text-sm font-semibold ${isDark ? 'border-dark-muted/30' : 'border-light-muted/30'}`}>รับงาน</div>
              <div className="px-3 py-2 text-center text-sm font-semibold">ส่งงาน</div>
            </div>
            <div className="space-y-0">
              <div className={`grid grid-cols-[120px_1fr_1fr] ${isDark ? 'border-t border-dark-muted/25' : 'border-t border-light-muted/25'}`}>
                <div className={`border-r px-3 py-3 text-sm font-medium ${isDark ? 'border-dark-muted/25 text-dark-muted' : 'border-light-muted/25 text-light-muted'}`}>สถานที่</div>
                <div className={`border-r px-2 py-2 ${isDark ? 'border-dark-muted/25' : 'border-light-muted/25'}`}>
                  <div className="flex items-center gap-2">
                    <input
                      list="location-options"
                      className={selectClass}
                      value={formData.pickup.location}
                      onChange={(e) => updatePoint('pickup', 'location', e.target.value)}
                      placeholder="พิมพ์ค้นหาสถานที่รับ"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickAddModal(OptionCategory.LOCATION, 'สถานที่', {
                          kind: 'point',
                          point: 'pickup',
                          field: 'location',
                        })
                      }
                      disabled={quickAddSubmitting}
                      className={quickAddButtonClass}
                      aria-label="เพิ่มสถานที่รับ"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
                <div className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <input
                      list="location-options"
                      className={selectClass}
                      value={formData.delivery.location}
                      onChange={(e) => updatePoint('delivery', 'location', e.target.value)}
                      placeholder="พิมพ์ค้นหาสถานที่ส่ง"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickAddModal(OptionCategory.LOCATION, 'สถานที่', {
                          kind: 'point',
                          point: 'delivery',
                          field: 'location',
                        })
                      }
                      disabled={quickAddSubmitting}
                      className={quickAddButtonClass}
                      aria-label="เพิ่มสถานที่ส่ง"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <div className={`grid grid-cols-[120px_1fr_1fr] ${isDark ? 'border-t border-dark-muted/25' : 'border-t border-light-muted/25'}`}>
                <div className={`border-r px-3 py-3 text-sm font-medium ${isDark ? 'border-dark-muted/25 text-dark-muted' : 'border-light-muted/25 text-light-muted'}`}>วันที่</div>
                <div className={`border-r px-2 py-2 ${isDark ? 'border-dark-muted/25' : 'border-light-muted/25'}`}>
                  <input type="date" className={pointInputClass} value={formData.pickup.date} onChange={(e) => updatePoint('pickup', 'date', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                </div>
                <div className="px-2 py-2">
                  <input type="date" className={pointInputClass} value={formData.delivery.date} onChange={(e) => updatePoint('delivery', 'date', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                </div>
              </div>
              <div className={`grid grid-cols-[120px_1fr_1fr] ${isDark ? 'border-t border-dark-muted/25' : 'border-t border-light-muted/25'}`}>
                <div className={`border-r px-3 py-3 text-sm font-medium ${isDark ? 'border-dark-muted/25 text-dark-muted' : 'border-light-muted/25 text-light-muted'}`}>เวลา</div>
                <div className={`border-r px-2 py-2 ${isDark ? 'border-dark-muted/25' : 'border-light-muted/25'}`}>
                  <input type="time" lang="en-GB" step={60} className={pointInputClass} value={formData.pickup.time} onChange={(e) => updatePoint('pickup', 'time', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                </div>
                <div className="px-2 py-2">
                  <input type="time" lang="en-GB" step={60} className={pointInputClass} value={formData.delivery.time} onChange={(e) => updatePoint('delivery', 'time', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                </div>
              </div>
              <div className={`grid grid-cols-[120px_1fr_1fr] ${isDark ? 'border-t border-dark-muted/25' : 'border-t border-light-muted/25'}`}>
                <div className={`border-r px-3 py-3 text-sm font-medium ${isDark ? 'border-dark-muted/25 text-dark-muted' : 'border-light-muted/25 text-light-muted'}`}>ติดต่อ</div>
                <div className={`border-r px-2 py-2 ${isDark ? 'border-dark-muted/25' : 'border-light-muted/25'}`}>
                  <div className="flex items-center gap-2">
                    <input
                      list="contact-options"
                      className={pointInputClass}
                      value={formData.pickup.contact}
                      onChange={(e) => updatePoint('pickup', 'contact', e.target.value)}
                      placeholder="พิมพ์ค้นหาหรือเลือกผู้ติดต่อ"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickAddModal(OptionCategory.CONTACT, 'ผู้ติดต่อ', {
                          kind: 'point',
                          point: 'pickup',
                          field: 'contact',
                        })
                      }
                      disabled={quickAddSubmitting}
                      className={quickAddButtonClass}
                      aria-label="เพิ่มผู้ติดต่อจุดรับ"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
                <div className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <input
                      list="contact-options"
                      className={pointInputClass}
                      value={formData.delivery.contact}
                      onChange={(e) => updatePoint('delivery', 'contact', e.target.value)}
                      placeholder="พิมพ์ค้นหาหรือเลือกผู้ติดต่อ"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickAddModal(OptionCategory.CONTACT, 'ผู้ติดต่อ', {
                          kind: 'point',
                          point: 'delivery',
                          field: 'contact',
                        })
                      }
                      disabled={quickAddSubmitting}
                      className={quickAddButtonClass}
                      aria-label="เพิ่มผู้ติดต่อจุดส่ง"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <label className="text-sm">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>มอบหมายพนักงาน (แอพ)</span>
              <select
                className={selectClass}
                value={formData.assignedToUid}
                onChange={(e) => updateAssignedUser(e.target.value)}
              >
                <option value="">เลือกผู้รับงาน</option>
                {assignableUsers.map((staff) => (
                  <option key={staff.uid} value={staff.uid}>
                    {staff.displayName} ({staff.email}) {staff.role === 'admin' ? '[Admin]' : '[User]'}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>พนักงานขับรถ</span>
              <div className="flex items-center gap-2">
                <input
                  list="driver-options"
                  className={selectClass}
                  value={formData.driverName}
                  onChange={(e) => updateField('driverName', e.target.value)}
                  placeholder="พิมพ์ค้นหาคนขับ"
                />
                <button
                  type="button"
                  onClick={() =>
                    openQuickAddModal(OptionCategory.DRIVER, 'พนักงานขับรถ', {
                      kind: 'field',
                      field: 'driverName',
                    })
                  }
                  disabled={quickAddSubmitting}
                  className={quickAddButtonClass}
                  aria-label="เพิ่มพนักงานขับรถ"
                >
                  <Plus size={16} />
                </button>
              </div>
            </label>
            <label className="text-sm">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>เบอร์ติดต่อ</span>
              <input className={inputClass} value={formData.driverPhone} onChange={(e) => updateField('driverPhone', e.target.value)} />
            </label>
            <label className="text-sm">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>ทะเบียน</span>
              <div className="flex items-center gap-2">
                <input
                  list="plate-options"
                  className={selectClass}
                  value={formData.plateNo}
                  onChange={(e) => updateField('plateNo', e.target.value)}
                  placeholder="พิมพ์ค้นหาทะเบียนรถ"
                />
                <button
                  type="button"
                  onClick={() =>
                    openQuickAddModal(OptionCategory.PLATE, 'ทะเบียน', {
                      kind: 'field',
                      field: 'plateNo',
                    })
                  }
                  disabled={quickAddSubmitting}
                  className={quickAddButtonClass}
                  aria-label="เพิ่มทะเบียน"
                >
                  <Plus size={16} />
                </button>
              </div>
            </label>
          </div>

          {formData.assignedToUid && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${isDark ? 'border-dark-muted/25 bg-dark-bg/40 text-dark-muted' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
              มอบหมายให้: {selectedAssignedUser?.displayName || formData.driverName || '-'}
            </div>
          )}

          <label className="block text-sm">
            <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>หมายเหตุ</span>
            <textarea rows={3} className={isDark ? 'mt-2 w-full rounded-xl border border-dark-muted/30 bg-dark-bg/40 px-3 py-2 text-sm text-dark-text focus:border-accent-primary focus:outline-none' : 'mt-2 w-full rounded-xl border border-light-muted/30 bg-white px-3 py-2 text-sm text-light-text focus:border-accent-primary focus:outline-none'} value={formData.importantNote} onChange={(e) => updateField('importantNote', e.target.value)} />
          </label>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleSaveToFirebase} disabled={isSaving} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-lg transition ${isSaving ? 'bg-slate-500/70' : 'bg-gradient-to-r from-[#047857] to-[#15803d] hover:brightness-110'}`}>
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              บันทึก Firebase
            </button>
            <button type="button" onClick={handleReset} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${isDark ? 'bg-dark-bg/70 text-dark-text hover:bg-dark-bg' : 'bg-slate-100 text-light-text hover:bg-slate-200'}`}>
              <RotateCcw size={16} />
              ล้างข้อมูล
            </button>
          </div>
        </div>
      </section>

      <section className={`${cardClass} p-5 md:p-7`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">ข้อความสรุปสำหรับแจ้งคนรถ</h2>
            <p className={`mt-1 text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>คัดลอกข้อความนี้ไปส่งในไลน์กลุ่มหรือแชตงานได้ทันที</p>
          </div>
          <button type="button" onClick={handleCopySummary} className="inline-flex items-center gap-2 rounded-xl bg-accent-primary px-4 py-2 text-sm font-medium text-white transition hover:brightness-110">
            {isCopySuccess ? <Check size={16} /> : <Copy size={16} />}
            {isCopySuccess ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ'}
          </button>
        </div>
        <div className={isDark ? 'mt-3 w-full rounded-xl border border-dark-muted/30 bg-dark-bg/50 px-3 py-3 text-sm text-dark-text' : 'mt-3 w-full rounded-xl border border-light-muted/30 bg-slate-50 px-3 py-3 text-sm text-light-text'}>
          <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">{summaryText}</pre>
        </div>
      </section>

      <Modal
        isOpen={quickAddModal.open}
        onClose={closeQuickAddModal}
        title={`เพิ่ม${quickAddModal.label}`}
      >
        <div className="space-y-4">
          <p className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
            กรอกค่าใหม่เพื่อเพิ่มเข้าในรายการตั้งค่า แล้วนำมาใช้งานทันที
          </p>
          <input
            autoFocus
            value={quickAddValue}
            onChange={(e) => setQuickAddValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleConfirmQuickAdd();
              }
            }}
            placeholder={`ระบุ${quickAddModal.label}`}
            className={selectClass}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={closeQuickAddModal}
              disabled={quickAddSubmitting}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                isDark
                  ? 'bg-dark-bg/60 text-dark-text hover:bg-dark-bg'
                  : 'bg-slate-100 text-light-text hover:bg-slate-200'
              } disabled:opacity-60`}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmQuickAdd()}
              disabled={quickAddSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0f766e] via-[#0e7490] to-[#075985] px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
            >
              {quickAddSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              เพิ่มรายการ
            </button>
          </div>
        </div>
      </Modal>

      <datalist id="vehicle-type-options">{vehicleTypeOptions.map((vehicle) => <option key={vehicle} value={vehicle} />)}</datalist>
      <datalist id="location-options">{locationOptions.map((location) => <option key={location} value={location} />)}</datalist>
      <datalist id="driver-options">{driverOptions.map((driver) => <option key={driver} value={driver} />)}</datalist>
      <datalist id="plate-options">{plateOptions.map((plate) => <option key={plate} value={plate} />)}</datalist>
      <datalist id="employer-company-options">{employerCompanyOptions.map((company) => <option key={company} value={company} />)}</datalist>
      <datalist id="product-type-options">{productTypeOptions.map((product) => <option key={product} value={product} />)}</datalist>
      <datalist id="contact-options">{contactOptions.map((contact) => <option key={contact} value={contact} />)}</datalist>
        </div>
      )}

      {activeMainTab === 'table' && (
      <div role="tabpanel" id="today-panel-table" aria-labelledby="today-tab-table">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#0f766e] via-[#0e7490] to-[#075985] px-5 py-4 text-white md:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/80">Dispatch Center</p>
              <h2 className="mt-1 text-xl font-black tracking-tight md:text-2xl">ตารางข้อมูลการแจ้งงาน</h2>
              <p className="mt-1 text-sm text-white/90">คลิกที่แถวเพื่อเปิดรายละเอียด/แก้ไข/ลบ</p>
            </div>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/30 bg-white/15 shadow-[inset_1px_1px_0_rgba(255,255,255,0.35)]">
              <Truck className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 md:px-7 ${isDark ? 'border-dark-muted/25 bg-dark-bg/40' : 'border-light-muted/20 bg-slate-50'}`}>
          <div>
            <h3 className="text-base font-semibold">ค้นหาและกรองข้อมูล</h3>
            <p className={`mt-1 text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>เลือกสถานะหรือพิมพ์คำค้นเพื่อดูรายการที่ต้องการ</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="ค้นหา Job No./คนขับ/ทะเบียน" className={isDark ? 'min-h-11 rounded-xl border border-dark-muted/35 bg-dark-bg/50 px-3 py-2.5 text-[16px] md:text-sm text-dark-text focus:border-accent-primary focus:outline-none' : 'min-h-11 rounded-xl border border-light-muted/35 bg-white px-3 py-2.5 text-[16px] md:text-sm text-light-text focus:border-accent-primary focus:outline-none'} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | JobStatus)} className={isDark ? 'min-h-11 rounded-xl border border-dark-muted/35 bg-dark-bg/50 px-3 py-2.5 text-[16px] md:text-sm text-dark-text focus:border-accent-primary focus:outline-none' : 'min-h-11 rounded-xl border border-light-muted/35 bg-white px-3 py-2.5 text-[16px] md:text-sm text-light-text focus:border-accent-primary focus:outline-none'}>
              <option value="all">ทุกสถานะ</option>
              <option value="pending">รอดำเนินการ</option>
              <option value="in_progress">กำลังทำงาน</option>
              <option value="completed">เสร็จแล้ว</option>
            </select>
          </div>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {filteredJobs.length === 0 ? (
            <div className={`rounded-xl border px-4 py-6 text-center text-sm ${isDark ? 'border-dark-muted/25 text-dark-muted' : 'border-light-muted/30 text-light-muted'}`}>
              ไม่พบข้อมูล
            </div>
          ) : (
            filteredJobs.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => openJobDetail(job)}
                className={`w-full rounded-xl border p-4 text-left transition ${isDark ? 'border-dark-muted/25 bg-dark-bg/30 hover:bg-dark-bg/55' : 'border-light-muted/30 bg-white hover:bg-slate-50'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-accent-primary">{asDateOnly(job.workDate)}</p>
                    <p className="text-base font-semibold">{job.jobNo || '-'}</p>
                    <p className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>{job.employerCompany || '-'}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${statusBadgeClass(job.status)}`}>
                    {job.status === 'completed' ? <CheckCircle2 size={12} /> : job.status === 'in_progress' ? <CircleDashed size={12} /> : <Circle size={12} />}
                    {statusLabelMap[job.status]}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-1 text-sm">
                  <p>คนขับ: {job.driverName || '-'} ({job.plateNo || '-'})</p>
                  <p className={isDark ? 'text-dark-muted' : 'text-light-muted'}>ผู้รับงานแอพ: {job.assignedToName || '-'}</p>
                  <p className={isDark ? 'text-dark-muted' : 'text-light-muted'}>{job.pickup.location || '-'} → {job.delivery.location || '-'}</p>
                  <p className={isDark ? 'text-dark-muted' : 'text-light-muted'}>{job.pickup.time || '-'} / {job.delivery.time || '-'}</p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-sm">
            <thead className={isDark ? 'bg-dark-bg/60 text-dark-muted' : 'bg-slate-100 text-slate-600'}>
              <tr>
                <th className="px-3 py-2 text-left">วันที่งาน</th>
                <th className="px-3 py-2 text-left">ลูกค้า</th>
                <th className="px-3 py-2 text-left">ต้นทาง-ปลายทาง</th>
                <th className="px-3 py-2 text-left">ประเภทรถ / ป้ายทะเบียน</th>
                <th className="px-3 py-2 text-left">คนขับ</th>
                <th className="px-3 py-2 text-left">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`px-3 py-6 text-center ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>ไม่พบข้อมูล</td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
                  <tr key={job.id} onClick={() => openJobDetail(job)} className={`cursor-pointer transition ${isDark ? 'border-t border-dark-muted/20 hover:bg-white/5' : 'border-t border-light-muted/20 hover:bg-slate-50'}`}>
                    <td className="px-3 py-3 align-top">{asDateOnly(job.workDate)}</td>
                    <td className="px-3 py-3 align-top">{job.employerCompany || '-'}</td>
                    <td className="px-3 py-3 align-top text-xs">
                      <p>{job.pickup.location || '-'} → {job.delivery.location || '-'}</p>
                      <p className={isDark ? 'text-dark-muted' : 'text-light-muted'}>
                        วันที่รับ: {job.pickup.date || '-'} | วันที่ส่ง: {job.delivery.date || '-'}
                      </p>
                    </td>
                    <td className="px-3 py-3 align-top text-xs">
                      <p className="text-sm font-medium">{job.vehicleType || '-'}</p>
                      <p className={isDark ? 'text-dark-muted' : 'text-light-muted'}>{job.plateNo || '-'}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-xs">
                      <p className="text-sm font-medium">{getDriverFullName(job)}</p>
                      <p className={isDark ? 'text-dark-muted' : 'text-light-muted'}>รับงานแอพ: {getAssignedAppLabel(job)}</p>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${statusBadgeClass(job.status)}`}>
                        {job.status === 'completed' ? <CheckCircle2 size={12} /> : job.status === 'in_progress' ? <CircleDashed size={12} /> : <Circle size={12} />}
                        {statusLabelMap[job.status]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      </div>
      )}

      <ConfirmModal isOpen={showSuccessModal} onClose={() => setShowSuccessModal(false)} onConfirm={() => setShowSuccessModal(false)} title="บันทึกสำเร็จ!" message="สร้างรายการแจ้งงานเรียบร้อยแล้ว" type="success" confirmText="ตกลง" showCancel={false} />

      <ConfirmModal isOpen={showDeleteSuccessModal} onClose={() => setShowDeleteSuccessModal(false)} onConfirm={() => setShowDeleteSuccessModal(false)} title="ลบสำเร็จ" message="ลบรายการงานเรียบร้อยแล้ว" type="success" confirmText="ตกลง" showCancel={false} />

      <ConfirmModal
        isOpen={showDeleteConfirmModal}
        onClose={() => setShowDeleteConfirmModal(false)}
        onConfirm={handleConfirmDelete}
        title="ยืนยันการลบ"
        message={`ต้องการลบงาน ${jobToDelete?.jobNo || ''} ใช่หรือไม่`}
        type="warning"
        confirmText={isDeleting ? 'กำลังลบ...' : 'ลบ'}
        cancelText="ยกเลิก"
      />

      <Modal isOpen={showCardModal} onClose={() => setShowCardModal(false)} title={cardModalTitle}>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {cardModalJobs.length === 0 ? (
            <p className={isDark ? 'text-dark-muted' : 'text-light-muted'}>ไม่พบรายการ</p>
          ) : (
            cardModalJobs.map((job) => (
              <button
                key={job.id}
                type="button"
                className={`w-full rounded-xl border p-3 text-left transition ${isDark ? 'border-dark-muted/25 hover:bg-white/5' : 'border-light-muted/30 hover:bg-slate-50'}`}
                onClick={() => {
                  setShowCardModal(false);
                  openJobDetail(job);
                }}
              >
                <p className="font-semibold">{job.driverName || '-'}</p>
                <p className="text-xs">ทะเบียน: {job.plateNo || '-'}</p>
                <p className="text-xs">{job.pickup.location || '-'} → {job.delivery.location || '-'}</p>
                <p className="text-xs">{job.pickup.time || '-'} / {job.delivery.time || '-'}</p>
              </button>
            ))
          )}
        </div>
      </Modal>

      <Modal isOpen={showDetailModal && !!selectedJob} onClose={() => setShowDetailModal(false)} title="รายละเอียดงาน">
        {selectedJob && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><span className="font-medium">ลูกค้า:</span> {selectedJob.employerCompany || '-'}</div>
              <div><span className="font-medium">วันที่งาน:</span> {asDateOnly(selectedJob.workDate)}</div>
              <div><span className="font-medium">เลขที่ใบสั่งงาน:</span> {selectedJob.workOrderNo || selectedJob.ticketNo || '-'}</div>
              <div><span className="font-medium">Job No.:</span> {selectedJob.jobNo || '-'}</div>
              <div><span className="font-medium">คนขับ:</span> {getDriverFullName(selectedJob)}</div>
              <div><span className="font-medium">รับงานแอพ:</span> {getAssignedAppLabel(selectedJob)}</div>
              <div><span className="font-medium">ทะเบียน:</span> {selectedJob.plateNo || '-'}</div>
              <div><span className="font-medium">ชนิดรถ:</span> {selectedJob.vehicleType || '-'}</div>
              <div><span className="font-medium">สินค้า:</span> {selectedJob.productName || '-'}</div>
            </div>
            <div className={`rounded-xl border p-3 ${isDark ? 'border-dark-muted/25 bg-dark-bg/40' : 'border-light-muted/30 bg-slate-50'}`}>
              <p>รับงาน: {selectedJob.pickup.location || '-'} | {selectedJob.pickup.time || '-'}</p>
              <p>ส่งงาน: {selectedJob.delivery.location || '-'} | {selectedJob.delivery.time || '-'}</p>
              <p>ติดต่อ: {selectedJob.driverPhone || '-'}</p>
              <p>หมายเหตุ: {selectedJob.importantNote || '-'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => handleStatusChange(selectedJob.id, 'pending')} disabled={updatingJobId === selectedJob.id || selectedJob.status === 'pending'} className="rounded-lg border border-slate-400/40 px-3 py-1.5 text-xs disabled:opacity-50">รอดำเนินการ</button>
              <button type="button" onClick={() => handleStatusChange(selectedJob.id, 'in_progress')} disabled={updatingJobId === selectedJob.id || selectedJob.status === 'in_progress'} className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs disabled:opacity-50">กำลังทำ</button>
              <button type="button" onClick={() => handleStatusChange(selectedJob.id, 'completed')} disabled={updatingJobId === selectedJob.id || selectedJob.status === 'completed'} className="rounded-lg border border-emerald-400/40 px-3 py-1.5 text-xs disabled:opacity-50">เสร็จแล้ว</button>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleDownloadPdf(toEditableForm(selectedJob))}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#1d4ed8] to-[#0f766e] px-3 py-2 text-xs font-medium text-white"
              >
                <FileDown size={14} />
                ดาวน์โหลด PDF
              </button>
              <button type="button" onClick={() => openEditModal(selectedJob)} className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-3 py-2 text-xs font-medium text-white"><Pencil size={14} />แก้ไข</button>
              {isAdmin && (
                <button type="button" onClick={() => handleRequestDelete(selectedJob)} className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-xs font-medium text-white"><Trash2 size={14} />ลบ</button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!editingJobId && !!editForm} onClose={() => { setEditingJobId(null); setEditForm(null); setEditBaseRevision(null); }} title="แก้ไขรายการงาน">
        {editForm && (
          <div className="space-y-3 text-sm max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input className={selectClass} value={editForm.workOrderNo} onChange={(e) => handleEditField('workOrderNo', e.target.value)} placeholder="เลขที่ใบสั่งงาน (Work Order)" />
              <input className={selectClass} value={editForm.jobNo} onChange={(e) => handleEditField('jobNo', e.target.value)} placeholder="Job No." />
              <input type="date" className={selectClass} value={editForm.workDate} onChange={(e) => handleEditField('workDate', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
              <select className={selectClass} value={editForm.assignedToUid} onChange={(e) => handleEditAssignedUser(e.target.value)}>
                <option value="">เลือกผู้รับงานแอพ</option>
                {assignableUsers.map((staff) => (
                  <option key={staff.uid} value={staff.uid}>
                    {staff.displayName} ({staff.email}) {staff.role === 'admin' ? '[Admin]' : '[User]'}
                  </option>
                ))}
              </select>
              <input list="driver-options" className={selectClass} value={editForm.driverName} onChange={(e) => handleEditField('driverName', e.target.value)} placeholder="คนขับ" />
              <input list="plate-options" className={selectClass} value={editForm.plateNo} onChange={(e) => handleEditField('plateNo', e.target.value)} placeholder="ทะเบียน" />
              <input list="vehicle-type-options" className={selectClass} value={editForm.vehicleType} onChange={(e) => handleEditField('vehicleType', e.target.value)} placeholder="ชนิดรถ" />
              <input className={selectClass} value={editForm.productName} onChange={(e) => handleEditField('productName', e.target.value)} placeholder="สินค้า" />
              <input list="location-options" className={selectClass} value={editForm.pickup.location} onChange={(e) => handleEditPoint('pickup', 'location', e.target.value)} placeholder="ต้นทาง" />
              <input list="location-options" className={selectClass} value={editForm.delivery.location} onChange={(e) => handleEditPoint('delivery', 'location', e.target.value)} placeholder="ปลายทาง" />
              <input type="time" lang="en-GB" step={60} className={selectClass} value={editForm.pickup.time} onChange={(e) => handleEditPoint('pickup', 'time', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
              <input type="time" lang="en-GB" step={60} className={selectClass} value={editForm.delivery.time} onChange={(e) => handleEditPoint('delivery', 'time', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
            </div>
            <textarea rows={3} className={selectClass} value={editForm.importantNote} onChange={(e) => handleEditField('importantNote', e.target.value)} placeholder="หมายเหตุ" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setEditingJobId(null); setEditForm(null); setEditBaseRevision(null); }} className={`rounded-lg px-3 py-2 text-xs ${isDark ? 'bg-dark-bg text-dark-text' : 'bg-slate-100 text-slate-700'}`}>ยกเลิก</button>
              <button type="button" onClick={handleSaveEdit} disabled={isEditingSave} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">{isEditingSave ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TodayJobs;
