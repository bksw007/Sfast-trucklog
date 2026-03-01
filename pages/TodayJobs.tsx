import React, { useEffect, useMemo, useState } from 'react';
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
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  Truck,
  UserCheck,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { addTodayJob, deleteTodayJob, subscribeToTodayJobs, triggerTodayJobNotification, updateTodayJob } from '../services/firebaseService';
import { getAllUsers } from '../services/userService';
import { DispatchPoint, TodayJobEntry, UserProfile } from '../types';
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

const initialFormData = (): TodayJobForm => ({
  employerCompany: 'MLT',
  jobNo: '',
  workOrderNo: '',
  workDate: getLocalDate(),
  vehicleType: '',
  productName: '',
  quantity: '',
  pickup: { location: '', date: '', time: '', contact: '' },
  delivery: { location: '', date: '', time: '', contact: '' },
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
    `งานวันนี้: ${data.jobNo || '-'}`,
    `เลขที่ใบสั่งงาน: ${data.workOrderNo || '-'}`,
    `วันที่รับงาน: ${data.workDate || '-'}`,
    `ลูกค้า: ${data.employerCompany || '-'}`,
    `ชนิดรถ: ${data.vehicleType || '-'} | ทะเบียน: ${data.plateNo || '-'}`,
    `สินค้า: ${data.productName || '-'} | ปริมาณ: ${data.quantity || '-'}`,
    `รับงาน: ${data.pickup.location || '-'} วันที่ ${data.pickup.date || '-'} เวลา ${data.pickup.time || '-'}`,
    `ส่งงาน: ${data.delivery.location || '-'} วันที่ ${data.delivery.date || '-'} เวลา ${data.delivery.time || '-'}`,
    `ผู้ติดต่อรับ: ${data.pickup.contact || '-'} | ผู้ติดต่อส่ง: ${data.delivery.contact || '-'}`,
    `พนักงานขับรถ: ${data.driverName || '-'} | โทร: ${data.driverPhone || '-'}`,
    `หมายเหตุ: ${data.importantNote || '-'}`
  ];

  return lines.join('\n');
};

const TodayJobs: React.FC = () => {
  const { theme } = useTheme();
  const { user, userProfile } = useAuth();
  const { data: appData } = useData();
  const isDark = theme === 'dark';
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

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TodayJobForm | null>(null);
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

  const options = appData?.options;
  const sortUniqueOptions = (items: string[]) =>
    Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));

  const vehicleTypeOptions = useMemo(() => sortUniqueOptions(options?.vehicleTypes ?? []), [options?.vehicleTypes]);
  const locationOptions = useMemo(() => sortUniqueOptions(options?.locations ?? []), [options?.locations]);
  const driverOptions = useMemo(() => sortUniqueOptions(options?.drivers ?? []), [options?.drivers]);
  const plateOptions = useMemo(() => sortUniqueOptions(options?.licensePlates ?? []), [options?.licensePlates]);

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
    setFormData((prev) => ({
      ...prev,
      assignedToUid,
      driverName: driverFullName || prev.driverName,
    }));
  };

  const updatePoint = (point: 'pickup' | 'delivery', field: keyof DispatchPoint, value: string) => {
    setFormData((prev) => ({ ...prev, [point]: { ...prev[point], [field]: value } }));
  };

  const handleReset = () => setFormData(initialFormData());

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

  const handleDownloadPdf = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    doc.addFileToVFS('NotoSansThai.ttf', NotoSansThaiBase64);
    doc.addFont('NotoSansThai.ttf', 'NotoSansThai', 'normal');
    doc.setFont('NotoSansThai');

    doc.setFontSize(17);
    doc.text('S FAST TRANSPORTATION LIMITED PARTNERSHIP', 105, 16, { align: 'center' });
    doc.setFontSize(20);
    doc.text('ใบสั่งงาน', 105, 26, { align: 'center' });

    drawLineField(doc, 'บริษัทผู้ว่าจ้าง :', formData.employerCompany, 12, 45, 40);
    drawLineField(doc, 'เลขที่ใบสั่งงาน :', formData.workOrderNo, 130, 154, 40);
    drawLineField(doc, 'วันที่รับงาน :', formData.workDate, 12, 45, 50);
    drawLineField(doc, 'ชนิดรถ :', formData.vehicleType, 84, 108, 50);
    drawLineField(doc, 'Job No. :', formData.jobNo, 130, 154, 50);
    drawLineField(doc, 'สินค้าที่รับ :', formData.productName, 12, 45, 60);
    drawLineField(doc, 'ปริมาณ :', formData.quantity, 130, 154, 60);

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

    doc.text(formData.pickup.location || '-', 80, 85, { align: 'center' });
    doc.text(formData.delivery.location || '-', 157, 85, { align: 'center' });
    doc.text(formData.pickup.date || '-', 80, 94, { align: 'center' });
    doc.text(formData.delivery.date || '-', 157, 94, { align: 'center' });
    doc.text(formData.pickup.time || '-', 80, 102.5, { align: 'center' });
    doc.text(formData.delivery.time || '-', 157, 102.5, { align: 'center' });
    doc.text(formData.pickup.contact || '-', 80, 111, { align: 'center' });
    doc.text(formData.delivery.contact || '-', 157, 111, { align: 'center' });

    drawLineField(doc, 'พนักงานขับรถ :', formData.driverName, 12, 45, 126);
    drawLineField(doc, 'ทะเบียน :', formData.plateNo, 130, 154, 126);
    drawLineField(doc, 'เบอร์ติดต่อ :', formData.driverPhone, 12, 45, 136);

    doc.text('หมายเหตุสำคัญ :', 12, 150);
    doc.line(42, 151.3, 195, 151.3);
    doc.text(formData.importantNote || '-', 12, 159);
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
    doc.save(`today-job-${formData.workDate || getLocalDate()}.pdf`);
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

    setIsSaving(true);
    try {
      const assignedName = selectedAssignedUser?.displayName || formData.driverName || '-';
      const createdJob = await addTodayJob({
        ...formData,
        ticketNo: formData.workOrderNo,
        assignedToName: assignedName,
        summaryText,
        status: 'pending',
        readyToClose: false,
        readyToCloseAt: null,
        acceptedAt: null,
        completedAt: null,
        completedByUid: '',
        lastSavedAt: Date.now(),
        updatedByUid: user.uid,
        createdByUid: user.uid,
        createdByName: userProfile?.displayName || user.email || 'unknown'
      });
      try {
        await triggerTodayJobNotification('create', createdJob.id);
      } catch (notifyError) {
        console.error('Notify create event failed:', notifyError);
      }
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 1300);
      setFormData(initialFormData());
    } catch (error) {
      console.error('Save today job failed:', error);
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
      await updateTodayJob(jobId, {
        status,
        readyToClose: status === 'in_progress' ? true : false,
        readyToCloseAt: status === 'in_progress' ? Date.now() : null,
        completedAt: status === 'completed' ? Date.now() : null,
      });

      if (status === 'in_progress') {
        try {
          await triggerTodayJobNotification('ready', jobId);
        } catch (notifyError) {
          console.error('Notify ready event failed:', notifyError);
        }
      }
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
    setEditForm((prev) => (prev ? { ...prev, assignedToUid, driverName: driverFullName || prev.driverName } : prev));
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
      });
      try {
        await triggerTodayJobNotification('update', editingJobId);
      } catch (notifyError) {
        console.error('Notify update event failed:', notifyError);
      }
      setEditingJobId(null);
      setEditForm(null);
    } catch (error) {
      console.error('Save edit failed:', error);
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

  return (
    <div className="space-y-6 animate-fade-in overflow-x-hidden">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#0f766e] via-[#0e7490] to-[#075985] px-6 py-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/80">Dispatch Center</p>
              <h1 className="mt-1 text-2xl font-semibold">งานวันนี้</h1>
              <p className="mt-1 text-sm text-white/85">แดชบอร์ด + ฟอร์มแจ้งงาน + ตารางประวัติในหน้าเดียว</p>
            </div>
            <ClipboardCheck className="h-9 w-9 text-white/90" />
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

      <section className={`${cardClass} overflow-hidden`}>
        <div className={`border-b px-5 py-3 md:px-7 ${isDark ? 'border-dark-muted/25 bg-dark-bg/40' : 'border-light-muted/20 bg-slate-50'}`}>
          <h2 className="text-lg font-semibold">ฟอร์มแจ้งงาน</h2>
          <p className={`mt-1 text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>สร้างใบแจ้งงานและบันทึกเข้าระบบ</p>
        </div>

        <div className="space-y-6 p-5 md:p-7">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>บริษัทผู้ว่าจ้าง</span>
              <input className={inputClass} value={formData.employerCompany} onChange={(e) => updateField('employerCompany', e.target.value)} />
            </label>
            <label className="text-sm">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>เลขที่ใบสั่งงาน (Work Order)</span>
              <input className={inputClass} value={formData.workOrderNo} onChange={(e) => updateField('workOrderNo', e.target.value)} />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <label className="text-sm md:col-span-1">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>วันที่รับงาน</span>
              <input type="date" className={inputClass} value={formData.workDate} onChange={(e) => updateField('workDate', e.target.value)} onClick={openNativePicker} onFocus={openNativePicker} />
            </label>
            <label className="text-sm md:col-span-1">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>ชนิดรถ</span>
              <input list="vehicle-type-options" className={selectClass} value={formData.vehicleType} onChange={(e) => updateField('vehicleType', e.target.value)} placeholder="พิมพ์ค้นหาหรือเลือกประเภทรถ" />
            </label>
            <label className="text-sm md:col-span-1">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>Job No.</span>
              <input className={inputClass} value={formData.jobNo} onChange={(e) => updateField('jobNo', e.target.value)} />
            </label>
            <label className="text-sm md:col-span-1">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>ปริมาณ</span>
              <input className={inputClass} value={formData.quantity} onChange={(e) => updateField('quantity', e.target.value)} />
            </label>
          </div>

          <label className="block text-sm">
            <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>สินค้าที่รับ</span>
            <input className={inputClass} value={formData.productName} onChange={(e) => updateField('productName', e.target.value)} />
          </label>

          <div className={`space-y-3 md:hidden`}>
            <div className={`rounded-xl border p-3 ${isDark ? 'border-dark-muted/30 bg-dark-bg/35' : 'border-light-muted/30 bg-slate-50'}`}>
              <p className="mb-2 text-sm font-semibold">รับงาน</p>
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>สถานที่</span>
                  <input list="location-options" className={selectClass} value={formData.pickup.location} onChange={(e) => updatePoint('pickup', 'location', e.target.value)} placeholder="พิมพ์ค้นหาสถานที่รับ" />
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
                  <input className={pointInputClass} value={formData.pickup.contact} onChange={(e) => updatePoint('pickup', 'contact', e.target.value)} />
                </label>
              </div>
            </div>
            <div className={`rounded-xl border p-3 ${isDark ? 'border-dark-muted/30 bg-dark-bg/35' : 'border-light-muted/30 bg-slate-50'}`}>
              <p className="mb-2 text-sm font-semibold">ส่งงาน</p>
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>สถานที่</span>
                  <input list="location-options" className={selectClass} value={formData.delivery.location} onChange={(e) => updatePoint('delivery', 'location', e.target.value)} placeholder="พิมพ์ค้นหาสถานที่ส่ง" />
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
                  <input className={pointInputClass} value={formData.delivery.contact} onChange={(e) => updatePoint('delivery', 'contact', e.target.value)} />
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
                  <input list="location-options" className={selectClass} value={formData.pickup.location} onChange={(e) => updatePoint('pickup', 'location', e.target.value)} placeholder="พิมพ์ค้นหาสถานที่รับ" />
                </div>
                <div className="px-2 py-2">
                  <input list="location-options" className={selectClass} value={formData.delivery.location} onChange={(e) => updatePoint('delivery', 'location', e.target.value)} placeholder="พิมพ์ค้นหาสถานที่ส่ง" />
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
                  <input className={pointInputClass} value={formData.pickup.contact} onChange={(e) => updatePoint('pickup', 'contact', e.target.value)} />
                </div>
                <div className="px-2 py-2">
                  <input className={pointInputClass} value={formData.delivery.contact} onChange={(e) => updatePoint('delivery', 'contact', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
              <input list="driver-options" className={selectClass} value={formData.driverName} onChange={(e) => updateField('driverName', e.target.value)} placeholder="พิมพ์ค้นหาคนขับ" />
            </label>
            <label className="text-sm">
              <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>ทะเบียน</span>
              <input list="plate-options" className={selectClass} value={formData.plateNo} onChange={(e) => updateField('plateNo', e.target.value)} placeholder="พิมพ์ค้นหาทะเบียนรถ" />
            </label>
          </div>

          <label className="block text-sm">
            <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>เบอร์ติดต่อ</span>
            <input className={inputClass} value={formData.driverPhone} onChange={(e) => updateField('driverPhone', e.target.value)} />
          </label>

          {formData.assignedToUid && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${isDark ? 'border-dark-muted/25 bg-dark-bg/40 text-dark-muted' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
              มอบหมายให้: {selectedAssignedUser?.displayName || formData.driverName || '-'}
            </div>
          )}

          <label className="block text-sm">
            <span className={isDark ? 'text-dark-muted' : 'text-light-muted'}>หมายเหตุสำคัญ</span>
            <textarea rows={3} className={isDark ? 'mt-2 w-full rounded-xl border border-dark-muted/30 bg-dark-bg/40 px-3 py-2 text-sm text-dark-text focus:border-accent-primary focus:outline-none' : 'mt-2 w-full rounded-xl border border-light-muted/30 bg-white px-3 py-2 text-sm text-light-text focus:border-accent-primary focus:outline-none'} value={formData.importantNote} onChange={(e) => updateField('importantNote', e.target.value)} />
          </label>

          <div className={`rounded-xl border px-4 py-3 text-sm ${isDark ? 'border-dark-muted/25 bg-dark-bg/40 text-dark-muted' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            แผนในอนาคต: ส่งใบแจ้งงานเข้าไลน์กลุ่ม/เทเลแกรมอัตโนมัติหลังสร้าง (ปัจจุบันพักไว้ก่อน ยังไม่เปิดใช้งาน)
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleDownloadPdf} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#0f766e] px-4 py-2 text-sm font-medium text-white shadow-lg shadow-sky-900/25 transition hover:brightness-110">
              <FileDown size={16} />
              ดาวน์โหลด PDF
            </button>
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
        <textarea readOnly value={summaryText} rows={10} className={isDark ? 'mt-3 w-full rounded-xl border border-dark-muted/30 bg-dark-bg/50 px-3 py-3 text-sm text-dark-text focus:outline-none' : 'mt-3 w-full rounded-xl border border-light-muted/30 bg-slate-50 px-3 py-3 text-sm text-light-text focus:outline-none'} />
      </section>

      <datalist id="vehicle-type-options">{vehicleTypeOptions.map((vehicle) => <option key={vehicle} value={vehicle} />)}</datalist>
      <datalist id="location-options">{locationOptions.map((location) => <option key={location} value={location} />)}</datalist>
      <datalist id="driver-options">{driverOptions.map((driver) => <option key={driver} value={driver} />)}</datalist>
      <datalist id="plate-options">{plateOptions.map((plate) => <option key={plate} value={plate} />)}</datalist>

      <section className={`${cardClass} overflow-hidden`}>
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 md:px-7 ${isDark ? 'border-dark-muted/25 bg-dark-bg/40' : 'border-light-muted/20 bg-slate-50'}`}>
          <div>
            <h2 className="text-lg font-semibold">ตารางข้อมูลการแจ้งงาน</h2>
            <p className={`mt-1 text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>คลิกที่แถวเพื่อเปิดรายละเอียด/แก้ไข/ลบ</p>
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
                <th className="px-3 py-2 text-left">Job No.</th>
                <th className="px-3 py-2 text-left">ลูกค้า</th>
                <th className="px-3 py-2 text-left">คนขับ/ทะเบียน</th>
                <th className="px-3 py-2 text-left">ต้นทาง-ปลายทาง</th>
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
                    <td className="px-3 py-3 align-top font-medium">{job.jobNo || '-'}</td>
                    <td className="px-3 py-3 align-top">{job.employerCompany || '-'}</td>
                    <td className="px-3 py-3 align-top">
                      <p>{job.driverName || '-'}</p>
                      <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>แอพ: {job.assignedToName || '-'}</p>
                      <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>{job.plateNo || '-'}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-xs">
                      <p>{job.pickup.location || '-'} → {job.delivery.location || '-'}</p>
                      <p className={isDark ? 'text-dark-muted' : 'text-light-muted'}>{job.pickup.time || '-'} / {job.delivery.time || '-'}</p>
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

      <Modal isOpen={showDetailModal && !!selectedJob} onClose={() => setShowDetailModal(false)} title={`รายละเอียดงาน ${selectedJob?.jobNo || ''}`}>
        {selectedJob && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="font-medium">ลูกค้า:</span> {selectedJob.employerCompany || '-'}</div>
              <div><span className="font-medium">วันที่งาน:</span> {asDateOnly(selectedJob.workDate)}</div>
              <div><span className="font-medium">เลขที่ใบสั่งงาน:</span> {selectedJob.workOrderNo || selectedJob.ticketNo || '-'}</div>
              <div><span className="font-medium">Job No.:</span> {selectedJob.jobNo || '-'}</div>
              <div><span className="font-medium">คนขับ:</span> {selectedJob.driverName || '-'}</div>
              <div><span className="font-medium">ผู้รับงานแอพ:</span> {selectedJob.assignedToName || '-'}</div>
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
              <button type="button" onClick={() => openEditModal(selectedJob)} className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-3 py-2 text-xs font-medium text-white"><Pencil size={14} />แก้ไข</button>
              {isAdmin && (
                <button type="button" onClick={() => handleRequestDelete(selectedJob)} className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-xs font-medium text-white"><Trash2 size={14} />ลบ</button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!editingJobId && !!editForm} onClose={() => { setEditingJobId(null); setEditForm(null); }} title="แก้ไขรายการงาน">
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
              <button type="button" onClick={() => { setEditingJobId(null); setEditForm(null); }} className={`rounded-lg px-3 py-2 text-xs ${isDark ? 'bg-dark-bg text-dark-text' : 'bg-slate-100 text-slate-700'}`}>ยกเลิก</button>
              <button type="button" onClick={handleSaveEdit} disabled={isEditingSave} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">{isEditingSave ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TodayJobs;
