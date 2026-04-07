import React, { useState, useEffect, useMemo } from 'react';
import { deleteJob as firebaseDeleteJob, subscribeToJobsByMonth, updateJob as firebaseUpdateJob } from '../services/firebaseService';
import { JobEntry } from '../types';
import {
  ArrowUpDown,
  CalendarClock,
  ChevronUp,
  Download,
  Eye,
  Edit2,
  Filter,
  ChevronDown,
  Image as ImageIcon,
  MapPin,
  Package2,
  PlusCircle,
  Truck,
  UserRound,
  X
} from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ConfirmModal from '../components/ConfirmModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { NotoSansThaiBase64 } from '../fonts/NotoSansThai';
import { formatDate } from '../utils/formatters';
import EntryForm from './EntryForm';

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

type DateSortDirection = 'desc' | 'asc';

const getLocalDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split('T')[0];
};

const asDateOnly = (dateStr: string) => (dateStr || '').split('T')[0];

const DetailRow: React.FC<{ icon: React.ReactNode; value: string }> = ({ icon, value }) => (
  <div className="flex items-start gap-2">
    <div className="mt-0.5 shrink-0">{icon}</div>
    <div className="min-w-0 break-words leading-relaxed">{value}</div>
  </div>
);

const getCurrentMonthYear = () => {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };
};

const createDefaultFilters = (): Filters => {
  const { month, year } = getCurrentMonthYear();
  return {
    month,
    year,
    driver: '',
    vehicleType: '',
    licensePlate: ''
  };
};

const DataTable: React.FC = () => {
  const { data: appData, refreshData } = useData();
  const { userProfile } = useAuth();
  const { theme } = useTheme();
  const isAdmin = userProfile?.role === 'admin';
  const isDark = theme === 'dark';
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(() => createDefaultFilters());
  const [dateSortDirection, setDateSortDirection] = useState<DateSortDirection>('desc');

  const getJobYearMonth = (dateStr: string): { year: number; month: number } | null => {
    const datePart = dateStr?.split('T')[0];
    if (datePart) {
      const [yearStr, monthStr] = datePart.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
        return { year, month };
      }
    }

    const parsedDate = new Date(dateStr);
    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    return {
      year: parsedDate.getFullYear(),
      month: parsedDate.getMonth() + 1
    };
  };

  // Detail Modal State
  const [selectedJob, setSelectedJob] = useState<JobEntry | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<JobEntry | null>(null);
  
  // Confirm/Success Modal States
  const [showConfirmEdit, setShowConfirmEdit] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showAddJobModal, setShowAddJobModal] = useState(false);
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
  
  // New Images for Edit
  // New Images for Edit
  const [editOriginImageFiles, setEditOriginImageFiles] = useState<File[]>([]);
  const [editDestinationImageFiles, setEditDestinationImageFiles] = useState<File[]>([]);
  const [editDocumentImageFiles, setEditDocumentImageFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!filters.month || !filters.year) {
      setJobs([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const unsubscribe = subscribeToJobsByMonth(
      filters.year,
      filters.month,
      (rows) => {
        setJobs(rows);
        setLoading(false);
      },
      (error) => {
        console.error('DataTable jobs subscribe failed:', error);
        setJobs([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [filters.month, filters.year]);

  useEffect(() => {
    const lockScroll = isDetailModalOpen || showAddJobModal;
    if (!lockScroll) return undefined;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [isDetailModalOpen, showAddJobModal]);

  // Extract unique years from data
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, index) => currentYear - index);
  }, []);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const parsed = getJobYearMonth(job.date);
      if (!parsed) return false;
      const { month: jobMonth, year: jobYear } = parsed;

      if (filters.month && jobMonth !== filters.month) return false;
      if (filters.year && jobYear !== filters.year) return false;
      if (filters.driver && job.driverName !== filters.driver) return false;
      if (filters.vehicleType && job.vehicleType !== filters.vehicleType) return false;
      if (filters.licensePlate && job.licensePlate !== filters.licensePlate) return false;

      return true;
    });
  }, [jobs, filters]);

  const getDateSortValue = (dateValue: string): number => {
    const normalizedDate = dateValue?.split('T')[0] || dateValue;
    const parsedTime = new Date(normalizedDate).getTime();
    return Number.isNaN(parsedTime) ? Number.POSITIVE_INFINITY : parsedTime;
  };

  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      const dateDiff = getDateSortValue(a.date) - getDateSortValue(b.date);
      if (dateDiff !== 0) {
        return dateSortDirection === 'asc' ? dateDiff : -dateDiff;
      }

      const timestampDiff = (a.timestamp || 0) - (b.timestamp || 0);
      return dateSortDirection === 'asc' ? timestampDiff : -timestampDiff;
    });
  }, [filteredJobs, dateSortDirection]);

  const toggleDateSortDirection = () => {
    setDateSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  const clearFilters = () => {
    setFilters(createDefaultFilters());
  };

  const hasActiveFilters = filters.month || filters.year || filters.driver || filters.vehicleType || filters.licensePlate;
  const cardClass = isDark
    ? 'rounded-2xl border border-dark-muted/30 bg-dark-card/70 shadow-xl shadow-black/20'
    : 'rounded-2xl border border-light-muted/20 bg-light-card shadow-xl shadow-slate-200/60';
  const pastelFilterButtonClass = hasActiveFilters
    ? 'driver-clay-btn border border-emerald-200 bg-emerald-200/90 text-emerald-800 shadow-[inset_1px_1px_0_rgba(255,255,255,0.7)] hover:bg-emerald-300/85'
    : 'driver-clay-btn border border-emerald-200/80 bg-emerald-100/85 text-emerald-700 shadow-[inset_1px_1px_0_rgba(255,255,255,0.7)] hover:bg-emerald-200/85';
  const pastelEditButtonClass =
    'driver-clay-btn flex-1 border border-sky-200 bg-sky-100/90 text-sky-700 shadow-[inset_1px_1px_0_rgba(255,255,255,0.7)] hover:bg-sky-200/85';
  const selectClass = isDark
    ? 'w-full min-h-11 rounded-xl border border-dark-muted/35 bg-dark-bg/40 px-3 py-2.5 text-[16px] md:text-sm text-dark-text focus:border-accent-primary focus:outline-none'
    : 'w-full min-h-11 rounded-xl border border-light-muted/35 bg-white px-3 py-2.5 text-[16px] md:text-sm text-light-text focus:border-accent-primary focus:outline-none';
  const modalInputClass = 'driver-clay-input w-full min-h-11 px-3 py-2.5 text-[16px] md:text-sm';
  const modalFieldClass = 'driver-clay-soft p-3 sm:p-4';
  const modalLabelClass = 'admin-field-label mb-1 block text-[11px] uppercase tracking-[0.08em]';
  const sortUniqueOptions = (items: string[]) =>
    Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
  const locationOptions = useMemo(() => {
    const sortedLocations = sortUniqueOptions(appData?.options.locations || []);
    const pinnedSet = new Set(pinnedLocations);
    const pinned = sortedLocations.filter((item) => pinnedSet.has(item));
    const unpinned = sortedLocations.filter((item) => !pinnedSet.has(item));
    return [...pinned, ...unpinned];
  }, [appData?.options.locations, pinnedLocations]);

  const resolveWorkOrderNo = (job: Partial<JobEntry> | null | undefined): string =>
    (job?.workOrderNo || (job as JobEntry & { ticketNo?: string } | null | undefined)?.ticketNo || '').trim();

  const resolveInvoiceNo = (job: Partial<JobEntry> | null | undefined): string => {
    const invoice = (job?.invNo || '').trim();
    if (!invoice) return '';

    const workOrder = resolveWorkOrderNo(job);
    const linkedTodayJobId = ((job as JobEntry & { linkedTodayJobId?: string } | null | undefined)?.linkedTodayJobId || '').trim();

    // Legacy protection: old sync wrongly copied Work Order into Invoice.
    if (linkedTodayJobId && workOrder && invoice === workOrder) {
      return '';
    }

    return invoice;
  };

  const resolveProductName = (job: Partial<JobEntry> | null | undefined): string =>
    (job?.productName || '').trim() || 'Inverter';

  const formatGroupedNumber = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return '-';
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numericValue)) return '-';
    return numericValue.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const normalizeImageUrl = (value: unknown): string =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';

  const normalizeImageUrls = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [];

  const extractImageUrls = (
    source: Partial<JobEntry> | null | undefined,
    type: 'origin' | 'destination' | 'document'
  ): string[] => {
    if (!source) return [];

    const arrayField = `${type}ImageUrls` as keyof JobEntry;
    const singleField = `${type}ImageUrl` as keyof JobEntry;
    const urls = normalizeImageUrls(source[arrayField]);

    if (urls.length > 0) return urls;

    const singleUrl = normalizeImageUrl(source[singleField]);
    if (singleUrl) return [singleUrl];

    if (type === 'origin') {
      const legacyUrl = normalizeImageUrl((source as JobEntry & { imageUrl?: string }).imageUrl);
      if (legacyUrl) return [legacyUrl];
    }

    return [];
  };

  // Handle row click
  const handleRowClick = (job: JobEntry) => {
    setSelectedJob(job);
    setEditData({
      ...job,
      productName: resolveProductName(job),
      invNo: resolveInvoiceNo(job),
      workOrderNo: job.workOrderNo || (job as JobEntry & { ticketNo?: string }).ticketNo || '',
      transportDocNo: job.transportDocNo || '',
    });
    setEditOriginImageFiles([]); // Reset origin image files
    setEditDestinationImageFiles([]); // Reset destination image files
    setEditDocumentImageFiles([]); // Reset document image files
    setIsEditing(false);
    setIsDetailModalOpen(true);
  };

  const selectedOriginImageUrls = useMemo(() => extractImageUrls(selectedJob, 'origin'), [selectedJob]);
  const selectedDestinationImageUrls = useMemo(() => extractImageUrls(selectedJob, 'destination'), [selectedJob]);
  const selectedDocumentImageUrls = useMemo(() => extractImageUrls(selectedJob, 'document'), [selectedJob]);
  const editOriginImageUrls = useMemo(() => extractImageUrls(editData, 'origin'), [editData]);
  const editDestinationImageUrls = useMemo(() => extractImageUrls(editData, 'destination'), [editData]);
  const editDocumentImageUrls = useMemo(() => extractImageUrls(editData, 'document'), [editData]);
  const todayDate = asDateOnly(getLocalDate());

  const getMobileRunCardTone = (job: JobEntry) => {
    const jobDate = asDateOnly(job.date || '');

    if (jobDate > todayDate) {
      return {
        cardClass:
          'border border-sky-300/90 bg-[linear-gradient(145deg,rgba(224,242,254,0.96),rgba(240,249,255,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),10px_10px_22px_rgba(125,171,203,0.18),-8px_-8px_18px_rgba(255,255,255,0.88)]',
        headerClass:
          '-mx-4 -mt-4 mb-3 flex items-center justify-between rounded-t-[1.45rem] border-b border-sky-200/80 bg-[linear-gradient(90deg,#0284c7,#38bdf8)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white sm:-mx-5 sm:-mt-5 sm:px-5',
        title: 'งานล่วงหน้า',
        subtitle: 'ตามแผนงานวิ่ง',
        dateChipClass: 'border border-sky-200/70 bg-white/80 text-sky-700',
        dateChipLabel: 'ล่วงหน้า',
      };
    }

    if (jobDate < todayDate) {
      return {
        cardClass:
          'border border-emerald-200/90 bg-[linear-gradient(145deg,rgba(236,253,245,0.98),rgba(240,253,250,0.95))] shadow-[inset_0_1px_0_rgba(255,255,255,0.88),10px_10px_22px_rgba(110,231,183,0.14),-8px_-8px_18px_rgba(255,255,255,0.9)]',
        headerClass:
          '-mx-4 -mt-4 mb-3 flex items-center justify-between rounded-t-[1.45rem] border-b border-emerald-200/80 bg-[linear-gradient(90deg,#10b981,#34d399)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white sm:-mx-5 sm:-mt-5 sm:px-5',
        title: '',
        subtitle: 'ประวัติงานวิ่ง',
        dateChipClass: '',
        dateChipLabel: '',
      };
    }

    return {
      cardClass:
        'border border-orange-200/90 bg-[linear-gradient(145deg,rgba(255,247,237,0.98),rgba(255,251,235,0.94))] shadow-[inset_0_1px_0_rgba(255,255,255,0.88),10px_10px_22px_rgba(215,176,126,0.14),-8px_-8px_18px_rgba(255,255,255,0.9)]',
      headerClass:
        '-mx-4 -mt-4 mb-3 flex items-center justify-between rounded-t-[1.45rem] border-b border-orange-200/80 bg-[linear-gradient(90deg,#f59e0b,#fbbf24)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white sm:-mx-5 sm:-mt-5 sm:px-5',
      title: 'งานวันนี้',
      subtitle: 'ตารางงานวิ่ง',
      dateChipClass: 'border border-orange-200/80 bg-white/80 text-orange-700',
      dateChipLabel: 'วันนี้',
    };
  };

  // Handle edit toggle
  const handleEditClick = () => {
    setIsEditing(true);
  };

  // Handle edit input change
  const handleEditChange = (field: keyof JobEntry, value: string | number) => {
    if (editData) {
      setEditData({ ...editData, [field]: value });
    }
  };

  // Handle save edit
  const handleSaveEdit = () => {
    setShowConfirmEdit(true);
  };

  // Confirm save edit - use Firebase updateJob
  const confirmSaveEdit = async () => {
    setShowConfirmEdit(false);
    if (editData) {
      try {
        await firebaseUpdateJob(
          editData, 
          editOriginImageFiles.length > 0 ? editOriginImageFiles : undefined, 
          editDestinationImageFiles.length > 0 ? editDestinationImageFiles : undefined,
          editDocumentImageFiles.length > 0 ? editDocumentImageFiles : undefined
        );
        setIsDetailModalOpen(false);
        setShowSuccessModal(true);
        setTimeout(() => setShowSuccessModal(false), 1500);
        setEditOriginImageFiles([]);
        setEditDestinationImageFiles([]);
        setEditDocumentImageFiles([]);
      } catch (error) {
        console.error('Failed to update job:', error);
        const errorMessage =
          error instanceof Error && error.message
            ? error.message
            : 'เกิดข้อผิดพลาดในการแก้ไข';
        alert(`เกิดข้อผิดพลาดในการแก้ไข: ${errorMessage}`);
      }
    }
  };

  // Handle delete
  const handleDelete = () => {
    setShowConfirmDelete(true);
  };

  // Use Firebase deleteJob
  const confirmDelete = async () => {
    setShowConfirmDelete(false);
    if (selectedJob) {
      try {
        await firebaseDeleteJob(selectedJob);
        setIsDetailModalOpen(false);
      } catch (error) {
        console.error('Failed to delete job:', error);
        alert('เกิดข้อผิดพลาดในการลบ');
      }
    }
  };

  // Export CSV
  const exportCSV = () => {
    const formatNumericExportValue = (value: unknown): string | number => {
      if (value === null || value === undefined || value === '') return '';
      const numericValue = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(numericValue) ? numericValue : '';
    };

    const escapeCsvValue = (value: string | number | null | undefined): string => {
      const normalizedValue = String(value ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
      return `"${normalizedValue.replace(/"/g, '""')}"`;
    };

    const headers = ["Date", "Pickup", "Dropoff", "Rounds", "Product", "Vehicle", "Plate", "Driver", "Job No", "Inv No", "Fuel/Toll", "Remarks"];
    if (isAdmin) {
      headers.push("Customer Price", "Joint Price");
    }
    const rows = [...filteredJobs]
      .sort((a, b) => {
        const dateDiff = getDateSortValue(a.date) - getDateSortValue(b.date);
        if (dateDiff !== 0) return dateDiff;
        return (a.timestamp || 0) - (b.timestamp || 0);
      })
      .map(j => {
        const baseValues: Array<string | number | null | undefined> = [
          j.date?.split('T')[0] || j.date,
          j.pickupLocation,
          j.dropoffLocation,
          j.rounds,
          resolveProductName(j),
          j.vehicleType,
          j.licensePlate,
          j.driverName,
          j.jobNo,
          resolveInvoiceNo(j),
          formatNumericExportValue(j.fuelAndToll),
          j.remarks
        ];

        if (isAdmin) {
          baseValues.push(j.customerPrice, j.jointPrice);
        }

        return baseValues.map(escapeCsvValue).join(",");
      });

    const csvContent = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", downloadUrl);
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '_');
    link.setAttribute("download", `sfast_trucklog_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  // Draw bar chart on PDF (left half)
  const drawBarChart = (doc: jsPDF, data: { label: string; value: number }[], x: number, y: number, width: number, height: number, title: string): number => {
    const maxVal = Math.max(...data.map(d => d.value), 1);
    const barWidth = (width - 16) / data.length;
    const colors = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];
    const barsTopY = y + 10;
    const barsBottomY = y + height - 20;
    const barsHeight = Math.max(12, barsBottomY - barsTopY);
    const labelBaseY = y + height - 2;
    
    // Title
    doc.setFont('NotoSansThai');
    doc.setFontSize(14);
    doc.setTextColor(80, 80, 80);
    doc.text(title, x + width / 2, y, { align: 'center' });
    
    // Draw bars
    data.forEach((item, i) => {
      const barHeight = (item.value / maxVal) * barsHeight;
      const barX = x + 8 + i * barWidth;
      const barY = barsBottomY - barHeight;
      
      // Bar
      const color = colors[i % colors.length];
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      doc.setFillColor(r, g, b);
      doc.rect(barX + 1.5, barY, barWidth - 3, barHeight, 'F');
      
      // Value on top
      doc.setFont('NotoSansThai');
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.text(item.value.toString(), barX + barWidth / 2, barY - 2, { align: 'center' });
      
      // Label: first name + surname on next line, slightly tilted
      const nameParts = item.label.trim().split(/\s+/);
      const firstName = nameParts[0] || item.label;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
      const labelLines = lastName ? [firstName, lastName] : [firstName];
      doc.setFontSize(9);
      labelLines.forEach((line, lineIdx) => {
        doc.text(line, barX + barWidth / 2, labelBaseY + lineIdx * 3.8, { align: 'center', angle: 20 });
      });
    });

    return labelBaseY + 8;
  };

  // Draw pie chart on PDF
  const drawPieChart = (
    doc: jsPDF,
    data: { label: string; value: number }[],
    x: number,
    y: number,
    radius: number,
    title: string,
    legendStartY?: number
  ): number => {
    const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
    const colors = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#14b8a6', '#f97316'];
    
    // Title
    doc.setFont('NotoSansThai');
    doc.setFontSize(14);
    doc.setTextColor(80, 80, 80);
    doc.text(title, x, y - radius - 5, { align: 'center' });
    
    let startAngle = -Math.PI / 2;
    
    data.forEach((item, i) => {
      const sliceAngle = (item.value / total) * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;
      
      // Draw pie slice as polygon approximation
      const color = colors[i % colors.length];
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      doc.setFillColor(r, g, b);
      
      // Create slice path
      const steps = 20;
      const points: [number, number][] = [[x, y]];
      for (let j = 0; j <= steps; j++) {
        const angle = startAngle + (sliceAngle * j) / steps;
        points.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
      }
      
      // Draw as filled polygon
      if (points.length > 2) {
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.5);
        
        // Draw arc segments
        for (let j = 1; j < points.length - 1; j++) {
          doc.triangle(
            points[0][0], points[0][1],
            points[j][0], points[j][1],
            points[j + 1][0], points[j + 1][1],
            'F'
          );
        }
      }
      
      startAngle = endAngle;
    });
    
    // Legend (wrap only inside right half, centered in that area)
    const pageWidth = doc.internal.pageSize.getWidth();
    const legendMinX = pageWidth / 2 + 8;
    const legendMaxX = pageWidth - 15;
    const legendRegionWidth = legendMaxX - legendMinX;
    const legendLineHeight = 7;
    const legendGap = 3;
    const markerSize = 3.6; // close to text height
    let legendY = Math.max(y + radius + 10, legendStartY ?? 0);

    const legendItems = data.map((item, i) => {
      const pct = Math.round((item.value / total) * 100);
      const label = item.label.length > 14 ? item.label.substring(0, 14) + '..' : item.label;
      const text = `${label} (${pct}%)`;
      doc.setFont('NotoSansThai');
      doc.setFontSize(10);
      const width = markerSize + 2 + doc.getTextWidth(text) + legendGap;
      return { i, text, width };
    });

    const lines: typeof legendItems[] = [];
    let currentLine: typeof legendItems = [];
    let currentLineWidth = 0;
    legendItems.forEach((legendItem) => {
      if (currentLine.length > 0 && currentLineWidth + legendItem.width > legendRegionWidth) {
        lines.push(currentLine);
        currentLine = [legendItem];
        currentLineWidth = legendItem.width;
      } else {
        currentLine.push(legendItem);
        currentLineWidth += legendItem.width;
      }
    });
    if (currentLine.length > 0) lines.push(currentLine);

    lines.forEach((line) => {
      const lineWidth = line.reduce((sum, lineItem) => sum + lineItem.width, 0);
      let legendX = legendMinX + (legendRegionWidth - lineWidth) / 2;

      line.forEach(({ i, text, width }) => {
        const color = colors[i % colors.length];
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);

        doc.setFillColor(r, g, b);
        doc.rect(legendX, legendY - markerSize + 0.8, markerSize, markerSize, 'F');
        doc.setFont('NotoSansThai');
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        doc.text(text, legendX + markerSize + 2, legendY);
        legendX += width;
      });

      legendY += legendLineHeight;
    });

    return legendY + 1;
  };

  // Generate PDF Report
  const generatePDFReport = (forPrint: boolean = false) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pdfJobs = [...filteredJobs].sort((a, b) => a.date.localeCompare(b.date));
    
    // Register Thai font
    doc.addFileToVFS('NotoSansThai.ttf', NotoSansThaiBase64);
    doc.addFont('NotoSansThai.ttf', 'NotoSansThai', 'normal');
    doc.addFont('NotoSansThai.ttf', 'NotoSansThai', 'bold'); // Cheat: use normal font for bold requests
    doc.setFont('NotoSansThai');
    
    // Set document properties - helps with filename in new window
    const timestampTitle = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '_');
    doc.setProperties({
      title: `TruckLog_${timestampTitle}`,
      author: 'SFast Trucklog'
    });
    
    // Title
    doc.setFontSize(28);
    doc.setTextColor(124, 58, 237);
    doc.text('SFast Trucklog', pageWidth / 2, 20, { align: 'center' });
    
    // Thai subtitle
    doc.setFontSize(16);
    doc.setTextColor(60, 60, 60);
    doc.text('รายงานข้อมูลงานวิ่ง', pageWidth / 2, 30, { align: 'center' });
    
    // Filter description
    const filterParts: string[] = [];
    if (filters.driver) filterParts.push(`คนขับ: ${filters.driver}`);
    if (filters.licensePlate) filterParts.push(`ทะเบียน: ${filters.licensePlate}`);
    if (filters.vehicleType) filterParts.push(`ประเภท: ${filters.vehicleType}`);
    if (filters.month) {
      const monthName = MONTHS.find(m => m.value === filters.month)?.label || '';
      filterParts.push(`เดือน ${monthName}`);
    }
    if (filters.year) filterParts.push(`ปี ${filters.year}`);
    
    if (filterParts.length > 0) {
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text(filterParts.join(' | '), pageWidth / 2, 38, { align: 'center' });
    }
    
    // Date range
    if (pdfJobs.length > 0) {
      const dates = pdfJobs.map(j => new Date(j.date));
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      
      doc.setFontSize(11);
      doc.setTextColor(120, 120, 120);
      const dateRangeY = filterParts.length > 0 ? 46 : 38;
      doc.text(`ข้อมูลตั้งแต่ ${formatDate(minDate.toISOString())} ถึง ${formatDate(maxDate.toISOString())}`, pageWidth / 2, dateRangeY, { align: 'center' });
    }
    
    // Stats summary boxes
    const totalRounds = pdfJobs.reduce((acc, j) => acc + j.rounds, 0);
    const uniqueDrivers = new Set(pdfJobs.map(j => j.driverName)).size;
    const uniqueVehicles = new Set(pdfJobs.map(j => j.licensePlate)).size;
    
    const boxY = 48;
    const boxH = 18;
    const boxW = 40;
    const startX = 20;
    
    // Box 1 - Total Jobs
    doc.setFillColor(124, 58, 237);
    doc.roundedRect(startX, boxY, boxW, boxH, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(pdfJobs.length.toString(), startX + boxW/2, boxY + 8, { align: 'center' });
    doc.setFontSize(10);
    doc.text('จำนวนงาน', startX + boxW/2, boxY + 14, { align: 'center' });
    
    // Box 2 - Total Rounds
    doc.setFillColor(14, 165, 233);
    doc.roundedRect(startX + 45, boxY, boxW, boxH, 3, 3, 'F');
    doc.setFontSize(16);
    doc.text(totalRounds.toString(), startX + 45 + boxW/2, boxY + 8, { align: 'center' });
    doc.setFontSize(10);
    doc.text('จำนวนรอบ', startX + 45 + boxW/2, boxY + 14, { align: 'center' });
    
    // Box 3 - Drivers
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(startX + 90, boxY, boxW, boxH, 3, 3, 'F');
    doc.setFontSize(16);
    doc.text(uniqueDrivers.toString(), startX + 90 + boxW/2, boxY + 8, { align: 'center' });
    doc.setFontSize(10);
    doc.text('คนขับ', startX + 90 + boxW/2, boxY + 14, { align: 'center' });
    
    // Box 4 - Vehicles
    doc.setFillColor(245, 158, 11);
    doc.roundedRect(startX + 135, boxY, boxW, boxH, 3, 3, 'F');
    doc.setFontSize(16);
    doc.text(uniqueVehicles.toString(), startX + 135 + boxW/2, boxY + 8, { align: 'center' });
    doc.setFontSize(10);
    doc.text('รถ', startX + 135 + boxW/2, boxY + 14, { align: 'center' });
    
    // Charts section
    // Driver performance chart
    const driverData: { [key: string]: number } = {};
    pdfJobs.forEach(j => {
      driverData[j.driverName] = (driverData[j.driverName] || 0) + j.rounds;
    });
    const driverChartData = Object.entries(driverData)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    
    let barBottomY = 126;
    if (driverChartData.length > 0) {
      barBottomY = drawBarChart(doc, driverChartData, 15, 75, 85, 58, 'รอบตามคนขับ');
    }
    
    // Vehicle type chart
    const vehicleData: { [key: string]: number } = {};
    pdfJobs.forEach(j => {
      vehicleData[j.vehicleType] = (vehicleData[j.vehicleType] || 0) + 1;
    });
    const vehicleChartData = Object.entries(vehicleData)
      .map(([label, value]) => ({ label, value }));
    
    let pieLegendBottomY = 126;
    if (vehicleChartData.length > 0) {
      pieLegendBottomY = drawPieChart(doc, vehicleChartData, 155, 95, 16, 'ประเภทรถ', 126);
    }
    const chartsBottomY = Math.max(barBottomY, pieLegendBottomY);
    
    // Table - Thai headers
    const tableColumn = ['วันที่', 'เส้นทาง', 'รอบ', 'สินค้า', 'รถ/ทะเบียน', 'คนขับ', 'Job/Inv'];
    const tableRows = pdfJobs.map(job => [
      formatDate(job.date),
      `${job.pickupLocation} > ${job.dropoffLocation}`,
      job.rounds.toString(),
      resolveProductName(job),
      `${job.vehicleType}\n${job.licensePlate}`,
      job.driverName,
      `${job.jobNo || '-'}\n${resolveInvoiceNo(job) || '-'}`
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: Math.max(130, chartsBottomY + 4),
      styles: { fontSize: 9, cellPadding: 2, font: 'NotoSansThai' }, // Reduced font size to 9
      headStyles: { fillColor: [124, 58, 237], textColor: 255, font: 'NotoSansThai', halign: 'center' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 25 }, // Date - wider to prevent wrap
        1: { cellWidth: 'auto' }, // Route
        2: { cellWidth: 15, halign: 'center' }, // Round
        3: { cellWidth: 20, halign: 'center' }, // Product
        4: { cellWidth: 30, halign: 'center' }, // Vehicle - center
        5: { cellWidth: 28, halign: 'center' }, // Driver - center
        6: { cellWidth: 30, halign: 'center' }  // Job/Inv - center
      }
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('NotoSansThai');
      doc.setFontSize(10);
      doc.setTextColor(150, 150, 150);
      doc.text(`SFast Trucklog - สร้างเมื่อ ${new Date().toLocaleString('th-TH')} - หน้า ${i}/${pageCount}`, pageWidth / 2, 290, { align: 'center' });
    }

    if (forPrint) {
      // Auto print
      doc.autoPrint();
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      window.open(pdfUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
    } else {
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '_');
      doc.save(`TruckLog_${timestamp}.pdf`);
    }
  };

  // Detail Modal Content - Beautiful Card Design
  const renderDetailModal = () => {
    if (!selectedJob || !editData) return null;

    return (
      <div className="hide-scrollbar fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:items-center sm:py-6">
        <div className="modal-clay-backdrop absolute inset-0" onClick={() => setIsDetailModalOpen(false)} />
        
        <div className="modal-clay-panel hide-scrollbar relative w-full max-w-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl shadow-2xl animate-fade-in sm:max-h-[90dvh]">
          <div className="modal-clay-header rounded-t-3xl p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="modal-clay-soft rounded-xl p-3">
                  {isEditing ? <Edit2 size={24} className="text-[#5d8aa8]" /> : <Eye size={24} className="text-[#5d8aa8]" />}
                </div>
                <div className="min-w-0">
                  <h3 className="modal-clay-title text-xl">
                    {isEditing ? 'แก้ไขข้อมูล' : 'รายละเอียดงาน'}
                  </h3>
                  <p className="modal-clay-muted break-all text-sm">{selectedJob.jobNo || '-'}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsDetailModalOpen(false)} 
                className="driver-clay-icon-btn rounded-xl p-2 transition-colors"
              >
                <X size={20} className="modal-clay-muted" />
              </button>
            </div>
          </div>

          <div className="space-y-5 p-4 sm:p-6">
            {/* Route Section */}
            <div className="driver-clay-soft p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="driver-clay-soft inline-flex h-8 w-8 items-center justify-center rounded-lg">
                  <Truck size={15} className="driver-clay-muted" />
                </div>
                <span className="font-semibold text-slate-700">เส้นทาง</span>
              </div>
              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="driver-clay-muted text-xs">สถานที่รับ</label>
                    <select
                      value={editData.pickupLocation}
                      onChange={(e) => handleEditChange('pickupLocation', e.target.value)}
                      className="driver-clay-input mt-1 w-full px-3 py-2 text-sm"
                    >
                      <option value="">เลือกสถานที่</option>
                      {locationOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="driver-clay-muted text-xs">สถานที่ส่ง</label>
                    <select
                      value={editData.dropoffLocation}
                      onChange={(e) => handleEditChange('dropoffLocation', e.target.value)}
                      className="driver-clay-input mt-1 w-full px-3 py-2 text-sm"
                    >
                      <option value="">เลือกสถานที่</option>
                      {locationOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="driver-clay-soft flex-1 p-3">
                    <div className="driver-clay-muted text-xs">รับ</div>
                    <div className="break-words font-medium text-slate-700">{selectedJob.pickupLocation}</div>
                  </div>
                  <div className="driver-clay-muted self-center text-xl">→</div>
                  <div className="driver-clay-soft flex-1 p-3">
                    <div className="driver-clay-muted text-xs">ส่ง</div>
                    <div className="break-words font-medium text-slate-700">{selectedJob.dropoffLocation}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Ordered Fields */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className={modalFieldClass}>
                <div className={modalLabelClass}>วันที่</div>
                {isEditing ? (
                  <div className="relative" onClick={(e) => {
                    const input = e.currentTarget.querySelector('input');
                    if (input && 'showPicker' in input) (input as any).showPicker();
                  }}>
                    <input
                      type="date"
                      value={editData.date}
                      onChange={(e) => handleEditChange('date', e.target.value)}
                      className={`${modalInputClass} cursor-pointer dark:[color-scheme:dark]`}
                    />
                  </div>
                ) : (
                  <div className="font-medium text-slate-700">{formatDate(selectedJob.date)}</div>
                )}
              </div>

              <div className={modalFieldClass}>
                <div className={modalLabelClass}>เลขที่ใบสั่งงาน (Work Order)</div>
                {isEditing ? (
                  <input
                    value={editData.workOrderNo || ''}
                    onChange={(e) => handleEditChange('workOrderNo', e.target.value)}
                    className={modalInputClass}
                  />
                ) : (
                  <div className="break-words font-medium text-slate-700">
                    {selectedJob.workOrderNo || (selectedJob as JobEntry & { ticketNo?: string }).ticketNo || '-'}
                  </div>
                )}
              </div>

              <div className={modalFieldClass}>
                <div className={modalLabelClass}>ประเภทรถ</div>
                {isEditing ? (
                  <select
                    value={editData.vehicleType}
                    onChange={(e) => handleEditChange('vehicleType', e.target.value)}
                    className={modalInputClass}
                  >
                    <option value="">เลือกประเภทรถ</option>
                    {sortUniqueOptions(appData?.options.vehicleTypes || []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <div className="font-medium text-slate-700">{selectedJob.vehicleType}</div>
                )}
              </div>

              <div className={modalFieldClass}>
                <div className={modalLabelClass}>ทะเบียน</div>
                {isEditing ? (
                  <select
                    value={editData.licensePlate}
                    onChange={(e) => handleEditChange('licensePlate', e.target.value)}
                    className={modalInputClass}
                  >
                    <option value="">เลือกทะเบียน</option>
                    {sortUniqueOptions(appData?.options.licensePlates || []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <div className="font-medium text-slate-700">{selectedJob.licensePlate}</div>
                )}
              </div>

              <div className={modalFieldClass}>
                <div className={modalLabelClass}>คนขับ</div>
                {isEditing ? (
                  <select
                    value={editData.driverName}
                    onChange={(e) => handleEditChange('driverName', e.target.value)}
                    className={modalInputClass}
                  >
                    <option value="">เลือกคนขับ</option>
                    {editData.driverName && !appData?.options.drivers.some((opt) => opt === editData.driverName) && (
                      <option value={editData.driverName}>{editData.driverName}</option>
                    )}
                    {sortUniqueOptions(appData?.options.drivers || []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <div className="font-medium text-slate-700">{selectedJob.driverName}</div>
                )}
              </div>

              <div className={modalFieldClass}>
                <div className={modalLabelClass}>จำนวนรอบ</div>
                {isEditing ? (
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={editData.rounds}
                    onChange={(e) => handleEditChange('rounds', Number(e.target.value))}
                    className={modalInputClass}
                  />
                ) : (
                  <div className="font-medium text-slate-700">{selectedJob.rounds} รอบ</div>
                )}
              </div>

              <div className={modalFieldClass}>
                <div className={modalLabelClass}>ประเภทสินค้า</div>
                {isEditing ? (
                  <select
                    value={editData.productName || 'Inverter'}
                    onChange={(e) => handleEditChange('productName', e.target.value)}
                    className={modalInputClass}
                  >
                    <option value="Inverter">Inverter</option>
                    {sortUniqueOptions(appData?.options.productTypes || []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <div className="font-medium text-slate-700">{resolveProductName(selectedJob)}</div>
                )}
              </div>

              <div className={modalFieldClass}>
                <div className={modalLabelClass}>Job No.</div>
                {isEditing ? (
                  <input
                    value={editData.jobNo}
                    onChange={(e) => handleEditChange('jobNo', e.target.value)}
                    className={modalInputClass}
                  />
                ) : (
                  <div className="break-words font-medium text-slate-700">{selectedJob.jobNo || '-'}</div>
                )}
              </div>

              <div className={modalFieldClass}>
                <div className={modalLabelClass}>Invoice No.</div>
                {isEditing ? (
                  <input
                    value={editData.invNo}
                    onChange={(e) => handleEditChange('invNo', e.target.value)}
                    className={modalInputClass}
                  />
                ) : (
                  <div className="break-words font-medium text-slate-700">{resolveInvoiceNo(selectedJob) || '-'}</div>
                )}
              </div>

              <div className={modalFieldClass}>
                <div className={modalLabelClass}>เลขที่ใบขนส่ง (Transport Doc)</div>
                {isEditing ? (
                  <input
                    value={editData.transportDocNo || ''}
                    onChange={(e) => handleEditChange('transportDocNo', e.target.value)}
                    className={modalInputClass}
                  />
                ) : (
                  <div className="break-words font-medium text-slate-700">{selectedJob.transportDocNo || '-'}</div>
                )}
              </div>

              <div className={modalFieldClass}>
                <div className={modalLabelClass}>ค่าน้ำมัน/ทางด่วน</div>
                {isEditing ? (
                  <input
                    type="number"
                    value={editData.fuelAndToll ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      handleEditChange('fuelAndToll', value === '' ? '' : parseFloat(value));
                    }}
                    className={modalInputClass}
                    placeholder="0.00"
                  />
                ) : (
                  <div className="font-medium text-slate-700">
                    {selectedJob.fuelAndToll !== null && selectedJob.fuelAndToll !== undefined && selectedJob.fuelAndToll !== ''
                      ? Number(selectedJob.fuelAndToll).toLocaleString()
                      : '-'}
                  </div>
                )}
              </div>

              {isAdmin && (
                <div className={modalFieldClass}>
                  <div className={modalLabelClass}>ราคาเก็บลูกค้า</div>
                  {isEditing ? (
                    <input
                      type="number"
                      value={editData.customerPrice || ''}
                      onChange={(e) => handleEditChange('customerPrice', parseFloat(e.target.value))}
                      className={modalInputClass}
                      placeholder="0.00"
                    />
                  ) : (
                    <div className="font-medium text-slate-700">
                      {selectedJob.customerPrice?.toLocaleString() || '-'}
                    </div>
                  )}
                </div>
              )}

              {isAdmin && (
                <div className={modalFieldClass}>
                  <div className={modalLabelClass}>ราคาจ่ายรถร่วม</div>
                  {isEditing ? (
                    <input
                      type="number"
                      value={editData.jointPrice || ''}
                      onChange={(e) => handleEditChange('jointPrice', parseFloat(e.target.value))}
                      className={modalInputClass}
                      placeholder="0.00"
                    />
                  ) : (
                    <div className="font-medium text-slate-700">
                      {selectedJob.jointPrice?.toLocaleString() || '-'}
                    </div>
                  )}
                </div>
              )}

              <div className="driver-clay-soft p-3 sm:col-span-2 sm:p-4">
                <div className={modalLabelClass}>หมายเหตุ</div>
                {isEditing ? (
                  <textarea
                    value={editData.remarks}
                    onChange={(e) => handleEditChange('remarks', e.target.value)}
                    rows={2}
                    className={`${modalInputClass} resize-none`}
                  />
                ) : (
                  <div className="break-words font-medium text-slate-700">{selectedJob.remarks || '-'}</div>
                )}
              </div>
            </div>

            {/* Images */}
            <div className="space-y-4">

              {/* Origin Image Section (รูปภาพต้นทาง) */}
              <div className="driver-clay-soft p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ImageIcon size={16} className="driver-clay-muted" />
                  <span className="driver-clay-muted text-xs">รูปภาพต้นทาง</span>
                </div>
                
                {isEditing ? (
                  <div className="space-y-3">
                    {/* Existing Images */}
                    {editOriginImageUrls.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {editOriginImageUrls.map((url, index) => (
                           <div key={index} className="relative w-full h-32 rounded-lg overflow-hidden border border-white/70">
                            <img src={url} alt={`Origin ${index}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {/* New Images Preview */}
                    {editOriginImageFiles.length > 0 && (
                      <div>
                        <p className="driver-clay-muted mb-1 text-xs">รูปใหม่ที่จะเพิ่ม ({editOriginImageFiles.length}):</p>
                        <div className="grid grid-cols-2 gap-2">
                          {editOriginImageFiles.map((file, index) => (
                            <div key={index} className="relative w-full h-32 rounded-lg overflow-hidden border border-white/70">
                              <img src={URL.createObjectURL(file)} alt={`New Origin ${index}`} className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                         if (e.target.files) {
                           const files = Array.from(e.target.files);
                           setEditOriginImageFiles(files);
                         }
                      }}
                      className="driver-clay-input block w-full px-3 py-2 text-sm text-slate-600 file:mr-3 file:rounded-xl file:border file:border-white/80 file:bg-[#d9e6f2] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
                    />
                    <p className="driver-clay-muted text-xs">*การอัพโหลดรูปใหม่จะเพิ่มต่อจากรูปเดิม</p>
                  </div>
                ) : (
                  selectedOriginImageUrls.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedOriginImageUrls.map((url, index) => (
                        <div key={index} className="relative w-full h-32 cursor-pointer overflow-hidden rounded-xl border border-white/70" onClick={() => window.open(url, '_blank')}>
                          <img 
                            src={url} 
                            alt={`Origin ${index}`} 
                            className="h-full w-full object-cover hover:scale-105 transition-transform duration-300" 
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="driver-clay-muted py-4 text-center text-sm italic">ไม่มีรูปภาพต้นทาง</div>
                  )
                )}
              </div>

              {/* Destination Image Section (รูปภาพปลายทาง) */}
              <div className="driver-clay-soft p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ImageIcon size={16} className="driver-clay-muted" />
                  <span className="driver-clay-muted text-xs">รูปภาพปลายทาง</span>
                </div>
                
                {isEditing ? (
                  <div className="space-y-3">
                    {/* Existing Images */}
                    {editDestinationImageUrls.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {editDestinationImageUrls.map((url, index) => (
                           <div key={index} className="relative w-full h-32 rounded-lg overflow-hidden border border-white/70">
                            <img src={url} alt={`Destination ${index}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {/* New Images Preview */}
                    {editDestinationImageFiles.length > 0 && (
                      <div>
                        <p className="driver-clay-muted mb-1 text-xs">รูปใหม่ที่จะเพิ่ม ({editDestinationImageFiles.length}):</p>
                        <div className="grid grid-cols-2 gap-2">
                          {editDestinationImageFiles.map((file, index) => (
                            <div key={index} className="relative w-full h-32 rounded-lg overflow-hidden border border-white/70">
                              <img src={URL.createObjectURL(file)} alt={`New Destination ${index}`} className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                           const files = Array.from(e.target.files);
                           setEditDestinationImageFiles(files);
                         }
                      }}
                      className="driver-clay-input block w-full px-3 py-2 text-sm text-slate-600 file:mr-3 file:rounded-xl file:border file:border-white/80 file:bg-[#d9e6f2] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
                    />
                    <p className="driver-clay-muted text-xs">*การอัพโหลดรูปใหม่จะเพิ่มต่อจากรูปเดิม</p>
                  </div>
                ) : (
                  selectedDestinationImageUrls.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedDestinationImageUrls.map((url, index) => (
                        <div key={index} className="relative w-full h-32 cursor-pointer overflow-hidden rounded-xl border border-white/70" onClick={() => window.open(url, '_blank')}>
                          <img 
                            src={url} 
                            alt={`Destination ${index}`} 
                            className="h-full w-full object-cover hover:scale-105 transition-transform duration-300" 
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="driver-clay-muted py-4 text-center text-sm italic">ไม่มีรูปภาพปลายทาง</div>
                  )
                )}
              </div>

               {/* Document Image Section (รูปภาพเอกสาร) */}
              <div className="driver-clay-soft p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ImageIcon size={16} className="driver-clay-muted" />
                  <span className="driver-clay-muted text-xs">รูปภาพเอกสาร</span>
                </div>
                
                {isEditing ? (
                  <div className="space-y-3">
                    {/* Existing Images */}
                    {editDocumentImageUrls.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {editDocumentImageUrls.map((url, index) => (
                           <div key={index} className="relative w-full h-32 rounded-lg overflow-hidden border border-white/70">
                            <img src={url} alt={`Document ${index}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {/* New Images Preview */}
                    {editDocumentImageFiles.length > 0 && (
                      <div>
                        <p className="driver-clay-muted mb-1 text-xs">รูปใหม่ที่จะเพิ่ม ({editDocumentImageFiles.length}):</p>
                        <div className="grid grid-cols-2 gap-2">
                          {editDocumentImageFiles.map((file, index) => (
                            <div key={index} className="relative w-full h-32 rounded-lg overflow-hidden border border-white/70">
                              <img src={URL.createObjectURL(file)} alt={`New Document ${index}`} className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                           const files = Array.from(e.target.files);
                           setEditDocumentImageFiles(files);
                         }
                      }}
                      className="driver-clay-input block w-full px-3 py-2 text-sm text-slate-600 file:mr-3 file:rounded-xl file:border file:border-white/80 file:bg-[#d9e6f2] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
                    />
                    <p className="driver-clay-muted text-xs">*การอัพโหลดรูปใหม่จะเพิ่มต่อจากรูปเดิม</p>
                  </div>
                ) : (
                  selectedDocumentImageUrls.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedDocumentImageUrls.map((url, index) => (
                        <div key={index} className="relative w-full h-32 cursor-pointer overflow-hidden rounded-xl border border-white/70" onClick={() => window.open(url, '_blank')}>
                          <img 
                            src={url} 
                            alt={`Document ${index}`} 
                            className="h-full w-full object-cover hover:scale-105 transition-transform duration-300" 
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="driver-clay-muted py-4 text-center text-sm italic">ไม่มีรูปภาพเอกสาร</div>
                  )
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="driver-clay-btn driver-clay-btn-ghost flex-1"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="driver-clay-btn driver-clay-btn-success flex-1"
                  >
                    บันทึก
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleDelete}
                    className="driver-clay-btn flex-1 bg-[#ffd9de] text-rose-600"
                  >
                    ลบ
                  </button>
                  <button
                    onClick={handleEditClick}
                    className={pastelEditButtonClass}
                  >
                    แก้ไข
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAddJobModal = () => {
    if (!showAddJobModal) return null;

    return (
      <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:items-center sm:py-6">
        <div className="modal-clay-backdrop absolute inset-0" onClick={() => setShowAddJobModal(false)} />

        <div className="modal-clay-panel hide-scrollbar relative w-full max-w-5xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl shadow-2xl animate-fade-in sm:max-h-[90dvh]">
          <div className="modal-clay-header rounded-t-3xl p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="modal-clay-soft rounded-xl p-3">
                  <PlusCircle size={22} className="text-[#5d8aa8]" />
                </div>
                <div>
                  <h3 className="modal-clay-title text-xl">เพิ่มงานวิ่ง</h3>
                  <p className="modal-clay-muted text-sm">กรอกข้อมูลและบันทึกเข้าตารางงานวิ่ง</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddJobModal(false)}
                className="driver-clay-icon-btn rounded-xl p-2 transition-colors"
              >
                <X size={20} className="modal-clay-muted" />
              </button>
            </div>
          </div>

          <div className="p-3 sm:p-6">
            <EntryForm embedded />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#0f766e] via-[#0e7490] to-[#075985] px-5 py-4 text-white md:px-7 md:py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/80">Dispatch History</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight md:text-[2rem]">ข้อมูลงานวิ่ง</h2>
              <p className="mt-1 text-sm text-white/90">จัดการและค้นหาประวัติงานวิ่งทั้งหมด</p>
            </div>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/30 bg-white/15 shadow-[inset_1px_1px_0_rgba(255,255,255,0.35)]">
              <Truck className="h-7 w-7 text-white" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-4 md:p-6">
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 md:hidden">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`${pastelFilterButtonClass} justify-center text-xs`}
            >
              <Filter size={16} />
              ตัวกรอง
              {hasActiveFilters && (
                <span className="rounded-full bg-white/45 px-2 py-0.5 text-[11px] font-bold">
                  {[filters.month, filters.year, filters.driver, filters.vehicleType, filters.licensePlate].filter(Boolean).length}
                </span>
              )}
              <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={() => setShowAddJobModal(true)}
              className="driver-clay-btn justify-center border border-sky-200 bg-sky-100/90 text-xs text-sky-700 shadow-[inset_1px_1px_0_rgba(255,255,255,0.7)] hover:bg-sky-200/85"
            >
              <PlusCircle size={15} />
              เพิ่มงาน
            </button>
          </div>

          <div className="hidden md:block">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`${pastelFilterButtonClass} text-sm`}
            >
              <Filter size={16} />
              ตัวกรอง
              {hasActiveFilters && (
                <span className="rounded-full bg-white/45 px-2 py-0.5 text-[11px] font-bold">
                  {[filters.month, filters.year, filters.driver, filters.vehicleType, filters.licensePlate].filter(Boolean).length}
                </span>
              )}
              <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:w-auto md:flex-wrap">
            <button onClick={exportCSV} className="driver-clay-btn driver-clay-btn-ghost w-full justify-center text-xs md:w-auto md:text-sm">
              <Download size={15} />
              CSV
            </button>
            <button onClick={() => generatePDFReport(false)} className="driver-clay-btn driver-clay-btn-info driver-clay-btn-pdf w-full justify-center text-xs md:w-auto md:text-sm">
              <Download size={15} />
              PDF
            </button>
            <div className="hidden md:block">
              <button
                onClick={() => setShowAddJobModal(true)}
                className="driver-clay-btn w-full justify-center border border-sky-200 bg-sky-100/90 text-xs text-sky-700 shadow-[inset_1px_1px_0_rgba(255,255,255,0.7)] hover:bg-sky-200/85 md:w-auto md:text-sm"
              >
                <PlusCircle size={15} />
                เพิ่มงาน
              </button>
            </div>
          </div>
        </div>
      </section>

      {showFilters && (
        <section className={`${cardClass} p-4 md:p-6`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1.5">
              <span className="driver-clay-muted text-xs font-semibold">เดือน</span>
              <select
                value={filters.month || ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, month: e.target.value ? parseInt(e.target.value, 10) : null }))}
                className={selectClass}
              >
                <option value="">ทั้งหมด</option>
                {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="driver-clay-muted text-xs font-semibold">ปี</span>
              <select
                value={filters.year || ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, year: e.target.value ? parseInt(e.target.value, 10) : null }))}
                className={selectClass}
              >
                <option value="">ทั้งหมด</option>
                {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="driver-clay-muted text-xs font-semibold">คนขับ</span>
              <select
                value={filters.driver}
                onChange={(e) => setFilters((prev) => ({ ...prev, driver: e.target.value }))}
                className={selectClass}
              >
                <option value="">ทั้งหมด</option>
                {sortUniqueOptions(appData?.options.drivers || []).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="driver-clay-muted text-xs font-semibold">ประเภทรถ</span>
              <select
                value={filters.vehicleType}
                onChange={(e) => setFilters((prev) => ({ ...prev, vehicleType: e.target.value }))}
                className={selectClass}
              >
                <option value="">ทั้งหมด</option>
                {sortUniqueOptions(appData?.options.vehicleTypes || []).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="driver-clay-muted text-xs font-semibold">ป้ายทะเบียน</span>
              <select
                value={filters.licensePlate}
                onChange={(e) => setFilters((prev) => ({ ...prev, licensePlate: e.target.value }))}
                className={selectClass}
              >
                <option value="">ทั้งหมด</option>
                {sortUniqueOptions(appData?.options.licensePlates || []).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>

            {hasActiveFilters && (
              <div className="flex items-end sm:col-span-2 xl:col-span-1">
                <button onClick={clearFilters} className="driver-clay-btn driver-clay-btn-ghost w-full text-xs sm:text-sm">
                  <X size={15} />
                  ล้างตัวกรอง
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="space-y-3 md:hidden">
        {loading ? (
          <article className="driver-clay-card p-4 sm:p-5">
            <p className="driver-clay-muted text-sm">กำลังโหลดข้อมูล...</p>
          </article>
        ) : sortedJobs.length === 0 ? (
          <article className="driver-clay-card p-4 sm:p-5">
            <p className="driver-clay-muted text-sm">ไม่พบข้อมูล</p>
          </article>
        ) : (
          sortedJobs.map((job) => {
            const mobileTone = getMobileRunCardTone(job);

            return (
              <article
                key={job.id}
                role="button"
                tabIndex={0}
                onClick={() => handleRowClick(job)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleRowClick(job);
                  }
                }}
                className={`driver-clay-card w-full cursor-pointer overflow-hidden p-4 text-left transition hover:-translate-y-[1px] sm:p-5 ${mobileTone.cardClass}`}
              >
                <div className={mobileTone.headerClass}>
                  <span>{mobileTone.title}</span>
                  <span>{mobileTone.subtitle}</span>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-base font-black text-slate-700">
                      {formatDate(job.date)}
                    </p>
                    <p className="mt-1 break-words text-sm font-semibold text-slate-600">
                      {resolveProductName(job)}
                    </p>
                    <p className="driver-clay-muted mt-1 break-words text-xs">
                      เลขที่ใบแจ้งงาน: {resolveWorkOrderNo(job) || '-'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="driver-clay-chip whitespace-nowrap bg-slate-100/85 text-slate-700">
                      {job.rounds} รอบ
                    </span>
                    {mobileTone.dateChipLabel && (
                      <span className={`driver-clay-chip whitespace-nowrap ${mobileTone.dateChipClass}`}>
                        {mobileTone.dateChipLabel}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 text-[13px] text-slate-700 sm:mt-4 sm:space-y-2 sm:text-sm">
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
                  <DetailRow
                    icon={<Truck size={14} className="driver-clay-muted" />}
                    value={`รถ: ${job.vehicleType || '-'} | ทะเบียน: ${job.licensePlate || '-'}`}
                  />
                  <DetailRow
                    icon={<UserRound size={14} className="driver-clay-muted" />}
                    value={`คนขับ: ${job.driverName || '-'}`}
                  />
                  <DetailRow
                    icon={<Package2 size={14} className="driver-clay-muted" />}
                    value={`สินค้า: ${resolveProductName(job)}`}
                  />
                </div>

                <p className="driver-clay-muted mt-4 text-[11px] sm:mt-3 sm:text-xs">
                  แตะการ์ดเพื่อดูรายละเอียดและแก้ไขงาน
                </p>
              </article>
            );
          })
        )}
      </div>

      <section className={`${cardClass} hidden md:block`}>
        <div className="sticky top-0 z-30 bg-gradient-to-r from-[#0f766e] via-[#0e7490] to-[#075985] px-5 py-3 text-white md:px-6">
          <h3 className="text-lg font-black tracking-tight">ตารางงานวิ่งทั้งหมด</h3>
          <p className="mt-0.5 text-xs text-white/90">คลิกที่แถวเพื่อเปิดรายละเอียด/แก้ไข/ลบ</p>
        </div>
        <div>
          <table className="w-full table-fixed text-sm">
            <thead className={isDark ? 'bg-dark-bg/70 text-dark-muted' : 'bg-slate-100/80 text-slate-600'}>
              <tr>
                <th className={`sticky top-[74px] z-20 px-3 py-3 text-left font-semibold ${isDark ? 'bg-dark-bg/70' : 'bg-slate-100/95'} ${isAdmin ? 'w-[10%]' : 'w-[12%]'}`}>
                  <button
                    type="button"
                    onClick={toggleDateSortDirection}
                    className={`inline-flex items-center gap-1 rounded-lg px-1 py-0.5 transition focus:outline-none focus:ring-2 focus:ring-accent-primary/40 ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-200/70'}`}
                    aria-label={`เรียงตามวันที่ ${dateSortDirection === 'desc' ? 'ใหม่ไปเก่า' : 'เก่าไปใหม่'}`}
                    title={`เรียงตามวันที่ ${dateSortDirection === 'desc' ? 'ใหม่ไปเก่า' : 'เก่าไปใหม่'}`}
                  >
                    <span>วันที่</span>
                    {dateSortDirection === 'desc' ? <ChevronDown size={15} /> : dateSortDirection === 'asc' ? <ChevronUp size={15} /> : <ArrowUpDown size={15} />}
                  </button>
                </th>
                <th className={`sticky top-[74px] z-20 px-3 py-3 text-left font-semibold ${isDark ? 'bg-dark-bg/70' : 'bg-slate-100/95'} ${isAdmin ? 'w-[16%]' : 'w-[28%]'}`}>เส้นทาง</th>
                <th className={`sticky top-[74px] z-20 px-3 py-3 text-center font-semibold ${isDark ? 'bg-dark-bg/70' : 'bg-slate-100/95'} ${isAdmin ? 'w-[6%]' : 'w-[7%]'}`}>รอบ</th>
                <th className={`sticky top-[74px] z-20 px-3 py-3 text-left font-semibold ${isDark ? 'bg-dark-bg/70' : 'bg-slate-100/95'} ${isAdmin ? 'w-[10%]' : 'w-[11%]'}`}>สินค้า</th>
                <th className={`sticky top-[74px] z-20 px-3 py-3 text-left font-semibold ${isDark ? 'bg-dark-bg/70' : 'bg-slate-100/95'} ${isAdmin ? 'w-[13%]' : 'w-[14%]'}`}>รถ / ทะเบียน</th>
                <th className={`sticky top-[74px] z-20 px-3 py-3 text-left font-semibold ${isDark ? 'bg-dark-bg/70' : 'bg-slate-100/95'} ${isAdmin ? 'w-[11%]' : 'w-[12%]'}`}>คนขับ</th>
                <th className={`sticky top-[74px] z-20 px-3 py-3 text-left font-semibold ${isDark ? 'bg-dark-bg/70' : 'bg-slate-100/95'} ${isAdmin ? 'w-[11%]' : 'w-[12%]'}`}>Job / Inv</th>
                <th className={`sticky top-[74px] z-20 px-3 py-3 text-right font-semibold ${isDark ? 'bg-dark-bg/70' : 'bg-slate-100/95'} ${isAdmin ? 'w-[10%]' : 'w-[10%]'}`}>ค่าน้ำมัน/ทางด่วน</th>
                {isAdmin && (
                  <>
                    <th className={`sticky top-[74px] z-20 w-[10%] px-3 py-3 text-right font-semibold ${isDark ? 'bg-dark-bg/70' : 'bg-slate-100/95'}`}>ราคาลูกค้า</th>
                    <th className={`sticky top-[74px] z-20 w-[10%] px-3 py-3 text-right font-semibold ${isDark ? 'bg-dark-bg/70' : 'bg-slate-100/95'}`}>ราคารถร่วม</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className={isDark ? 'divide-y divide-dark-muted/15' : 'divide-y divide-light-muted/20'}>
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 10 : 8} className="px-3 py-10 text-center text-sm text-slate-500">
                    กำลังโหลดข้อมูล...
                  </td>
                </tr>
              ) : sortedJobs.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 10 : 8} className="px-3 py-10 text-center text-sm text-slate-500">
                    ไม่พบข้อมูล
                  </td>
                </tr>
              ) : (
                sortedJobs.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => handleRowClick(job)}
                    className={isDark ? 'cursor-pointer hover:bg-white/5' : 'cursor-pointer hover:bg-[#f1f5f9]'}
                  >
                    <td className="px-3 py-3 align-top text-sm font-medium text-slate-700">
                      {formatDate(job.date)}
                    </td>
                    <td className="px-3 py-3 align-top text-xs">
                      <p className="break-words whitespace-normal text-sm text-slate-700">{job.pickupLocation || '-'} → {job.dropoffLocation || '-'}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-center">
                      <span className="driver-clay-chip bg-slate-100/85 text-slate-700">{job.rounds}</span>
                    </td>
                    <td className="px-3 py-3 align-top text-sm text-slate-700">
                      {resolveProductName(job)}
                    </td>
                    <td className="px-3 py-3 align-top text-xs">
                      <p className="break-words whitespace-normal text-sm font-medium text-slate-700">{job.vehicleType || '-'}</p>
                      <p className={`break-words whitespace-normal ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>{job.licensePlate || '-'}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-sm text-slate-700 break-words whitespace-normal">
                      {job.driverName || '-'}
                    </td>
                    <td className="px-3 py-3 align-top text-xs">
                      <p className="break-words whitespace-normal text-sm font-medium text-slate-700">{job.jobNo || '-'}</p>
                      <p className={`break-words whitespace-normal ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>{resolveInvoiceNo(job) || '-'}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-right text-sm text-slate-700">
                      {formatGroupedNumber(job.fuelAndToll)}
                    </td>
                    {isAdmin && (
                      <>
                        <td className="px-3 py-3 align-top text-right text-sm text-slate-700">
                          {formatGroupedNumber(job.customerPrice)}
                        </td>
                        <td className="px-3 py-3 align-top text-right text-sm text-slate-700">
                          {formatGroupedNumber(job.jointPrice)}
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detail Modal */}
      {isDetailModalOpen && renderDetailModal()}
      {renderAddJobModal()}

      {/* Confirm Edit Modal */}
      <ConfirmModal
        isOpen={showConfirmEdit}
        onClose={() => setShowConfirmEdit(false)}
        onConfirm={confirmSaveEdit}
        title="ยืนยันการแก้ไข"
        message="คุณต้องการบันทึกการแก้ไขหรือไม่?"
        type="confirm"
        confirmText="บันทึก"
        cancelText="ยกเลิก"
      />

      {/* Success Modal */}
      <ConfirmModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        onConfirm={() => setShowSuccessModal(false)}
        title="บันทึกสำเร็จ!"
        message="ข้อมูลถูกแก้ไขเรียบร้อยแล้ว"
        type="success"
        showCancel={false}
        showConfirm={false}
      />

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={confirmDelete}
        title="ยืนยันการลบ"
        message="คุณต้องการลบรายการนี้หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้"
        type="warning"
        confirmText="ลบ"
        cancelText="ยกเลิก"
      />
    </div>
  );
};

export default DataTable;
