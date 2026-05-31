import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import jsPDF from 'jspdf';
import { FirebaseError } from 'firebase/app';
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  CircleDashed,
  Clock3,
  ClipboardCheck,
  Copy,
  FileText,
  FileDown,
  Loader2,
  MapPin,
  Package2,
  Plus,
  Pencil,
  Phone,
  RotateCcw,
  Save,
  Trash2,
  Truck,
  UserCheck,
  UserRound,
} from 'lucide-react';
import { useAdminUsers } from '../contexts/AdminUsersContext';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  addTodayJob,
  addOption,
  deleteTodayJob,
  fetchTodayJobsByPickupDateRange,
  getTodayJobById,
  RevisionConflictError,
  subscribeToTodayJobsByPickupDateRange,
  triggerTodayJobNotification,
  uploadImages,
  updateTodayJob
} from '../services/firebaseService';
import { getUserProfile } from '../services/userService';
import { DispatchPoint, OptionCategory, TodayJobEntry, UserProfile } from '../types';
import { NotoSansThaiBase64 } from '../fonts/NotoSansThai';
import ConfirmModal from '../components/ConfirmModal';
import Modal from '../components/Modal';

type TodayJobForm = {
  employerCompany: string;
  jobNo: string;
  invNo: string;
  transportDocNo: string;
  workOrderNo: string;
  orderDate: string;
  vehicleType: string;
  productName: string;
  quantity: string;
  pickup: DispatchPoint;
  delivery: DispatchPoint;
  assignedToUid: string;
  driverName: string;
  plateNo: string;
  driverPhone: string;
  fuelAndToll: string;
  importantNote: string;
  originImageUrls: string[];
  destinationImageUrls: string[];
  documentImageUrls: string[];
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

const addDays = (dateStr: string, days: number) => {
  const base = new Date(`${asDateOnly(dateStr)}T00:00:00`);
  if (Number.isNaN(base.getTime())) return asDateOnly(dateStr);
  base.setDate(base.getDate() + days);
  return base.toISOString().split('T')[0];
};

const asDateOnly = (dateStr: string) => (dateStr || '').split('T')[0];
const getJobDate = (job: Pick<TodayJobEntry, 'pickup'>) =>
  asDateOnly(job.pickup?.date || '');

const parseDate = (dateStr: string) => {
  const dateOnly = asDateOnly(dateStr);
  if (!dateOnly) return null;
  const parsed = new Date(`${dateOnly}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
type DatePickerEvent = React.MouseEvent<HTMLInputElement> | React.FocusEvent<HTMLInputElement>;

const getMonthKey = (dateStr = getLocalDate()) => asDateOnly(dateStr).slice(0, 7);

const shiftMonthKey = (monthKey: string, offset: number) => {
  const [yearPart, monthPart] = monthKey.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return getMonthKey();

  const shifted = new Date(year, month - 1 + offset, 1);
  const nextYear = shifted.getFullYear();
  const nextMonth = String(shifted.getMonth() + 1).padStart(2, '0');
  return `${nextYear}-${nextMonth}`;
};

const getMonthRange = (monthKey: string) => {
  const normalized = monthKey || getMonthKey();
  return {
    startDate: `${normalized}-01`,
    endDateExclusive: `${shiftMonthKey(normalized, 1)}-01`,
  };
};

const buildMonthOptions = (monthsBack: number, monthsForward = 0) => {
  const currentMonthKey = getMonthKey();
  const options: string[] = [];

  for (let offset = monthsForward; offset >= -monthsBack; offset -= 1) {
    options.push(shiftMonthKey(currentMonthKey, offset));
  }

  return options;
};

const compareJobsByDateAsc = (a: TodayJobEntry, b: TodayJobEntry) => {
  const dateA = getJobDate(a);
  const dateB = getJobDate(b);
  if (dateA !== dateB) return dateA.localeCompare(dateB);

  const timeA = (a.pickup?.time || '').trim();
  const timeB = (b.pickup?.time || '').trim();
  if (timeA !== timeB) return timeA.localeCompare(timeB);

  return (a.workOrderNo || a.ticketNo || '').localeCompare(b.workOrderNo || b.ticketNo || '');
};

const hasValue = (value?: string) => !!value && value.trim().length > 0;
const isDeliveryBeforePickup = (pickupDate?: string, deliveryDate?: string) =>
  !!pickupDate && !!deliveryDate && deliveryDate < pickupDate;
const isPickupBeforeOrderDate = (orderDate?: string, pickupDate?: string) =>
  !!orderDate && !!pickupDate && pickupDate < orderDate;
const formatPhoneNumber = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};
const parseRounds = (value?: string) => {
  const match = (value || '').match(/(\d+(\.\d+)?)/);
  if (!match) return 1;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const toImageUrls = (urls?: string[], single?: string): string[] => {
  if (Array.isArray(urls) && urls.length > 0) {
    return Array.from(
      new Set(urls.filter((url) => typeof url === 'string' && url.trim().length > 0).map((url) => url.trim()))
    );
  }
  if (typeof single === 'string' && single.trim().length > 0) {
    return [single.trim()];
  }
  return [];
};

const mergeImageUrls = (existing: string[], incoming: string[]): string[] => {
  return Array.from(
    new Set(
      [...existing, ...incoming]
        .filter((url) => typeof url === 'string' && url.trim().length > 0)
        .map((url) => url.trim())
    )
  );
};

const buildDropdownOptions = (baseOptions: string[], currentValue?: string): string[] => {
  const current = (currentValue || '').trim();
  if (!current) return baseOptions;
  return baseOptions.includes(current) ? baseOptions : [current, ...baseOptions];
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
  return parsed;
};
const resolveRounds = (job: Pick<TodayJobEntry, 'rounds' | 'quantity'>): number =>
  typeof job.rounds === 'number' && Number.isFinite(job.rounds) && job.rounds > 0
    ? job.rounds
    : parseRounds(job.quantity);
const resolveAssignedAppName = (user?: Pick<UserProfile, 'nickname' | 'displayName' | 'fullName'> | null) =>
  user?.nickname?.trim() ||
  user?.displayName?.trim() ||
  user?.fullName?.trim() ||
  '';

const formatAssignableUserLabel = (staff: Pick<UserProfile, 'nickname' | 'displayName' | 'fullName' | 'role'>) =>
  `${resolveAssignedAppName(staff)} [${staff.role === 'admin' ? 'Admin' : 'User'}]`;

const resolveDriverFullName = (user?: Pick<UserProfile, 'fullName' | 'displayName' | 'nickname'> | null) =>
  user?.fullName?.trim() ||
  user?.displayName?.trim() ||
  user?.nickname?.trim() ||
  '';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const DetailRow: React.FC<{ icon: React.ReactNode; value: string }> = ({ icon, value }) => (
  <div className="flex items-start gap-2">
    <div className="mt-0.5 shrink-0">{icon}</div>
    <div className="min-w-0 break-words leading-relaxed">{value}</div>
  </div>
);

const initialFormData = (): TodayJobForm => ({
  employerCompany: '',
  jobNo: '',
  invNo: '',
  transportDocNo: '',
  workOrderNo: generateWorkOrderNo(),
  orderDate: getLocalDate(),
  vehicleType: '',
  productName: '',
  quantity: '1',
  pickup: { location: '', date: getLocalDate(), time: '', contact: '' },
  delivery: { location: '', date: getLocalDate(), time: '', contact: '' },
  assignedToUid: '',
  driverName: '',
  plateNo: '',
  driverPhone: '',
  fuelAndToll: '',
  importantNote: '',
  originImageUrls: [],
  destinationImageUrls: [],
  documentImageUrls: [],
});

const toEditableForm = (job: TodayJobEntry): TodayJobForm => ({
  employerCompany: job.employerCompany,
  jobNo: job.jobNo,
  invNo: job.invNo || '',
  transportDocNo: job.transportDocNo || '',
  workOrderNo: job.workOrderNo || job.ticketNo || '',
  orderDate: job.orderDate || job.pickup?.date || getLocalDate(),
  vehicleType: job.vehicleType,
  productName: job.productName,
  quantity: job.quantity,
  pickup: { ...job.pickup },
  delivery: { ...job.delivery },
  assignedToUid: job.assignedToUid || '',
  driverName: job.driverName,
  plateNo: job.plateNo,
  driverPhone: formatPhoneNumber(job.driverPhone || ''),
  fuelAndToll: job.fuelAndToll === null || job.fuelAndToll === undefined ? '' : String(job.fuelAndToll),
  importantNote: job.importantNote,
  originImageUrls: toImageUrls(job.originImageUrls, job.originImageUrl),
  destinationImageUrls: toImageUrls(job.destinationImageUrls, job.destinationImageUrl),
  documentImageUrls: toImageUrls(job.documentImageUrls, job.documentImageUrl),
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
  const { users: adminUsers } = useAdminUsers();
  const { data: appData } = useData();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const isAdmin = userProfile?.role === 'admin';

  const [formData, setFormData] = useState<TodayJobForm>(initialFormData());
  const [jobs, setJobs] = useState<TodayJobEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopySuccess, setIsCopySuccess] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showDeleteSuccessModal, setShowDeleteSuccessModal] = useState(false);
  const [updatingJobId, setUpdatingJobId] = useState<string | null>(null);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | JobStatus>('all');
  const [tableMonth, setTableMonth] = useState<string>(() => getMonthKey());
  const [activeMainTab, setActiveMainTab] = useState<MainSectionTab>(
    () => resolveMainTabFromSearch(location.search) ?? 'form'
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
  const [showStatusPickerModal, setShowStatusPickerModal] = useState(false);

  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TodayJobForm | null>(null);
  const [editBaseRevision, setEditBaseRevision] = useState<number | null>(null);
  const [isEditingSave, setIsEditingSave] = useState(false);
  const [editOriginImageFiles, setEditOriginImageFiles] = useState<File[]>([]);
  const [editOriginPreviews, setEditOriginPreviews] = useState<string[]>([]);
  const [editDestinationImageFiles, setEditDestinationImageFiles] = useState<File[]>([]);
  const [editDestinationPreviews, setEditDestinationPreviews] = useState<string[]>([]);
  const [editDocumentImageFiles, setEditDocumentImageFiles] = useState<File[]>([]);
  const [editDocumentPreviews, setEditDocumentPreviews] = useState<string[]>([]);
  const editOriginInputRef = useRef<HTMLInputElement>(null);
  const editDestinationInputRef = useRef<HTMLInputElement>(null);
  const editDocumentInputRef = useRef<HTMLInputElement>(null);

  const [jobToDelete, setJobToDelete] = useState<TodayJobEntry | null>(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [cardModalTitle, setCardModalTitle] = useState('');
  const [cardModalJobs, setCardModalJobs] = useState<TodayJobEntry[]>([]);
  const [showCardModal, setShowCardModal] = useState(false);
  const pinnedLocations = useMemo(
    () =>
      Array.from(
        new Set(
          (Array.isArray(userProfile?.pinnedLocations) ? userProfile.pinnedLocations : [])
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
        )
      ),
    [userProfile?.pinnedLocations]
  );

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
  const fieldLabelClass = isDark ? 'admin-field-label' : 'font-medium text-light-muted';
  const modalInputClass = 'driver-clay-input px-3 py-2.5 text-[16px] md:text-sm';
  const modalTextareaClass = 'driver-clay-input min-h-[90px] resize-y px-3 py-2.5 text-[16px] md:text-sm';
  const modalLabelClass = 'admin-field-label text-xs';
  const modalUploadButtonClass = 'driver-clay-btn driver-clay-btn-info w-full text-xs';
  const quickAddButtonClass = isDark
    ? 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dark-muted/35 bg-dark-bg/50 text-dark-text shadow-sm transition hover:bg-dark-bg disabled:opacity-55'
    : 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/80 bg-gradient-to-br from-[#d9e6f2] to-[#bcd0e0] text-[#34495e] shadow-[4px_4px_10px_rgba(166,180,200,0.35),-4px_-4px_8px_rgba(255,255,255,0.88)] transition hover:brightness-105 active:translate-y-px disabled:opacity-55';

  const options = appData?.options;
  const sortUniqueOptions = (items: string[]) =>
    Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));

  const vehicleTypeOptions = useMemo(() => sortUniqueOptions(options?.vehicleTypes ?? []), [options?.vehicleTypes]);
  const locationOptions = useMemo(() => {
    const sortedLocations = sortUniqueOptions(options?.locations ?? []);
    const pinnedSet = new Set(pinnedLocations);
    const pinned = sortedLocations.filter((item) => pinnedSet.has(item));
    const unpinned = sortedLocations.filter((item) => !pinnedSet.has(item));
    return [...pinned, ...unpinned];
  }, [options?.locations, pinnedLocations]);
  const driverOptions = useMemo(() => sortUniqueOptions(options?.drivers ?? []), [options?.drivers]);
  const plateOptions = useMemo(() => sortUniqueOptions(options?.licensePlates ?? []), [options?.licensePlates]);
  const employerCompanyOptions = useMemo(() => sortUniqueOptions(options?.employerCompanies ?? []), [options?.employerCompanies]);
  const productTypeOptions = useMemo(() => sortUniqueOptions(options?.productTypes ?? []), [options?.productTypes]);
  const contactOptions = useMemo(() => sortUniqueOptions(options?.contacts ?? []), [options?.contacts]);

  const tableMonthOptions = useMemo(() => buildMonthOptions(11, 1), []);
  const previousTableMonth = useMemo(() => shiftMonthKey(tableMonth, -1), [tableMonth]);
  const focusWindowRange = useMemo(
    () => ({
      startDate: addDays(getLocalDate(), -7),
      endDateExclusive: addDays(getLocalDate(), 15),
    }),
    []
  );

  useEffect(() => {
    const tableRange = {
      startDate: `${previousTableMonth}-01`,
      endDateExclusive: `${shiftMonthKey(tableMonth, 1)}-01`,
    };

    if (activeMainTab === 'table') {
      const unsubscribe = subscribeToTodayJobsByPickupDateRange(
        tableRange.startDate,
        tableRange.endDateExclusive,
        (rows) => setJobs(rows),
        (error) => {
          console.error('Today jobs subscribe failed:', error);
        }
      );

      return () => unsubscribe();
    }

    let cancelled = false;
    fetchTodayJobsByPickupDateRange(
      focusWindowRange.startDate,
      focusWindowRange.endDateExclusive
    )
      .then((rows) => {
        if (cancelled) return;
        setJobs(rows);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Today jobs fetch failed:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [activeMainTab, focusWindowRange.endDateExclusive, focusWindowRange.startDate, previousTableMonth, tableMonth]);

  const assignableUsers = useMemo(
    () => (isAdmin ? adminUsers : []),
    [adminUsers, isAdmin]
  );

  useEffect(() => {
    const fromSearch = resolveMainTabFromSearch(location.search);
    if (fromSearch) {
      setActiveMainTab(fromSearch);
    }
  }, [location.search]);

  useEffect(() => () => {
    editOriginPreviews.forEach((url) => URL.revokeObjectURL(url));
  }, [editOriginPreviews]);

  useEffect(() => () => {
    editDestinationPreviews.forEach((url) => URL.revokeObjectURL(url));
  }, [editDestinationPreviews]);

  useEffect(() => () => {
    editDocumentPreviews.forEach((url) => URL.revokeObjectURL(url));
  }, [editDocumentPreviews]);

  const selectedAssignedUser = useMemo(
    () => assignableUsers.find((row) => row.uid === formData.assignedToUid) || null,
    [assignableUsers, formData.assignedToUid]
  );

  const summaryText = useMemo(() => buildSummaryText(formData), [formData]);

  const todayDate = asDateOnly(getLocalDate());
  const todayJobs = useMemo(() => jobs.filter((job) => getJobDate(job) === todayDate), [jobs, todayDate]);
  const todayCompletedJobs = useMemo(
    () => todayJobs.filter((job) => job.status === 'completed'),
    [todayJobs]
  );
  const myAssignedJobs = useMemo(() => {
    if (!user?.uid) return [] as TodayJobEntry[];

    return jobs
      .filter((job) => job.assignedToUid === user.uid && job.status !== 'completed')
      .sort(compareJobsByDateAsc);
  }, [jobs, user?.uid]);

  const upcomingWeeklyJobs = useMemo(() => {
    const today = parseDate(todayDate);
    if (!today) return [] as TodayJobEntry[];

    const upcomingLimit = new Date(today);
    upcomingLimit.setDate(today.getDate() + 7);

    return jobs.filter((job) => {
      const jobDate = parseDate(getJobDate(job));
      if (!jobDate) return false;
      return jobDate > today && jobDate <= upcomingLimit && job.status !== 'completed';
    });
  }, [jobs, todayDate]);

  const driverNameByUid = useMemo(() => {
    const map = new Map<string, string>();
    assignableUsers.forEach((user) => {
      map.set(user.uid, resolveDriverFullName(user));
    });
    return map;
  }, [assignableUsers]);

  const getDriverFullName = (job: TodayJobEntry) =>
    (job.assignedToUid ? driverNameByUid.get(job.assignedToUid) : '') ||
    job.driverName ||
    job.assignedToName?.trim() ||
    '-';

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
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startOfWeek.setDate(today.getDate() - mondayOffset);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const month = today.getMonth();
    const year = today.getFullYear();

    const weekCountMap = new Map<string, number>();
    const monthCountMap = new Map<string, number>();
    const weekJobsByDriver = new Map<string, TodayJobEntry[]>();

    jobs.forEach((job) => {
      const jobDate = parseDate(getJobDate(job));
      if (!jobDate) return;
      const driver = getDriverFullName(job);
      const normalizedDriver = driver && driver !== '-' ? driver : 'ไม่ระบุผู้รับงาน';

      if (jobDate >= startOfWeek && jobDate <= endOfWeek) {
        weekCountMap.set(normalizedDriver, (weekCountMap.get(normalizedDriver) || 0) + 1);
        const current = weekJobsByDriver.get(normalizedDriver) || [];
        weekJobsByDriver.set(normalizedDriver, [...current, job]);
      }

      if (jobDate.getMonth() === month && jobDate.getFullYear() === year) {
        monthCountMap.set(normalizedDriver, (monthCountMap.get(normalizedDriver) || 0) + 1);
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
  }, [getDriverFullName, jobs, todayDate, todayJobs, todayCompletedJobs, upcomingWeeklyJobs]);

  const getAssignedAppLabel = (job: TodayJobEntry) => (job.assignedToUid ? 'Yes' : 'No');
  const isCarryOverJob = (job: TodayJobEntry) =>
    job.status !== 'completed' && getMonthKey(getJobDate(job)) === previousTableMonth;
  const isCurrentMonthOverdueJob = (job: TodayJobEntry) => {
    const jobDate = getJobDate(job);
    return job.status !== 'completed' && getMonthKey(jobDate) === tableMonth && jobDate < todayDate;
  };

  const getMobileCardTone = (job: TodayJobEntry) => {
    const jobDate = getJobDate(job);

    if (job.status === 'completed') {
      return {
        cardClass:
          'border border-emerald-200/90 bg-[linear-gradient(145deg,rgba(236,253,245,0.98),rgba(240,253,250,0.95))] shadow-[inset_0_1px_0_rgba(255,255,255,0.88),10px_10px_22px_rgba(110,231,183,0.14),-8px_-8px_18px_rgba(255,255,255,0.9)]',
        headerClass:
          '-mx-3.5 -mt-3.5 mb-3 flex items-center justify-between rounded-t-[1.45rem] border-b border-emerald-200/80 bg-[linear-gradient(90deg,#10b981,#34d399)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white sm:-mx-5 sm:-mt-5 sm:px-5',
        title: 'งานเสร็จแล้ว',
        subtitle: 'พร้อมตรวจสอบข้อมูล',
        dateChipClass: 'border border-emerald-200/70 bg-white/80 text-emerald-700',
        dateChipLabel: 'เสร็จแล้ว',
        actionClass: 'driver-clay-btn driver-clay-btn-info min-h-[2.85rem] justify-center text-sm',
      };
    }

    if (isCarryOverJob(job)) {
      return {
        cardClass:
          'border border-rose-300/90 bg-[linear-gradient(145deg,rgba(255,241,242,0.98),rgba(255,245,245,0.95))] shadow-[inset_0_1px_0_rgba(255,255,255,0.88),10px_10px_22px_rgba(244,114,182,0.14),-8px_-8px_18px_rgba(255,255,255,0.9)]',
        headerClass:
          '-mx-3.5 -mt-3.5 mb-3 flex items-center justify-between rounded-t-[1.45rem] border-b border-rose-200/80 bg-[linear-gradient(90deg,#dc2626,#f43f5e)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white sm:-mx-5 sm:-mt-5 sm:px-5',
        title: 'งานค้าง',
        subtitle: 'เลยกำหนด',
        dateChipClass: 'border border-rose-200/80 bg-white/80 text-rose-700',
        dateChipLabel: 'เลยเดือน',
        actionClass: 'driver-clay-btn driver-clay-btn-warning min-h-[2.85rem] justify-center text-sm',
      };
    }

    if (jobDate > todayDate) {
      return {
        cardClass:
          'border border-sky-300/90 bg-[linear-gradient(145deg,rgba(224,242,254,0.96),rgba(240,249,255,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),10px_10px_22px_rgba(125,171,203,0.18),-8px_-8px_18px_rgba(255,255,255,0.88)]',
        headerClass:
          '-mx-3.5 -mt-3.5 mb-3 flex items-center justify-between rounded-t-[1.45rem] border-b border-sky-200/80 bg-[linear-gradient(90deg,#0284c7,#38bdf8)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white sm:-mx-5 sm:-mt-5 sm:px-5',
        title: 'งานล่วงหน้า',
        subtitle: 'เตรียมพร้อมดำเนินงาน',
        dateChipClass: 'border border-sky-200/70 bg-white/80 text-sky-700',
        dateChipLabel: 'ล่วงหน้า',
        actionClass: 'driver-clay-btn driver-clay-btn-info min-h-[2.85rem] justify-center text-sm',
      };
    }

    if (isCurrentMonthOverdueJob(job)) {
      return {
        cardClass:
          'border border-slate-300/90 bg-[linear-gradient(145deg,rgba(241,245,249,0.98),rgba(248,250,252,0.95))] shadow-[inset_0_1px_0_rgba(255,255,255,0.86),10px_10px_22px_rgba(148,163,184,0.16),-8px_-8px_18px_rgba(255,255,255,0.9)]',
        headerClass:
          '-mx-3.5 -mt-3.5 mb-3 flex items-center justify-between rounded-t-[1.45rem] border-b border-slate-300/80 bg-[linear-gradient(90deg,#64748b,#94a3b8)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white sm:-mx-5 sm:-mt-5 sm:px-5',
        title: 'งานค้าง',
        subtitle: 'ต้องติดตามต่อ',
        dateChipClass: 'border border-slate-300/80 bg-white/80 text-slate-600',
        dateChipLabel: 'ย้อนหลัง',
        actionClass: 'driver-clay-btn driver-clay-btn-warning min-h-[2.85rem] justify-center text-sm',
      };
    }

    return {
      cardClass:
        'border border-orange-200/90 bg-[linear-gradient(145deg,rgba(255,247,237,0.98),rgba(255,251,235,0.94))] shadow-[inset_0_1px_0_rgba(255,255,255,0.88),10px_10px_22px_rgba(215,176,126,0.14),-8px_-8px_18px_rgba(255,255,255,0.9)]',
      headerClass:
        '-mx-3.5 -mt-3.5 mb-3 flex items-center justify-between rounded-t-[1.45rem] border-b border-orange-200/80 bg-[linear-gradient(90deg,#f59e0b,#fbbf24)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white sm:-mx-5 sm:-mt-5 sm:px-5',
      title: 'งานวันนี้',
      subtitle: 'พร้อมดำเนินงาน',
      dateChipClass: 'border border-orange-200/80 bg-white/80 text-orange-700',
      dateChipLabel: 'วันนี้',
      actionClass: 'driver-clay-btn driver-clay-btn-success min-h-[2.85rem] justify-center text-sm',
    };
  };

  const filteredJobs = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    const visibleJobs = jobs.filter((job) => {
      const jobMonth = getMonthKey(getJobDate(job));
      const isInSelectedMonth = jobMonth === tableMonth;
      const shouldIncludeCarryOver = jobMonth === previousTableMonth && job.status !== 'completed';

      if (!isInSelectedMonth && !shouldIncludeCarryOver) return false;
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

    const currentMonthJobs = visibleJobs.filter((job) => getMonthKey(getJobDate(job)) === tableMonth);
    const carryOverJobs = visibleJobs.filter((job) => isCarryOverJob(job));

    return [...currentMonthJobs, ...carryOverJobs];
  }, [jobs, previousTableMonth, searchText, statusFilter, tableMonth]);

  const selectedJob = useMemo(() => {
    if (!selectedJobId) return null;
    return jobs.find((job) => job.id === selectedJobId) || null;
  }, [jobs, selectedJobId]);

  const updateField = (field: keyof TodayJobForm, value: string) => {
    if (field === 'driverPhone') {
      setFormData((prev) => ({ ...prev, driverPhone: formatPhoneNumber(value) }));
      return;
    }
    if (field === 'orderDate') {
      setFormData((prev) => {
        const nextPickupDate =
          prev.pickup.date && prev.pickup.date < value ? value : prev.pickup.date;
        return {
          ...prev,
          orderDate: value,
          pickup: { ...prev.pickup, date: nextPickupDate },
          delivery: { ...prev.delivery, date: nextPickupDate },
        };
      });
      return;
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateAssignedUser = (assignedToUid: string) => {
    const assignedUser = assignableUsers.find((row) => row.uid === assignedToUid);
    const driverFullName = resolveDriverFullName(assignedUser);
    const profilePhone = extractUserPhone(assignedUser as (Partial<UserProfile> & Record<string, unknown>) | undefined);
    setFormData((prev) => ({
      ...prev,
      assignedToUid,
      driverName: driverFullName || prev.driverName,
      driverPhone: formatPhoneNumber(profilePhone || ''),
    }));

    if (!assignedToUid || profilePhone) return;
    void getUserProfile(assignedToUid)
      .then((profile) => {
        const fetchedPhone = extractUserPhone(profile as (Partial<UserProfile> & Record<string, unknown>) | null);
        if (!fetchedPhone) return;
        setFormData((prev) =>
          prev.assignedToUid === assignedToUid
            ? { ...prev, driverPhone: formatPhoneNumber(fetchedPhone) }
            : prev
        );
      })
      .catch((error) => {
        console.error('Load assigned user phone failed:', error);
      });
  };

  const updatePoint = (point: 'pickup' | 'delivery', field: keyof DispatchPoint, value: string) => {
    setFormData((prev) => {
      if (field !== 'date') {
        return { ...prev, [point]: { ...prev[point], [field]: value } };
      }

      if (point === 'delivery' && isDeliveryBeforePickup(prev.pickup.date, value)) {
        alert('วันที่ส่งงานต้องมากกว่าหรือเท่ากับวันที่รับงาน');
        return prev;
      }

      if (point === 'pickup') {
        if (isPickupBeforeOrderDate(prev.orderDate, value)) {
          alert('วันที่รับงานต้องมากกว่าหรือเท่ากับวันที่รับงานจากผู้ว่าจ้าง');
          return prev;
        }
        return {
          ...prev,
          pickup: { ...prev.pickup, date: value },
          delivery: { ...prev.delivery, date: value },
        };
      }

      return { ...prev, delivery: { ...prev.delivery, date: value } };
    });
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

  const openNativePicker = (event: DatePickerEvent) => {
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
    drawLineField(doc, 'วันที่รับงานจากผู้ว่าจ้าง :', source.orderDate, 12, 45, 50);
    drawLineField(doc, 'วันที่รับงาน :', source.pickup.date, 12, 45, 58);
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
    doc.save(`today-job-${source.pickup.date || getLocalDate()}.pdf`);
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
    if (isPickupBeforeOrderDate(formData.orderDate, formData.pickup.date)) {
      alert('วันที่รับงานต้องมากกว่าหรือเท่ากับวันที่รับงานจากผู้ว่าจ้าง');
      return;
    }
    if (isDeliveryBeforePickup(formData.pickup.date, formData.delivery.date)) {
      alert('วันที่ส่งงานต้องมากกว่าหรือเท่ากับวันที่รับงาน');
      return;
    }

    const totalRounds = toRoundCount(formData.quantity);
    if (!totalRounds) {
      alert('กรุณาระบุจำนวนรอบเป็นตัวเลขที่มากกว่า 0');
      return;
    }

    const fuelAndTollRaw = (formData.fuelAndToll || '').trim();
    if (fuelAndTollRaw && Number.isNaN(Number(fuelAndTollRaw))) {
      alert('ค่าน้ำมัน/ทางด่วนต้องเป็นตัวเลข');
      return;
    }
    const fuelAndTollValue = fuelAndTollRaw ? Number(fuelAndTollRaw) : null;

    setIsSaving(true);
    let createdCount = 0;
    try {
      const assignedName = resolveAssignedAppName(selectedAssignedUser) || formData.driverName || '-';
      const baseWorkOrderNo = (formData.workOrderNo || generateWorkOrderNo()).trim();

      const shouldSplitRounds = Number.isInteger(totalRounds) && totalRounds > 1;
      const roundValues = shouldSplitRounds ? Array.from({ length: totalRounds }, () => 1) : [totalRounds];

      for (let index = 0; index < roundValues.length; index += 1) {
        const roundNumber = index + 1;
        const roundValue = roundValues[index];
        const roundWorkOrderNo =
          shouldSplitRounds ? `${baseWorkOrderNo}-R${roundNumber}` : baseWorkOrderNo;
        const roundForm = {
          ...formData,
          quantity: String(roundValue),
          workOrderNo: roundWorkOrderNo,
        };
        const roundSummaryText = buildSummaryText(roundForm);

        const createdJob = await addTodayJob({
          ...roundForm,
          fuelAndToll: fuelAndTollValue,
          rounds: roundValue,
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

        if (index < roundValues.length - 1) {
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

  const handleSelectStatusFromModal = async (status: JobStatus) => {
    if (!selectedJob) return;
    await handleStatusChange(selectedJob.id, status);
    setShowStatusPickerModal(false);
  };

  const resetEditImageDrafts = () => {
    setEditOriginImageFiles([]);
    setEditDestinationImageFiles([]);
    setEditDocumentImageFiles([]);
    setEditOriginPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
    setEditDestinationPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
    setEditDocumentPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
    if (editOriginInputRef.current) editOriginInputRef.current.value = '';
    if (editDestinationInputRef.current) editDestinationInputRef.current.value = '';
    if (editDocumentInputRef.current) editDocumentInputRef.current.value = '';
  };

  const closeEditModal = () => {
    setEditingJobId(null);
    setEditForm(null);
    setEditBaseRevision(null);
    resetEditImageDrafts();
  };

  const openEditModal = (job: TodayJobEntry) => {
    resetEditImageDrafts();
    setEditingJobId(job.id);
    setEditForm(toEditableForm(job));
    setEditBaseRevision(
      typeof job.revision === 'number' && Number.isFinite(job.revision)
        ? job.revision
        : null
    );
  };

  const handleEditField = (field: keyof TodayJobForm, value: string) => {
    if (field === 'driverPhone') {
      setEditForm((prev) => (prev ? { ...prev, driverPhone: formatPhoneNumber(value) } : prev));
      return;
    }
    if (field === 'orderDate') {
      setEditForm((prev) =>
        prev
          ? {
              ...prev,
              orderDate: value,
              pickup: {
                ...prev.pickup,
                date: prev.pickup.date && prev.pickup.date < value ? value : prev.pickup.date,
              },
              delivery: {
                ...prev.delivery,
                date: prev.pickup.date && prev.pickup.date < value ? value : prev.delivery.date,
              },
            }
          : prev
      );
      return;
    }
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleEditAssignedUser = (assignedToUid: string) => {
    const assignedUser = assignableUsers.find((row) => row.uid === assignedToUid);
    const driverFullName = resolveDriverFullName(assignedUser);
    const profilePhone = extractUserPhone(assignedUser as (Partial<UserProfile> & Record<string, unknown>) | undefined);
    setEditForm((prev) => (
      prev
        ? {
            ...prev,
            assignedToUid,
            driverName: driverFullName || prev.driverName,
            driverPhone: formatPhoneNumber(profilePhone || ''),
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
            ? { ...prev, driverPhone: formatPhoneNumber(fetchedPhone) }
            : prev
        );
      })
      .catch((error) => {
        console.error('Load assigned user phone for edit failed:', error);
      });
  };

  const handleEditPoint = (point: 'pickup' | 'delivery', field: keyof DispatchPoint, value: string) => {
    setEditForm((prev) => {
      if (!prev) return prev;
      if (field !== 'date') return { ...prev, [point]: { ...prev[point], [field]: value } };

      if (point === 'delivery' && isDeliveryBeforePickup(prev.pickup.date, value)) {
        alert('วันที่ส่งงานต้องมากกว่าหรือเท่ากับวันที่รับงาน');
        return prev;
      }

      if (point === 'pickup') {
        if (isPickupBeforeOrderDate(prev.orderDate, value)) {
          alert('วันที่รับงานต้องมากกว่าหรือเท่ากับวันที่รับงานจากผู้ว่าจ้าง');
          return prev;
        }
        return {
          ...prev,
          pickup: { ...prev.pickup, date: value },
          delivery: { ...prev.delivery, date: value },
        };
      }

      return { ...prev, delivery: { ...prev.delivery, date: value } };
    });
  };

  const handleEditImageSelect = (
    kind: 'origin' | 'destination' | 'document',
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) {
      event.target.value = '';
      return;
    }

    const previewUrls = files.map((file) => URL.createObjectURL(file));
    if (kind === 'origin') {
      setEditOriginImageFiles((prev) => [...prev, ...files]);
      setEditOriginPreviews((prev) => [...prev, ...previewUrls]);
    } else if (kind === 'destination') {
      setEditDestinationImageFiles((prev) => [...prev, ...files]);
      setEditDestinationPreviews((prev) => [...prev, ...previewUrls]);
    } else {
      setEditDocumentImageFiles((prev) => [...prev, ...files]);
      setEditDocumentPreviews((prev) => [...prev, ...previewUrls]);
    }

    event.target.value = '';
  };

  const removeEditExistingImage = (field: 'originImageUrls' | 'destinationImageUrls' | 'documentImageUrls', index: number) => {
    setEditForm((prev) => {
      if (!prev) return prev;
      const next = [...prev[field]];
      next.splice(index, 1);
      return { ...prev, [field]: next };
    });
  };

  const removeEditPreviewImage = (kind: 'origin' | 'destination' | 'document', index: number) => {
    if (kind === 'origin') {
      setEditOriginImageFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
      setEditOriginPreviews((prev) => {
        const next = [...prev];
        const [removed] = next.splice(index, 1);
        if (removed) URL.revokeObjectURL(removed);
        return next;
      });
      return;
    }

    if (kind === 'destination') {
      setEditDestinationImageFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
      setEditDestinationPreviews((prev) => {
        const next = [...prev];
        const [removed] = next.splice(index, 1);
        if (removed) URL.revokeObjectURL(removed);
        return next;
      });
      return;
    }

    setEditDocumentImageFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
    setEditDocumentPreviews((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed);
      return next;
    });
  };

  const handleSaveEdit = async () => {
    if (!editingJobId || !editForm || isEditingSave) return;
    setIsEditingSave(true);

    try {
      if (isPickupBeforeOrderDate(editForm.orderDate, editForm.pickup.date)) {
        alert('วันที่รับงานต้องมากกว่าหรือเท่ากับวันที่รับงานจากผู้ว่าจ้าง');
        return;
      }
      if (isDeliveryBeforePickup(editForm.pickup.date, editForm.delivery.date)) {
        alert('วันที่ส่งงานต้องมากกว่าหรือเท่ากับวันที่รับงาน');
        return;
      }
      const fuelAndTollRaw = (editForm.fuelAndToll || '').trim();
      if (fuelAndTollRaw && Number.isNaN(Number(fuelAndTollRaw))) {
        alert('ค่าน้ำมัน/ทางด่วนต้องเป็นตัวเลข');
        return;
      }
      const fuelAndTollValue = fuelAndTollRaw ? Number(fuelAndTollRaw) : null;

      const [newOriginUrls, newDestinationUrls, newDocumentUrls] = await Promise.all([
        editOriginImageFiles.length > 0 ? uploadImages(editOriginImageFiles, editingJobId) : Promise.resolve([] as string[]),
        editDestinationImageFiles.length > 0 ? uploadImages(editDestinationImageFiles, editingJobId) : Promise.resolve([] as string[]),
        editDocumentImageFiles.length > 0 ? uploadImages(editDocumentImageFiles, editingJobId) : Promise.resolve([] as string[]),
      ]);

      const mergedOriginImageUrls = mergeImageUrls(editForm.originImageUrls, newOriginUrls);
      const mergedDestinationImageUrls = mergeImageUrls(editForm.destinationImageUrls, newDestinationUrls);
      const mergedDocumentImageUrls = mergeImageUrls(editForm.documentImageUrls, newDocumentUrls);

      const assignedName =
        resolveAssignedAppName(assignableUsers.find((row) => row.uid === editForm.assignedToUid)) ||
        editForm.driverName ||
        '-';

      await updateTodayJob(editingJobId, {
        ...editForm,
        rounds: toRoundCount(editForm.quantity) ?? 1,
        fuelAndToll: fuelAndTollValue,
        originImageUrls: mergedOriginImageUrls,
        destinationImageUrls: mergedDestinationImageUrls,
        documentImageUrls: mergedDocumentImageUrls,
        originImageUrl: mergedOriginImageUrls[0] || '',
        destinationImageUrl: mergedDestinationImageUrls[0] || '',
        documentImageUrl: mergedDocumentImageUrls[0] || '',
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
      closeEditModal();
    } catch (error) {
      console.error('Save edit failed:', error);
      if (error instanceof RevisionConflictError) {
        const latest = await getTodayJobById(editingJobId);
        if (latest) {
          setEditForm(toEditableForm(latest));
          resetEditImageDrafts();
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
      ? 'bg-emerald-100/90 text-emerald-700'
      : status === 'in_progress'
        ? 'bg-amber-100/90 text-amber-700'
        : 'bg-slate-100/95 text-slate-700';

  const statusIcon = (status: JobStatus) => {
    if (status === 'completed') return <CheckCircle2 size={13} />;
    if (status === 'in_progress') return <CircleDashed size={13} />;
    return <Circle size={13} />;
  };

  const mainTabs: Array<{ id: MainSectionTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
    { id: 'form', label: 'ฟอร์มแจ้งงาน', icon: Pencil },
    { id: 'overview', label: 'งานวันนี้', icon: CalendarClock },
    { id: 'table', label: 'ตารางข้อมูลแจ้งงาน', icon: Truck },
  ];

  return (
    <div className="space-y-6 animate-fade-in overflow-x-hidden">
      <section className={`${cardClass} p-2.5 sm:p-3 md:p-4`}>
        <div className={`rounded-2xl border p-2 ${isDark ? 'border-dark-muted/30 bg-dark-bg/45' : 'border-white/80 bg-[#e8ecf1]'}`}>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3" role="tablist" aria-label="งานวันนี้แท็บหลัก">
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
                        ? 'text-white hover:bg-white/5'
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
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/80">Dispatch Center</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight md:text-[2rem]">งานวันนี้</h1>
              <p className="mt-1 max-w-[26rem] text-sm leading-relaxed text-white/90">สรุปภาพรวม ติดตามงาน และจัดการใบแจ้งงานได้ในหน้าเดียว</p>
            </div>
            <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center self-start rounded-2xl border border-white/30 bg-white/15 shadow-[inset_1px_1px_0_rgba(255,255,255,0.35)]">
              <ClipboardCheck className="h-7 w-7 text-white" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 sm:gap-4 md:grid-cols-2 md:p-7 xl:grid-cols-4">
          <button type="button" onClick={() => openBadgeModal('งานวันนี้ทั้งหมด', todayJobs)} className={`rounded-xl p-4 text-left transition hover:-translate-y-0.5 ${isDark ? 'bg-dark-bg/60 hover:bg-dark-bg/80' : 'bg-cyan-50 hover:bg-cyan-100'}`}>
            <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-slate-600'}`}>งานวันนี้ทั้งหมด</p>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-2xl font-semibold">{dashboardStats.todayTotal}</p>
              <Truck className="h-5 w-5 text-cyan-500" />
            </div>
          </button>
          <button type="button" onClick={() => openBadgeModal('งานของฉัน', myAssignedJobs)} className={`rounded-xl p-4 text-left transition hover:-translate-y-0.5 ${isDark ? 'bg-dark-bg/60 hover:bg-dark-bg/80' : 'bg-emerald-50 hover:bg-emerald-100'}`}>
            <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-slate-600'}`}>งานของฉัน</p>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-2xl font-semibold">{myAssignedJobs.length}</p>
              <UserCheck className="h-5 w-5 text-emerald-500" />
            </div>
          </button>
          <button type="button" onClick={() => openBadgeModal('งานที่กำลังจะมา (7 วัน)', upcomingWeeklyJobs)} className={`rounded-xl p-4 text-left transition hover:-translate-y-0.5 ${isDark ? 'bg-dark-bg/60 hover:bg-dark-bg/80' : 'bg-amber-50 hover:bg-amber-100'}`}>
            <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-slate-600'}`}>งานที่กำลังจะมา (7 วัน)</p>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-2xl font-semibold">{dashboardStats.upcomingWeekly}</p>
              <CalendarClock className="h-5 w-5 text-amber-500" />
            </div>
          </button>
          <button type="button" onClick={() => openBadgeModal('งานของพนักงานที่มีงานมากสุดในสัปดาห์นี้', dashboardStats.topDriverWeekJobs)} className={`rounded-xl p-4 text-left transition hover:-translate-y-0.5 ${isDark ? 'bg-dark-bg/60 hover:bg-dark-bg/80' : 'bg-violet-50 hover:bg-violet-100'}`}>
            <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-slate-600'}`}>พนักงานที่มีงานมากสุดในสัปดาห์นี้</p>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-sm font-semibold">{dashboardStats.weekByDriver[0]?.name || '-'}</p>
              <UserCheck className="h-5 w-5 text-violet-500" />
            </div>
            <p className="mt-1 text-xs text-violet-500">{dashboardStats.weekByDriver[0]?.count || 0} งาน</p>
          </button>
        </div>
      </section>

      <section className={`${cardClass} p-5`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">งานของฉัน</h2>
            <p className={`mt-1 text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
              งานที่ถูก assign ให้ฉันและยังไม่เสร็จ
            </p>
          </div>
          <span className={`inline-flex min-w-10 items-center justify-center rounded-full px-3 py-1 text-sm font-semibold ${isDark ? 'bg-white/10 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
            {myAssignedJobs.length}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {myAssignedJobs.length === 0 ? (
            <p className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>ยังไม่มีงานที่ assign ให้คุณในตอนนี้</p>
          ) : (
            myAssignedJobs.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => openJobDetail(job)}
                className="driver-clay-soft w-full rounded-2xl p-4 text-left transition hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-black text-slate-700">
                      {job.employerCompany || '-'}
                    </p>
                    <p className="mt-1 break-words text-sm font-semibold text-slate-600">
                      {job.productName || '-'}
                    </p>
                    <p className="driver-clay-muted mt-1 text-xs">
                      เลขที่ใบสั่งงาน: {job.workOrderNo || job.ticketNo || '-'}
                    </p>
                  </div>
                  <span className={`driver-clay-chip shrink-0 whitespace-nowrap ${statusBadgeClass(job.status)}`}>
                    {statusIcon(job.status)}
                    {statusLabelMap[job.status]}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 text-sm text-slate-700">
                  <DetailRow
                    icon={<CalendarClock size={14} className="driver-clay-muted" />}
                    value={`วันที่รับงาน: ${getJobDate(job) || '-'}`}
                  />
                  <DetailRow
                    icon={<MapPin size={14} className="driver-clay-muted" />}
                    value={`รับ: ${job.pickup.location || '-'}`}
                  />
                  <DetailRow
                    icon={<MapPin size={14} className="driver-clay-muted" />}
                    value={`ส่ง: ${job.delivery.location || '-'}`}
                  />
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
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
              <span className={fieldLabelClass}>เลขที่ใบสั่งงาน</span>
              <input className={inputClass} value={formData.workOrderNo} onChange={(e) => updateField('workOrderNo', e.target.value)} />
            </label>
            <label className="text-sm">
              <span className={fieldLabelClass}>บริษัทผู้ว่าจ้าง</span>
              <div className="flex items-center gap-2">
                <select
                  className={inputClass}
                  value={formData.employerCompany}
                  onChange={(e) => updateField('employerCompany', e.target.value)}
                >
                  <option value="">เลือกบริษัทผู้ว่าจ้าง</option>
                  {buildDropdownOptions(employerCompanyOptions, formData.employerCompany).map((option) => (
                    <option key={`form-employer-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
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
            <label className="text-sm">
              <span className={fieldLabelClass}>วันที่รับงานจากผู้ว่าจ้าง</span>
              <input type="date" className={inputClass} value={formData.orderDate} onChange={(e) => updateField('orderDate', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
            </label>
            <label className="text-sm">
              <span className={fieldLabelClass}>ประเภทสินค้า</span>
              <div className="flex items-center gap-2">
                <select
                  className={inputClass}
                  value={formData.productName}
                  onChange={(e) => updateField('productName', e.target.value)}
                >
                  <option value="">เลือกประเภทสินค้า</option>
                  {buildDropdownOptions(productTypeOptions, formData.productName).map((option) => (
                    <option key={`form-product-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
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
            <label className="text-sm">
              <span className={fieldLabelClass}>ประเภทรถ</span>
              <div className="flex items-center gap-2">
                <select
                  className={selectClass}
                  value={formData.vehicleType}
                  onChange={(e) => updateField('vehicleType', e.target.value)}
                >
                  <option value="">เลือกประเภทรถ</option>
                  {buildDropdownOptions(vehicleTypeOptions, formData.vehicleType).map((option) => (
                    <option key={`form-vehicle-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
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
            <label className="text-sm">
              <span className={fieldLabelClass}>จำนวนรอบ</span>
              <input type="number" min="0.5" step="0.5" inputMode="decimal" className={inputClass} value={formData.quantity} onChange={(e) => updateField('quantity', e.target.value)} />
            </label>
          </div>

          <div className={`space-y-3 md:hidden`}>
            <div className={`rounded-xl border p-3 ${isDark ? 'border-dark-muted/30 bg-dark-bg/35' : 'border-light-muted/30 bg-slate-50'}`}>
              <p className="mb-2 text-sm font-semibold">รับงาน</p>
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className={fieldLabelClass}>สถานที่</span>
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
                  <span className={fieldLabelClass}>วันที่</span>
                  <input type="date" min={formData.orderDate || undefined} className={pointInputClass} value={formData.pickup.date} onChange={(e) => updatePoint('pickup', 'date', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                </label>
                <label className="block text-sm">
                  <span className={fieldLabelClass}>เวลา</span>
                  <input type="time" lang="en-GB" step={60} className={pointInputClass} value={formData.pickup.time} onChange={(e) => updatePoint('pickup', 'time', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                </label>
                <label className="block text-sm">
                  <span className={fieldLabelClass}>ติดต่อ</span>
                  <div className="flex items-center gap-2">
                    <select
                      className={pointInputClass}
                      value={formData.pickup.contact}
                      onChange={(e) => updatePoint('pickup', 'contact', e.target.value)}
                    >
                      <option value="">เลือกผู้ติดต่อ</option>
                      {buildDropdownOptions(contactOptions, formData.pickup.contact).map((option) => (
                        <option key={`form-pickup-contact-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
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
                  <span className={fieldLabelClass}>สถานที่</span>
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
                  <span className={fieldLabelClass}>วันที่</span>
                  <input type="date" min={formData.pickup.date || undefined} className={pointInputClass} value={formData.delivery.date} onChange={(e) => updatePoint('delivery', 'date', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                </label>
                <label className="block text-sm">
                  <span className={fieldLabelClass}>เวลา</span>
                  <input type="time" lang="en-GB" step={60} className={pointInputClass} value={formData.delivery.time} onChange={(e) => updatePoint('delivery', 'time', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                </label>
                <label className="block text-sm">
                  <span className={fieldLabelClass}>ติดต่อ</span>
                  <div className="flex items-center gap-2">
                    <select
                      className={pointInputClass}
                      value={formData.delivery.contact}
                      onChange={(e) => updatePoint('delivery', 'contact', e.target.value)}
                    >
                      <option value="">เลือกผู้ติดต่อ</option>
                      {buildDropdownOptions(contactOptions, formData.delivery.contact).map((option) => (
                        <option key={`form-delivery-contact-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
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
              <div className={`border-r px-3 py-2 text-center text-sm ${isDark ? 'border-dark-muted/30 admin-field-label' : 'border-light-muted/30 font-medium text-light-muted'}`}>หัวข้อ</div>
              <div className={`border-r px-3 py-2 text-center text-sm font-semibold ${isDark ? 'border-dark-muted/30' : 'border-light-muted/30'}`}>รับงาน</div>
              <div className="px-3 py-2 text-center text-sm font-semibold">ส่งงาน</div>
            </div>
            <div className="space-y-0">
              <div className={`grid grid-cols-[120px_1fr_1fr] ${isDark ? 'border-t border-dark-muted/25' : 'border-t border-light-muted/25'}`}>
                <div className={`border-r px-3 py-3 text-sm ${isDark ? 'border-dark-muted/25 admin-field-label' : 'border-light-muted/25 font-medium text-light-muted'}`}>สถานที่</div>
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
                <div className={`border-r px-3 py-3 text-sm ${isDark ? 'border-dark-muted/25 admin-field-label' : 'border-light-muted/25 font-medium text-light-muted'}`}>วันที่</div>
                <div className={`border-r px-2 py-2 ${isDark ? 'border-dark-muted/25' : 'border-light-muted/25'}`}>
                  <input type="date" min={formData.orderDate || undefined} className={pointInputClass} value={formData.pickup.date} onChange={(e) => updatePoint('pickup', 'date', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                </div>
                <div className="px-2 py-2">
                  <input type="date" min={formData.pickup.date || undefined} className={pointInputClass} value={formData.delivery.date} onChange={(e) => updatePoint('delivery', 'date', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                </div>
              </div>
              <div className={`grid grid-cols-[120px_1fr_1fr] ${isDark ? 'border-t border-dark-muted/25' : 'border-t border-light-muted/25'}`}>
                <div className={`border-r px-3 py-3 text-sm ${isDark ? 'border-dark-muted/25 admin-field-label' : 'border-light-muted/25 font-medium text-light-muted'}`}>เวลา</div>
                <div className={`border-r px-2 py-2 ${isDark ? 'border-dark-muted/25' : 'border-light-muted/25'}`}>
                  <input type="time" lang="en-GB" step={60} className={pointInputClass} value={formData.pickup.time} onChange={(e) => updatePoint('pickup', 'time', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                </div>
                <div className="px-2 py-2">
                  <input type="time" lang="en-GB" step={60} className={pointInputClass} value={formData.delivery.time} onChange={(e) => updatePoint('delivery', 'time', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                </div>
              </div>
              <div className={`grid grid-cols-[120px_1fr_1fr] ${isDark ? 'border-t border-dark-muted/25' : 'border-t border-light-muted/25'}`}>
                <div className={`border-r px-3 py-3 text-sm ${isDark ? 'border-dark-muted/25 admin-field-label' : 'border-light-muted/25 font-medium text-light-muted'}`}>ติดต่อ</div>
                <div className={`border-r px-2 py-2 ${isDark ? 'border-dark-muted/25' : 'border-light-muted/25'}`}>
                  <div className="flex items-center gap-2">
                    <select
                      className={pointInputClass}
                      value={formData.pickup.contact}
                      onChange={(e) => updatePoint('pickup', 'contact', e.target.value)}
                    >
                      <option value="">เลือกผู้ติดต่อ</option>
                      {buildDropdownOptions(contactOptions, formData.pickup.contact).map((option) => (
                        <option key={`form-desktop-pickup-contact-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
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
                    <select
                      className={pointInputClass}
                      value={formData.delivery.contact}
                      onChange={(e) => updatePoint('delivery', 'contact', e.target.value)}
                    >
                      <option value="">เลือกผู้ติดต่อ</option>
                      {buildDropdownOptions(contactOptions, formData.delivery.contact).map((option) => (
                        <option key={`form-desktop-delivery-contact-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
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
              <span className={fieldLabelClass}>มอบหมายพนักงาน (แอพ)</span>
              <select
                className={selectClass}
                value={formData.assignedToUid}
                onChange={(e) => updateAssignedUser(e.target.value)}
              >
                <option value="">เลือกผู้รับงาน</option>
                {assignableUsers.map((staff) => (
                  <option key={staff.uid} value={staff.uid}>
                    {formatAssignableUserLabel(staff)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className={fieldLabelClass}>พนักงานขับรถ</span>
              <div className="flex items-center gap-2">
                <select
                  className={selectClass}
                  value={formData.driverName}
                  onChange={(e) => updateField('driverName', e.target.value)}
                >
                  <option value="">เลือกพนักงานขับรถ</option>
                  {buildDropdownOptions(driverOptions, formData.driverName).map((option) => (
                    <option key={`form-driver-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
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
              <span className={fieldLabelClass}>เบอร์ติดต่อ</span>
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"
                placeholder="080-123-4567"
                className={inputClass}
                value={formData.driverPhone}
                onChange={(e) => updateField('driverPhone', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className={fieldLabelClass}>ทะเบียน</span>
              <div className="flex items-center gap-2">
                <select
                  className={selectClass}
                  value={formData.plateNo}
                  onChange={(e) => updateField('plateNo', e.target.value)}
                >
                  <option value="">เลือกทะเบียนรถ</option>
                  {buildDropdownOptions(plateOptions, formData.plateNo).map((option) => (
                    <option key={`form-plate-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
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
              มอบหมายให้: {resolveAssignedAppName(selectedAssignedUser) || formData.driverName || '-'}
            </div>
          )}

          <label className="block text-sm">
            <span className={fieldLabelClass}>หมายเหตุ</span>
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

      <datalist id="location-options">{locationOptions.map((location) => <option key={location} value={location} />)}</datalist>
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

        <div className={`flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between md:px-7 ${isDark ? 'border-dark-muted/25 bg-dark-bg/40' : 'border-light-muted/20 bg-slate-50'}`}>
          <div>
            <h3 className="text-base font-semibold">ค้นหาและกรองข้อมูล</h3>
            <p className={`mt-1 text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>แสดงงานของเดือนที่เลือก และงานค้างจากเดือนก่อนหน้าที่ยังไม่เสร็จ</p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-wrap">
            <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="ค้นหา Job No./คนขับ/ทะเบียน" className={isDark ? 'min-h-11 w-full rounded-xl border border-dark-muted/35 bg-dark-bg/50 px-3 py-2.5 text-[16px] md:text-sm text-dark-text focus:border-accent-primary focus:outline-none xl:min-w-[18rem]' : 'min-h-11 w-full rounded-xl border border-light-muted/35 bg-white px-3 py-2.5 text-[16px] md:text-sm text-light-text focus:border-accent-primary focus:outline-none xl:min-w-[18rem]'} />
            <select value={tableMonth} onChange={(e) => setTableMonth(e.target.value)} className={isDark ? 'min-h-11 w-full rounded-xl border border-dark-muted/35 bg-dark-bg/50 px-3 py-2.5 text-[16px] md:text-sm text-dark-text focus:border-accent-primary focus:outline-none' : 'min-h-11 w-full rounded-xl border border-light-muted/35 bg-white px-3 py-2.5 text-[16px] md:text-sm text-light-text focus:border-accent-primary focus:outline-none'}>
              {tableMonthOptions.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | JobStatus)} className={isDark ? 'min-h-11 w-full rounded-xl border border-dark-muted/35 bg-dark-bg/50 px-3 py-2.5 text-[16px] md:text-sm text-dark-text focus:border-accent-primary focus:outline-none' : 'min-h-11 w-full rounded-xl border border-light-muted/35 bg-white px-3 py-2.5 text-[16px] md:text-sm text-light-text focus:border-accent-primary focus:outline-none'}>
              <option value="all">ทุกสถานะ</option>
              <option value="pending">รอดำเนินการ</option>
              <option value="in_progress">กำลังทำงาน</option>
              <option value="completed">เสร็จแล้ว</option>
            </select>
          </div>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {filteredJobs.length === 0 ? (
            <article className="driver-clay-card p-4 sm:p-5">
              <p className="driver-clay-muted text-sm">ยังไม่มีข้อมูลในตารางการแจ้งงาน</p>
            </article>
          ) : (
            filteredJobs.map((job) => {
              const mobileTone = getMobileCardTone(job);

              return (
                <article
                  key={job.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openJobDetail(job)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openJobDetail(job);
                    }
                  }}
                  className={`driver-clay-card w-full cursor-pointer overflow-hidden p-3.5 text-left transition hover:-translate-y-[1px] sm:p-5 ${mobileTone.cardClass}`}
                >
                  <div className={mobileTone.headerClass}>
                    <span>{mobileTone.title}</span>
                    <span>{mobileTone.subtitle}</span>
                  </div>

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
                      <span className={`driver-clay-chip whitespace-nowrap ${mobileTone.dateChipClass}`}>
                        {mobileTone.dateChipLabel}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5 text-[13px] text-slate-700 sm:mt-4 sm:space-y-2 sm:text-sm">
                    <DetailRow
                      icon={<CalendarClock size={14} className="driver-clay-muted" />}
                      value={`วันที่รับงาน: ${getJobDate(job) || '-'}`}
                    />
                    <DetailRow
                      icon={<MapPin size={14} className="driver-clay-muted mt-0.5" />}
                      value={`รับ: ${job.pickup.location || '-'}`}
                    />
                    <DetailRow
                      icon={<MapPin size={14} className="driver-clay-muted mt-0.5" />}
                      value={`ส่ง: ${job.delivery.location || '-'}`}
                    />
                    <DetailRow
                      icon={<Truck size={14} className="driver-clay-muted" />}
                      value={`คนขับ: ${getDriverFullName(job)} | ทะเบียน: ${job.plateNo || '-'}`}
                    />
                    <DetailRow
                      icon={<Phone size={14} className="driver-clay-muted" />}
                      value={`เบอร์ติดต่อคนขับ: ${job.driverPhone || '-'}`}
                    />
                    {hasValue(job.pickup.time) && (
                      <DetailRow
                        icon={<Clock3 size={14} className="driver-clay-muted" />}
                        value={`เวลารับ: ${`${job.pickup.date || '-'} ${job.pickup.time || ''}`.trim()}`}
                      />
                    )}
                    {hasValue(job.delivery.time) && (
                      <DetailRow
                        icon={<Clock3 size={14} className="driver-clay-muted" />}
                        value={`เวลาส่ง: ${`${job.delivery.date || '-'} ${job.delivery.time || ''}`.trim()}`}
                      />
                    )}
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
                  </div>

                  <p className="driver-clay-muted mt-4 text-[11px] sm:mt-3 sm:text-xs">
                    แตะการ์ดเพื่อเปิดรายละเอียดและจัดการรายการ
                  </p>
                </article>
              );
            })
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full table-fixed text-sm">
            <thead className={isDark ? 'bg-dark-bg/60 text-dark-muted' : 'bg-slate-100 text-slate-600'}>
              <tr>
                <th className="w-[10%] px-3 py-2 text-left">วันที่งาน</th>
                <th className="w-[12%] px-3 py-2 text-left">ลูกค้า</th>
                <th className="w-[24%] px-3 py-2 text-left">ต้นทาง-ปลายทาง</th>
                <th className="w-[18%] px-3 py-2 text-left">ประเภทรถ / ป้ายทะเบียน</th>
                <th className="w-[12%] px-3 py-2 text-left">ประเภทสินค้า</th>
                <th className="w-[16%] px-3 py-2 text-left">คนขับ</th>
                <th className="w-[8%] px-3 py-2 text-left">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`px-3 py-6 text-center ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>ไม่พบข้อมูล</td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => openJobDetail(job)}
                    className={`cursor-pointer transition ${
                      isCarryOverJob(job)
                        ? isDark
                          ? 'border-t border-rose-400/20 bg-rose-500/10 hover:bg-rose-500/15'
                          : 'border-t border-rose-200/80 bg-rose-50/70 hover:bg-rose-100/70'
                        : isCurrentMonthOverdueJob(job)
                          ? isDark
                            ? 'border-t border-dark-muted/20 bg-white/5 hover:bg-white/10'
                            : 'border-t border-light-muted/20 bg-slate-50 hover:bg-slate-100'
                          : isDark
                            ? 'border-t border-dark-muted/20 hover:bg-white/5'
                            : 'border-t border-light-muted/20 hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-3 py-3 align-top">{getJobDate(job)}</td>
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
                    <td className="px-3 py-3 align-top text-sm">{job.productName || '-'}</td>
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

      <Modal
        isOpen={showCardModal}
        onClose={() => setShowCardModal(false)}
        title={cardModalTitle}
        panelClassName="md:max-w-3xl lg:max-w-4xl"
      >
        <div className="hide-scrollbar grid max-h-[60vh] gap-3 overflow-y-auto lg:grid-cols-2">
          {cardModalJobs.length === 0 ? (
            <p className="driver-clay-muted text-sm">ไม่พบรายการ</p>
          ) : (
            cardModalJobs.map((job) => (
              <button
                key={job.id}
                type="button"
                className="driver-clay-soft w-full p-3 text-left transition hover:brightness-[1.01]"
                onClick={() => {
                  setShowCardModal(false);
                  openJobDetail(job);
                }}
              >
                <p className="text-sm font-semibold text-slate-700">{getDriverFullName(job)}</p>
                <p className="driver-clay-muted text-xs">ทะเบียน: {job.plateNo || '-'}</p>
                <p className="driver-clay-muted text-xs">{job.pickup.location || '-'} → {job.delivery.location || '-'}</p>
                <p className="driver-clay-muted text-xs">{job.pickup.time || '-'} / {job.delivery.time || '-'}</p>
              </button>
            ))
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showDetailModal && !!selectedJob}
        onClose={() => {
          setShowDetailModal(false);
          setShowStatusPickerModal(false);
        }}
        title="รายละเอียดงาน"
        panelClassName="md:max-w-4xl lg:max-w-5xl"
      >
        {selectedJob && (
          <div className="space-y-4 text-sm">
            <div className="driver-clay-soft p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-700">
                    {selectedJob.employerCompany || '-'} | {selectedJob.productName || '-'}
                  </p>
                  <p className="driver-clay-muted text-xs">
                    เลขที่ใบสั่งงาน: {selectedJob.workOrderNo || selectedJob.ticketNo || '-'}
                  </p>
                </div>
                <span className={`driver-clay-chip ${statusBadgeClass(selectedJob.status)}`}>
                  {statusIcon(selectedJob.status)}
                  {statusLabelMap[selectedJob.status]}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-2">
                <div><span className="driver-clay-muted">วันที่แจ้งงาน:</span> {asDateOnly(selectedJob.orderDate || getJobDate(selectedJob)) || '-'}</div>
                <div><span className="driver-clay-muted">วันที่รับงาน:</span> {getJobDate(selectedJob) || '-'}</div>
                <div><span className="driver-clay-muted">Job No.:</span> {selectedJob.jobNo || '-'}</div>
                <div><span className="driver-clay-muted">คนขับ:</span> {getDriverFullName(selectedJob)}</div>
                <div><span className="driver-clay-muted">รับงานแอพ:</span> {getAssignedAppLabel(selectedJob)}</div>
                <div><span className="driver-clay-muted">ประเภทรถ:</span> {selectedJob.vehicleType || '-'}</div>
                <div><span className="driver-clay-muted">ทะเบียน:</span> {selectedJob.plateNo || '-'}</div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="driver-clay-soft space-y-2 p-3 text-xs text-slate-700">
                <p className="font-semibold text-slate-700">จุดรับ</p>
                <p>สถานที่: {selectedJob.pickup.location || '-'}</p>
                <p>วันที่/เวลา: {selectedJob.pickup.date || '-'} {selectedJob.pickup.time || ''}</p>
                <p>ผู้ติดต่อ: {selectedJob.pickup.contact || '-'}</p>
              </div>

              <div className="driver-clay-soft space-y-2 p-3 text-xs text-slate-700">
                <p className="font-semibold text-slate-700">จุดส่ง</p>
                <p>สถานที่: {selectedJob.delivery.location || '-'}</p>
                <p>วันที่/เวลา: {selectedJob.delivery.date || '-'} {selectedJob.delivery.time || ''}</p>
                <p>ผู้ติดต่อ: {selectedJob.delivery.contact || '-'}</p>
              </div>
            </div>

            <div className="driver-clay-soft space-y-1.5 p-3 text-xs text-slate-700">
              <p>เบอร์ติดต่อคนขับ: {selectedJob.driverPhone || '-'}</p>
              <p>หมายเหตุ: {selectedJob.importantNote || '-'}</p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setShowStatusPickerModal(true)}
                disabled={updatingJobId === selectedJob.id}
                className="driver-clay-btn driver-clay-btn-warning text-xs disabled:opacity-50"
              >
                <CircleDashed size={14} />
                แก้ไขสถานะ
              </button>
              <button
                type="button"
                onClick={() => handleDownloadPdf(toEditableForm(selectedJob))}
                className="driver-clay-btn driver-clay-btn-info driver-clay-btn-pdf text-xs"
              >
                <FileDown size={14} />
                ดาวน์โหลด PDF
              </button>
              <button
                type="button"
                onClick={() => openEditModal(selectedJob)}
                className="driver-clay-btn border border-sky-200 bg-sky-100/90 text-xs text-sky-700 shadow-[inset_1px_1px_0_rgba(255,255,255,0.7)] hover:bg-sky-200/85"
              >
                <Pencil size={14} />
                แก้ไข
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleRequestDelete(selectedJob)}
                  className="driver-clay-btn bg-[#ffd9de] text-rose-600 text-xs"
                >
                  <Trash2 size={14} />
                  ลบ
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showStatusPickerModal && !!selectedJob}
        onClose={() => setShowStatusPickerModal(false)}
        title="แก้ไขสถานะงาน"
      >
        {selectedJob && (
          <div className="space-y-4 text-sm">
            <div className="driver-clay-soft p-3">
              <p className="driver-clay-muted text-xs">สถานะปัจจุบัน</p>
              <div className="mt-2">
                <span className={`driver-clay-chip ${statusBadgeClass(selectedJob.status)}`}>
                  {statusIcon(selectedJob.status)}
                  {statusLabelMap[selectedJob.status]}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => void handleSelectStatusFromModal('pending')}
                disabled={updatingJobId === selectedJob.id || selectedJob.status === 'pending'}
                className="driver-clay-btn driver-clay-btn-ghost text-xs disabled:opacity-50"
              >
                รอดำเนินการ
              </button>
              <button
                type="button"
                onClick={() => void handleSelectStatusFromModal('in_progress')}
                disabled={updatingJobId === selectedJob.id || selectedJob.status === 'in_progress'}
                className="driver-clay-btn driver-clay-btn-warning text-xs disabled:opacity-50"
              >
                กำลังทำ
              </button>
              <button
                type="button"
                onClick={() => void handleSelectStatusFromModal('completed')}
                disabled={updatingJobId === selectedJob.id || selectedJob.status === 'completed'}
                className="driver-clay-btn driver-clay-btn-info text-xs disabled:opacity-50"
              >
                เสร็จแล้ว
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowStatusPickerModal(false)}
              className="driver-clay-btn driver-clay-btn-ghost w-full text-xs"
            >
              ยกเลิก
            </button>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!editingJobId && !!editForm}
        onClose={closeEditModal}
        title="แก้ไขรายการงาน"
        panelClassName="md:max-w-5xl lg:max-w-6xl xl:max-w-7xl"
        bodyClassName="hide-scrollbar max-h-[calc(100dvh-8rem)] overflow-y-auto pr-1 md:max-h-[calc(100dvh-11rem)]"
      >
        {editForm && (
          <div className="space-y-4 text-sm">
            <div className="driver-clay-soft p-3">
              <p className="driver-clay-muted text-xs">แก้ไขข้อมูลให้ครบเหมือนฟอร์มบันทึกหน้างาน แล้วกดบันทึกการแก้ไข</p>
            </div>

            <div className="space-y-4">
              <div className="driver-clay-soft space-y-3 p-3">
                <p className="text-sm font-semibold text-slate-700">ข้อมูลหลัก</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  <label className="space-y-1">
                    <span className={modalLabelClass}>เลขที่ใบสั่งงาน</span>
                    <input className={modalInputClass} value={editForm.workOrderNo} onChange={(e) => handleEditField('workOrderNo', e.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>วันที่รับงานจากผู้ว่าจ้าง</span>
                    <input type="date" className={modalInputClass} value={editForm.orderDate} onChange={(e) => handleEditField('orderDate', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>บริษัทผู้ว่าจ้าง</span>
                    <select className={modalInputClass} value={editForm.employerCompany} onChange={(e) => handleEditField('employerCompany', e.target.value)}>
                      <option value="">เลือกบริษัทผู้ว่าจ้าง</option>
                      {buildDropdownOptions(employerCompanyOptions, editForm.employerCompany).map((option) => (
                        <option key={`edit-employer-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>ประเภทสินค้า</span>
                    <select className={modalInputClass} value={editForm.productName} onChange={(e) => handleEditField('productName', e.target.value)}>
                      <option value="">เลือกประเภทสินค้า</option>
                      {buildDropdownOptions(productTypeOptions, editForm.productName).map((option) => (
                        <option key={`edit-product-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>จำนวนรอบ</span>
                    <input type="number" min="0.5" step="0.5" inputMode="decimal" className={modalInputClass} value={editForm.quantity} onChange={(e) => handleEditField('quantity', e.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>ประเภทรถ</span>
                    <select className={modalInputClass} value={editForm.vehicleType} onChange={(e) => handleEditField('vehicleType', e.target.value)}>
                      <option value="">เลือกประเภทรถ</option>
                      {buildDropdownOptions(vehicleTypeOptions, editForm.vehicleType).map((option) => (
                        <option key={`edit-vehicle-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>ทะเบียน</span>
                    <select className={modalInputClass} value={editForm.plateNo} onChange={(e) => handleEditField('plateNo', e.target.value)}>
                      <option value="">เลือกทะเบียน</option>
                      {buildDropdownOptions(plateOptions, editForm.plateNo).map((option) => (
                        <option key={`edit-plate-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>มอบหมายพนักงาน (แอพ)</span>
                    <select className={modalInputClass} value={editForm.assignedToUid} onChange={(e) => handleEditAssignedUser(e.target.value)}>
                      <option value="">เลือกผู้รับงานแอพ</option>
                      {assignableUsers.map((staff) => (
                        <option key={staff.uid} value={staff.uid}>
                          {formatAssignableUserLabel(staff)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>พนักงานขับรถ</span>
                    <select className={modalInputClass} value={editForm.driverName} onChange={(e) => handleEditField('driverName', e.target.value)}>
                      <option value="">เลือกพนักงานขับรถ</option>
                      {buildDropdownOptions(driverOptions, editForm.driverName).map((option) => (
                        <option key={`edit-driver-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>เบอร์ติดต่อคนขับ</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"
                      placeholder="080-123-4567"
                      className={modalInputClass}
                      value={editForm.driverPhone}
                      onChange={(e) => handleEditField('driverPhone', e.target.value)}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>Job No.</span>
                    <input className={modalInputClass} value={editForm.jobNo} onChange={(e) => handleEditField('jobNo', e.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>Invoice No.</span>
                    <input className={modalInputClass} value={editForm.invNo} onChange={(e) => handleEditField('invNo', e.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>เลขที่ใบขนส่ง (Transport Doc)</span>
                    <input className={modalInputClass} value={editForm.transportDocNo} onChange={(e) => handleEditField('transportDocNo', e.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>ค่าน้ำมัน/ทางด่วน</span>
                    <input type="number" className={modalInputClass} value={editForm.fuelAndToll} onChange={(e) => handleEditField('fuelAndToll', e.target.value)} />
                  </label>
                </div>
              </div>

              <div className="driver-clay-soft space-y-3 p-3">
                <p className="text-sm font-semibold text-slate-700">จุดรับ</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="space-y-1 sm:col-span-2 lg:col-span-2">
                    <span className={modalLabelClass}>สถานที่รับ</span>
                    <select className={modalInputClass} value={editForm.pickup.location} onChange={(e) => handleEditPoint('pickup', 'location', e.target.value)}>
                      <option value="">เลือกสถานที่รับ</option>
                      {buildDropdownOptions(locationOptions, editForm.pickup.location).map((option) => (
                        <option key={`edit-pickup-location-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>วันที่รับ</span>
                    <input type="date" min={editForm.orderDate || undefined} className={modalInputClass} value={editForm.pickup.date} onChange={(e) => handleEditPoint('pickup', 'date', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>เวลารับ</span>
                    <input type="time" lang="en-GB" step={60} className={modalInputClass} value={editForm.pickup.time} onChange={(e) => handleEditPoint('pickup', 'time', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <span className={modalLabelClass}>ผู้ติดต่อจุดรับ</span>
                    <select className={modalInputClass} value={editForm.pickup.contact} onChange={(e) => handleEditPoint('pickup', 'contact', e.target.value)}>
                      <option value="">เลือกผู้ติดต่อจุดรับ</option>
                      {buildDropdownOptions(contactOptions, editForm.pickup.contact).map((option) => (
                        <option key={`edit-pickup-contact-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="driver-clay-soft space-y-3 p-3">
                <p className="text-sm font-semibold text-slate-700">จุดส่ง</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="space-y-1 sm:col-span-2 lg:col-span-2">
                    <span className={modalLabelClass}>สถานที่ส่ง</span>
                    <select className={modalInputClass} value={editForm.delivery.location} onChange={(e) => handleEditPoint('delivery', 'location', e.target.value)}>
                      <option value="">เลือกสถานที่ส่ง</option>
                      {buildDropdownOptions(locationOptions, editForm.delivery.location).map((option) => (
                        <option key={`edit-delivery-location-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>วันที่ส่ง</span>
                    <input type="date" min={editForm.pickup.date || undefined} className={modalInputClass} value={editForm.delivery.date} onChange={(e) => handleEditPoint('delivery', 'date', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                  </label>
                  <label className="space-y-1">
                    <span className={modalLabelClass}>เวลาส่ง</span>
                    <input type="time" lang="en-GB" step={60} className={modalInputClass} value={editForm.delivery.time} onChange={(e) => handleEditPoint('delivery', 'time', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <span className={modalLabelClass}>ผู้ติดต่อจุดส่ง</span>
                    <select className={modalInputClass} value={editForm.delivery.contact} onChange={(e) => handleEditPoint('delivery', 'contact', e.target.value)}>
                      <option value="">เลือกผู้ติดต่อจุดส่ง</option>
                      {buildDropdownOptions(contactOptions, editForm.delivery.contact).map((option) => (
                        <option key={`edit-delivery-contact-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="driver-clay-soft space-y-3 p-3">
                <label className="space-y-1">
                  <span className={modalLabelClass}>หมายเหตุ</span>
                  <textarea rows={3} className={modalTextareaClass} value={editForm.importantNote} onChange={(e) => handleEditField('importantNote', e.target.value)} />
                </label>
              </div>

              <div className="driver-clay-soft space-y-3 p-3">
                <p className="text-sm font-semibold text-slate-700">รูปภาพต้นทาง</p>
                <input ref={editOriginInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleEditImageSelect('origin', e)} />
                {editForm.originImageUrls.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                    {editForm.originImageUrls.map((url, index) => (
                      <div key={`edit-origin-existing-${url}-${index}`} className="relative overflow-hidden rounded-xl border border-white/70">
                        <img src={url} alt={`Origin ${index + 1}`} className="h-24 w-full cursor-pointer object-cover" onClick={() => window.open(url, '_blank')} />
                        <button type="button" onClick={() => removeEditExistingImage('originImageUrls', index)} className="absolute right-1 top-1 inline-flex items-center gap-1 rounded-md bg-red-500 px-1.5 py-1 text-[10px] font-semibold text-white">
                          <Trash2 size={10} />
                          ลบ
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {editOriginPreviews.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                    {editOriginPreviews.map((preview, index) => (
                      <div key={`edit-origin-new-${index}`} className="relative overflow-hidden rounded-xl border border-white/70">
                        <img src={preview} alt={`New Origin ${index + 1}`} className="h-24 w-full object-cover" />
                        <button type="button" onClick={() => removeEditPreviewImage('origin', index)} className="absolute right-1 top-1 inline-flex items-center gap-1 rounded-md bg-red-500 px-1.5 py-1 text-[10px] font-semibold text-white">
                          <Trash2 size={10} />
                          ลบ
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => editOriginInputRef.current?.click()} className={modalUploadButtonClass}>
                  <Plus size={14} />
                  เพิ่มรูปภาพต้นทาง
                </button>
              </div>

              <div className="driver-clay-soft space-y-3 p-3">
                <p className="text-sm font-semibold text-slate-700">รูปภาพปลายทาง</p>
                <input ref={editDestinationInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleEditImageSelect('destination', e)} />
                {editForm.destinationImageUrls.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                    {editForm.destinationImageUrls.map((url, index) => (
                      <div key={`edit-destination-existing-${url}-${index}`} className="relative overflow-hidden rounded-xl border border-white/70">
                        <img src={url} alt={`Destination ${index + 1}`} className="h-24 w-full cursor-pointer object-cover" onClick={() => window.open(url, '_blank')} />
                        <button type="button" onClick={() => removeEditExistingImage('destinationImageUrls', index)} className="absolute right-1 top-1 inline-flex items-center gap-1 rounded-md bg-red-500 px-1.5 py-1 text-[10px] font-semibold text-white">
                          <Trash2 size={10} />
                          ลบ
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {editDestinationPreviews.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                    {editDestinationPreviews.map((preview, index) => (
                      <div key={`edit-destination-new-${index}`} className="relative overflow-hidden rounded-xl border border-white/70">
                        <img src={preview} alt={`New Destination ${index + 1}`} className="h-24 w-full object-cover" />
                        <button type="button" onClick={() => removeEditPreviewImage('destination', index)} className="absolute right-1 top-1 inline-flex items-center gap-1 rounded-md bg-red-500 px-1.5 py-1 text-[10px] font-semibold text-white">
                          <Trash2 size={10} />
                          ลบ
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => editDestinationInputRef.current?.click()} className={modalUploadButtonClass}>
                  <Plus size={14} />
                  เพิ่มรูปภาพปลายทาง
                </button>
              </div>

              <div className="driver-clay-soft space-y-3 p-3">
                <p className="text-sm font-semibold text-slate-700">รูปภาพเอกสาร</p>
                <input ref={editDocumentInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleEditImageSelect('document', e)} />
                {editForm.documentImageUrls.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                    {editForm.documentImageUrls.map((url, index) => (
                      <div key={`edit-document-existing-${url}-${index}`} className="relative overflow-hidden rounded-xl border border-white/70">
                        <img src={url} alt={`Document ${index + 1}`} className="h-24 w-full cursor-pointer object-cover" onClick={() => window.open(url, '_blank')} />
                        <button type="button" onClick={() => removeEditExistingImage('documentImageUrls', index)} className="absolute right-1 top-1 inline-flex items-center gap-1 rounded-md bg-red-500 px-1.5 py-1 text-[10px] font-semibold text-white">
                          <Trash2 size={10} />
                          ลบ
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {editDocumentPreviews.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                    {editDocumentPreviews.map((preview, index) => (
                      <div key={`edit-document-new-${index}`} className="relative overflow-hidden rounded-xl border border-white/70">
                        <img src={preview} alt={`New Document ${index + 1}`} className="h-24 w-full object-cover" />
                        <button type="button" onClick={() => removeEditPreviewImage('document', index)} className="absolute right-1 top-1 inline-flex items-center gap-1 rounded-md bg-red-500 px-1.5 py-1 text-[10px] font-semibold text-white">
                          <Trash2 size={10} />
                          ลบ
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => editDocumentInputRef.current?.click()} className={modalUploadButtonClass}>
                  <FileText size={14} />
                  เพิ่มรูปภาพเอกสาร
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" onClick={closeEditModal} className="driver-clay-btn driver-clay-btn-ghost text-xs">
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isEditingSave}
                className="driver-clay-btn driver-clay-btn-success text-xs disabled:opacity-60"
              >
                {isEditingSave ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TodayJobs;
