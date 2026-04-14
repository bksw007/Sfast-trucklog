import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Calendar,
  ClipboardList,
  Download,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  Pencil,
  Save,
  Settings as SettingsIcon,
  Table2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { NotoSansThaiBase64 } from '../fonts/NotoSansThai';
import {
  addAccountingEntry,
  deleteAccountingEntry,
  subscribeToAccountingEntries,
  updateAccountingEntry,
  uploadAccountingProofs,
} from '../services/firebaseService';
import { updateUserProfile } from '../services/userService';
import type {
  AccountingDocumentStatus,
  AccountingEntry,
  AccountingEntryType,
  AccountingPaymentMethod,
  UserProfile,
} from '../types';

type AccountingTab = 'income' | 'expense' | 'summary' | 'history' | 'profile';
type HistoryFilter = 'all' | 'income' | 'expense';

type EntryFormState = {
  id?: string;
  type: AccountingEntryType;
  transactionDate: string;
  amountInput: string;
  paymentMethod: AccountingPaymentMethod;
  description: string;
  category: string;
  counterpartyName: string;
  counterpartyTaxId: string;
  referenceNo: string;
  note: string;
  documentStatus: AccountingDocumentStatus;
  reasonNoReceipt: string;
};

type ProfileFormState = {
  fullName: string;
  citizenId: string;
  businessName: string;
  businessTaxId: string;
  businessBranchName: string;
  address: string;
  signatureName: string;
};

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

const SECONDARY_MENU = [
  { to: '/dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard },
  { to: '/entry', label: 'ฟอร์มบันทึกงาน', icon: FileText },
  { to: '/today', label: 'งานวันนี้', icon: ClipboardList },
  { to: '/data', label: 'ข้อมูลงานวิ่ง', icon: Table2 },
  { to: '/settings', label: 'ตั้งค่า', icon: SettingsIcon },
];

const INCOME_CATEGORIES = ['ค่าขนส่ง', 'รายรับลูกค้า', 'รับคืนเงิน', 'รายได้อื่นๆ'];
const EXPENSE_CATEGORIES = [
  'ค่าน้ำมัน',
  'ค่าทางด่วน',
  'ค่าแรง',
  'ค่าซ่อมบำรุง',
  'ค่าอะไหล่',
  'ค่าใช้จ่ายสำนักงาน',
  'ค่าใช้จ่ายหน้างาน',
  'ค่าใช้จ่ายอื่นๆ',
];

const PAYMENT_METHOD_LABEL: Record<AccountingPaymentMethod, string> = {
  cash: 'เงินสด',
  transfer: 'เงินโอน',
  card: 'บัตร',
  other: 'อื่นๆ',
};

const DOCUMENT_STATUS_LABEL: Record<AccountingDocumentStatus, string> = {
  receipt: 'มีใบเสร็จ/ใบกำกับ',
  replacement_receipt: 'ใบรับรองแทนใบเสร็จ',
  other_evidence: 'หลักฐานอื่น',
};

const getLocalDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split('T')[0];
};

const getCurrentMonthYear = () => {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

const formatCompactCurrency = (value: number) =>
  new Intl.NumberFormat('th-TH', {
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatThaiDate = (value: string) => {
  if (!value) return '-';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year + 543}`;
};

const getMonthName = (month: number) => MONTHS.find((item) => item.value === month)?.label || '';

const parseAmount = (raw: string) => {
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : 0;
};

const createEmptyEntryForm = (type: AccountingEntryType): EntryFormState => ({
  type,
  transactionDate: getLocalDate(),
  amountInput: '',
  paymentMethod: type === 'income' ? 'transfer' : 'cash',
  description: '',
  category: '',
  counterpartyName: '',
  counterpartyTaxId: '',
  referenceNo: '',
  note: '',
  documentStatus: 'receipt',
  reasonNoReceipt: '',
});

const createProfileForm = (profile: UserProfile | null): ProfileFormState => ({
  fullName: profile?.fullName || profile?.displayName || '',
  citizenId: profile?.citizenId || '',
  businessName: profile?.businessName || '',
  businessTaxId: profile?.businessTaxId || '',
  businessBranchName: profile?.businessBranchName || 'สำนักงานใหญ่',
  address: profile?.address || '',
  signatureName: profile?.signatureName || profile?.fullName || profile?.displayName || '',
});

const getDisplayName = (profile: ProfileFormState | UserProfile | null) =>
  profile && 'displayName' in profile ? profile.displayName?.trim() || '' : '';

const resolveTaxPayerName = (profile: ProfileFormState | UserProfile | null) =>
  profile?.businessName?.trim() ||
  profile?.fullName?.trim() ||
  getDisplayName(profile) ||
  '-';

const resolveTaxId = (profile: ProfileFormState | UserProfile | null) =>
  profile?.businessTaxId?.trim() || profile?.citizenId?.trim() || '-';

const resolveSignatureName = (profile: ProfileFormState | UserProfile | null) =>
  profile?.signatureName?.trim() ||
  profile?.fullName?.trim() ||
  getDisplayName(profile) ||
  '-';

const createReferenceNo = (
  entries: AccountingEntry[],
  transactionDate: string,
  type: AccountingEntryType,
): string => {
  const prefix = type === 'income' ? 'RV' : 'PV';
  const monthKey = transactionDate.slice(0, 7).replace('-', '');
  const sequence = entries
    .filter((entry) => entry.type === type && entry.transactionDate.startsWith(transactionDate.slice(0, 7)))
    .map((entry) => {
      const match = (entry.referenceNo || '').match(/(\d{3,})$/);
      return match ? Number(match[1]) : 0;
    })
    .reduce((max, value) => Math.max(max, value), 0) + 1;

  return `${prefix}-${monthKey}-${String(sequence).padStart(3, '0')}`;
};

const ensurePdfFont = (doc: jsPDF) => {
  doc.addFileToVFS('NotoSansThai.ttf', NotoSansThaiBase64);
  doc.addFont('NotoSansThai.ttf', 'NotoSansThai', 'normal');
  doc.setFont('NotoSansThai');
};

const thaiNumberWords = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const thaiPositionWords = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

const convertThaiInteger = (raw: string): string => {
  const normalized = raw.replace(/^0+/, '') || '0';
  if (normalized === '0') return thaiNumberWords[0];
  if (normalized.length > 6) {
    const millionsIndex = normalized.length - 6;
    return `${convertThaiInteger(normalized.slice(0, millionsIndex))}ล้าน${convertThaiInteger(normalized.slice(millionsIndex))}`;
  }

  return normalized
    .split('')
    .map((digitRaw, index, list) => {
      const digit = Number(digitRaw);
      if (digit === 0) return '';

      const position = list.length - index - 1;
      if (position === 0 && digit === 1 && list.length > 1) {
        return 'เอ็ด';
      }
      if (position === 1 && digit === 1) {
        return 'สิบ';
      }
      if (position === 1 && digit === 2) {
        return `ยี่${thaiPositionWords[position]}`;
      }

      return `${thaiNumberWords[digit]}${thaiPositionWords[position]}`;
    })
    .join('');
};

const numberToThaiBaht = (value: number) => {
  const safe = Number.isFinite(value) ? Math.abs(value) : 0;
  const [bahtPart, satangPart] = safe.toFixed(2).split('.');
  const bahtText = convertThaiInteger(bahtPart);
  const satangValue = Number(satangPart);
  if (satangValue === 0) {
    return `${bahtText}บาทถ้วน`;
  }
  return `${bahtText}บาท${convertThaiInteger(satangPart)}สตางค์`;
};

const getDocumentHint = (status: AccountingDocumentStatus) => {
  if (status === 'replacement_receipt') {
    return 'ไม่มีใบเสร็จ ให้ระบุเหตุผลและเก็บหลักฐานประกอบ';
  }
  if (status === 'other_evidence') {
    return 'ใช้สลิปหรือเอกสารอื่น ควรแนบคำอธิบายสั้นๆ';
  }
  return 'มีใบเสร็จหรือใบกำกับภาษีแล้ว';
};

const validateProfileForTaxPdf = (profile: ProfileFormState | UserProfile | null): string[] => {
  const missing: string[] = [];
  if (!resolveTaxPayerName(profile) || resolveTaxPayerName(profile) === '-') {
    missing.push('ชื่อผู้ประกอบการ/ชื่อผู้เสียภาษี');
  }
  if (!resolveTaxId(profile) || resolveTaxId(profile) === '-') {
    missing.push('เลขผู้เสียภาษีหรือเลขบัตรประชาชน');
  }
  if (!resolveSignatureName(profile) || resolveSignatureName(profile) === '-') {
    missing.push('ชื่อผู้ลงนาม');
  }
  return missing;
};

const exportLedgerPdf = (
  entries: AccountingEntry[],
  profile: ProfileFormState | UserProfile | null,
  month: number,
  year: number,
) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  ensurePdfFont(doc);

  const totalIncome = entries
    .filter((entry) => entry.type === 'income')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const totalExpense = entries
    .filter((entry) => entry.type === 'expense')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const businessYear = year + 543;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(18);
  doc.text('สมุดบัญชีรายรับ - รายจ่าย', pageWidth / 2, 16, { align: 'center' });
  doc.setFontSize(11);
  doc.text(`ชื่อผู้ประกอบการ: ${resolveTaxPayerName(profile)}`, 14, 26);
  doc.text(`เลขผู้เสียภาษี/เลขบัตรประชาชน: ${resolveTaxId(profile)}`, 14, 32);
  doc.text(`สาขา: ${profile?.businessBranchName?.trim() || 'สำนักงานใหญ่'}`, 14, 38);
  doc.text(`ที่อยู่: ${profile?.address?.trim() || '-'}`, 14, 44);
  doc.text(`ประจำเดือน ${getMonthName(month)} ${businessYear}`, 14, 50);
  doc.text(`พิมพ์เมื่อ ${formatThaiDate(getLocalDate())}`, pageWidth - 14, 50, { align: 'right' });

  autoTable(doc, {
    startY: 56,
    margin: { left: 10, right: 10 },
    styles: {
      font: 'NotoSansThai',
      fontSize: 8,
      cellPadding: 1.8,
      lineColor: [191, 199, 213],
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [26, 123, 86],
      textColor: 255,
      fontStyle: 'normal',
    },
    bodyStyles: {
      textColor: [31, 41, 55],
    },
    head: [[
      'วัน/เดือน/ปี',
      'เลขที่อ้างอิง',
      'รายการ',
      'คู่ค้า/ร้านค้า',
      'หลักฐาน',
      'รายรับ',
      'รายจ่าย',
    ]],
    body: entries.map((entry) => [
      formatThaiDate(entry.transactionDate),
      entry.referenceNo || '-',
      `${entry.description}${entry.category ? ` (${entry.category})` : ''}`,
      entry.counterpartyName || '-',
      DOCUMENT_STATUS_LABEL[entry.documentStatus],
      entry.type === 'income' ? formatCurrency(entry.amount) : '',
      entry.type === 'expense' ? formatCurrency(entry.amount) : '',
    ]),
    foot: [[
      '',
      '',
      'รวมทั้งเดือน',
      '',
      '',
      formatCurrency(totalIncome),
      formatCurrency(totalExpense),
    ]],
    footStyles: {
      fillColor: [236, 253, 245],
      textColor: [6, 78, 59],
      fontStyle: 'normal',
    },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 24 },
      2: { cellWidth: 58 },
      3: { cellWidth: 28 },
      4: { cellWidth: 22 },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 18, halign: 'right' },
    },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 80;
  doc.setFontSize(11);
  doc.text(`สรุปรายรับ ${formatCurrency(totalIncome)} บาท`, 14, finalY + 10);
  doc.text(`สรุปรายจ่าย ${formatCurrency(totalExpense)} บาท`, 14, finalY + 16);
  doc.text(`คงเหลือสุทธิ ${formatCurrency(totalIncome - totalExpense)} บาท`, 14, finalY + 22);
  doc.setFontSize(9);
  doc.text(
    'หมายเหตุ: รายการที่ไม่มีใบเสร็จควรจัดเก็บเลขอ้างอิงเรียงตามเดือน พร้อมแนบใบรับรองแทนใบเสร็จหรือหลักฐานประกอบอื่น',
    14,
    finalY + 30,
  );

  doc.save(`accounting-ledger-${year}-${String(month).padStart(2, '0')}.pdf`);
};

const exportReplacementReceiptPdf = (
  entry: AccountingEntry,
  profile: ProfileFormState | UserProfile | null,
) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  ensurePdfFont(doc);

  doc.setFontSize(17);
  doc.text('ใบรับรองแทนใบเสร็จรับเงิน', 105, 18, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`เลขที่อ้างอิง ${entry.referenceNo || '-'}`, 195, 26, { align: 'right' });
  doc.text(`ชื่อผู้ประกอบการ: ${resolveTaxPayerName(profile)}`, 14, 32);
  doc.text(`เลขผู้เสียภาษี/เลขบัตรประชาชน: ${resolveTaxId(profile)}`, 14, 38);
  doc.text(`สาขา: ${profile?.businessBranchName?.trim() || 'สำนักงานใหญ่'}`, 14, 44);
  doc.text(`ที่อยู่: ${profile?.address?.trim() || '-'}`, 14, 50);
  doc.text('ขอรับรองว่าได้จ่ายเงินตามรายการต่อไปนี้จริง และไม่สามารถเรียกใบเสร็จรับเงินจากผู้รับเงินได้', 14, 60);

  autoTable(doc, {
    startY: 66,
    margin: { left: 10, right: 10 },
    styles: {
      font: 'NotoSansThai',
      fontSize: 9,
      cellPadding: 2,
      lineColor: [191, 199, 213],
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [26, 123, 86],
      textColor: 255,
      fontStyle: 'normal',
    },
    head: [[
      'วัน/เดือน/ปี',
      'รายละเอียดรายจ่าย',
      'ผู้รับเงิน/ร้านค้า',
      'จำนวนเงิน (บาท)',
    ]],
    body: [[
      formatThaiDate(entry.transactionDate),
      `${entry.description}${entry.category ? ` (${entry.category})` : ''}`,
      entry.counterpartyName || '-',
      formatCurrency(entry.amount),
    ]],
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 82 },
      2: { cellWidth: 42 },
      3: { cellWidth: 32, halign: 'right' },
    },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 90;
  doc.setFontSize(10);
  const reasonLines = doc.splitTextToSize(
    `เหตุผลที่ไม่สามารถเรียกใบเสร็จรับเงิน: ${entry.reasonNoReceipt?.trim() || '-'}`,
    182,
  );
  doc.text(reasonLines, 14, finalY + 10);
  doc.text(`จำนวนเงินตัวอักษร: ${numberToThaiBaht(entry.amount)}`, 14, finalY + 22);
  doc.text(
    'เอกสารฉบับนี้ใช้ประกอบรายจ่ายกรณีไม่มีใบเสร็จรับเงิน และควรแนบสลิปโอน/รูปถ่าย/หลักฐานอื่นของรายการเดียวกันไว้ด้วย',
    14,
    finalY + 30,
  );

  doc.text('ลงชื่อ .......................................................... ผู้รับรองรายการ', 118, 245, { align: 'center' });
  doc.text(`(${resolveSignatureName(profile)})`, 118, 253, { align: 'center' });
  doc.text(`วันที่ ${formatThaiDate(getLocalDate())}`, 118, 261, { align: 'center' });

  doc.save(`replacement-receipt-${entry.referenceNo || entry.id}.pdf`);
};

const AdminAccounting: React.FC = () => {
  const { user, userProfile, refreshProfile } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as AccountingTab | null;
  const activeTab: AccountingTab = requestedTab && ['income', 'expense', 'summary', 'history', 'profile'].includes(requestedTab)
    ? requestedTab
    : 'income';
  const [{ month: currentMonth, year: currentYear }] = useState(getCurrentMonthYear());
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [entryForm, setEntryForm] = useState<EntryFormState>(createEmptyEntryForm(activeTab === 'expense' ? 'expense' : 'income'));
  const [profileForm, setProfileForm] = useState<ProfileFormState>(() => createProfileForm(userProfile));
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [existingProofUrls, setExistingProofUrls] = useState<string[]>([]);
  const [savingEntry, setSavingEntry] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeToAccountingEntries(
      (rows) => {
        setEntries(rows);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setProfileForm(createProfileForm(userProfile));
  }, [userProfile]);

  useEffect(() => {
    if (activeTab !== 'income' && activeTab !== 'expense') {
      return;
    }

    setEntryForm((prev) => {
      if (prev.id) return prev;
      if (prev.type === activeTab) return prev;
      return {
        ...createEmptyEntryForm(activeTab),
        transactionDate: prev.transactionDate || getLocalDate(),
      };
    });
  }, [activeTab]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const years = useMemo(() => {
    const base = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, index) => base - index);
  }, []);

  const monthEntries = useMemo(() => {
    return entries
      .filter((entry) => {
        const [entryYear, entryMonth] = entry.transactionDate.split('-').map(Number);
        return entryYear === year && entryMonth === month;
      })
      .sort((a, b) => {
        const dateCompare = b.transactionDate.localeCompare(a.transactionDate);
        if (dateCompare !== 0) return dateCompare;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
  }, [entries, month, year]);

  const historyEntries = useMemo(() => {
    if (historyFilter === 'all') return monthEntries;
    return monthEntries.filter((entry) => entry.type === historyFilter);
  }, [historyFilter, monthEntries]);

  const totals = useMemo(() => {
    const income = monthEntries
      .filter((entry) => entry.type === 'income')
      .reduce((sum, entry) => sum + entry.amount, 0);
    const expense = monthEntries
      .filter((entry) => entry.type === 'expense')
      .reduce((sum, entry) => sum + entry.amount, 0);
    return {
      income,
      expense,
      net: income - expense,
      count: monthEntries.length,
    };
  }, [monthEntries]);

  const yearlyIncome = useMemo(() => {
    return entries
      .filter((entry) => entry.type === 'income' && entry.transactionDate.startsWith(`${year}-`))
      .reduce((sum, entry) => sum + entry.amount, 0);
  }, [entries, year]);

  const vatThreshold = 1_800_000;
  const vatProgress = Math.min((yearlyIncome / vatThreshold) * 100, 100);

  const expenseReplacementCandidates = useMemo(() => {
    return monthEntries.filter((entry) => entry.type === 'expense');
  }, [monthEntries]);

  const applyTab = (nextTab: AccountingTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    setSearchParams(next, { replace: true });
  };

  const clearEntryForm = (type: AccountingEntryType = activeTab === 'expense' ? 'expense' : 'income') => {
    setEntryForm(createEmptyEntryForm(type));
    setExistingProofUrls([]);
    setProofFiles([]);
  };

  const showNotice = (message: string) => {
    setNotice(message);
  };

  const ensureProfileReady = () => {
    const missing = validateProfileForTaxPdf(profileForm);
    if (missing.length === 0) return true;
    applyTab('profile');
    alert(`กรุณากรอกข้อมูลให้ครบก่อน export PDF: ${missing.join(', ')}`);
    return false;
  };

  const handleAmountChange = (value: string) => {
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setEntryForm((prev) => ({ ...prev, amountInput: value }));
    }
  };

  const handleKeypad = (key: string) => {
    if (key === 'C') {
      setEntryForm((prev) => ({ ...prev, amountInput: '' }));
      return;
    }
    if (key === 'Del') {
      setEntryForm((prev) => ({ ...prev, amountInput: prev.amountInput.slice(0, -1) }));
      return;
    }
    setEntryForm((prev) => {
      if (key === '.' && prev.amountInput.includes('.')) return prev;
      const nextValue = `${prev.amountInput}${key}`;
      if (!/^\d*\.?\d{0,2}$/.test(nextValue)) return prev;
      return { ...prev, amountInput: nextValue };
    });
  };

  const handleSaveEntry = async () => {
    if (!user?.uid) {
      alert('ไม่พบผู้ใช้งานที่ล็อกอิน');
      return;
    }

    const amount = parseAmount(entryForm.amountInput);
    if (amount <= 0) {
      alert('กรุณาระบุจำนวนเงินให้มากกว่า 0');
      return;
    }
    if (!entryForm.description.trim()) {
      alert('กรุณาระบุรายละเอียดรายการ');
      return;
    }
    if (entryForm.documentStatus === 'replacement_receipt' && !entryForm.reasonNoReceipt.trim()) {
      alert('กรุณาระบุเหตุผลที่ไม่มีใบเสร็จ');
      return;
    }

    const payload = {
      transactionDate: entryForm.transactionDate,
      type: entryForm.type,
      amount,
      paymentMethod: entryForm.paymentMethod,
      description: entryForm.description.trim(),
      category: entryForm.category.trim(),
      counterpartyName: entryForm.counterpartyName.trim(),
      counterpartyTaxId: entryForm.counterpartyTaxId.trim(),
      referenceNo: entryForm.referenceNo.trim() || createReferenceNo(entries, entryForm.transactionDate, entryForm.type),
      note: entryForm.note.trim(),
      documentStatus: entryForm.documentStatus,
      reasonNoReceipt: entryForm.documentStatus === 'replacement_receipt' ? entryForm.reasonNoReceipt.trim() : '',
      proofUrls: existingProofUrls,
      createdByUid: user.uid,
      createdByName: userProfile?.fullName || userProfile?.displayName || user.email || 'admin',
    } satisfies Omit<AccountingEntry, 'id' | 'timestamp'>;

    setSavingEntry(true);
    try {
      if (entryForm.id) {
        let mergedProofUrls = existingProofUrls;
        if (proofFiles.length > 0) {
          const newProofUrls = await uploadAccountingProofs(proofFiles, entryForm.id);
          mergedProofUrls = [...existingProofUrls, ...newProofUrls];
        }
        await updateAccountingEntry(entryForm.id, {
          ...payload,
          proofUrls: mergedProofUrls,
        });
        showNotice('อัปเดตรายการแล้ว');
      } else {
        await addAccountingEntry(payload, proofFiles);
        showNotice('บันทึกรายการแล้ว');
      }
      clearEntryForm(payload.type);
      applyTab('history');
    } catch (error) {
      console.error('Failed to save accounting entry:', error);
      alert('บันทึกรายการไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setSavingEntry(false);
    }
  };

  const handleEditEntry = (entry: AccountingEntry) => {
    const [entryYear, entryMonth] = entry.transactionDate.split('-').map(Number);
    if (entryYear && entryMonth) {
      setYear(entryYear);
      setMonth(entryMonth);
    }
    setEntryForm({
      id: entry.id,
      type: entry.type,
      transactionDate: entry.transactionDate,
      amountInput: String(entry.amount),
      paymentMethod: entry.paymentMethod,
      description: entry.description,
      category: entry.category || '',
      counterpartyName: entry.counterpartyName || '',
      counterpartyTaxId: entry.counterpartyTaxId || '',
      referenceNo: entry.referenceNo || '',
      note: entry.note || '',
      documentStatus: entry.documentStatus,
      reasonNoReceipt: entry.reasonNoReceipt || '',
    });
    setExistingProofUrls(Array.isArray(entry.proofUrls) ? entry.proofUrls : []);
    setProofFiles([]);
    applyTab(entry.type);
  };

  const handleDeleteEntry = async (entry: AccountingEntry) => {
    if (!window.confirm(`ต้องการลบรายการ ${entry.description} ใช่ไหม?`)) return;
    try {
      await deleteAccountingEntry(entry);
      showNotice('ลบรายการแล้ว');
    } catch (error) {
      console.error('Failed to delete accounting entry:', error);
      alert('ลบรายการไม่สำเร็จ');
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.uid) {
      alert('ไม่พบผู้ใช้งานที่ล็อกอิน');
      return;
    }

    setSavingProfile(true);
    try {
      await updateUserProfile(user.uid, {
        fullName: profileForm.fullName.trim(),
        citizenId: profileForm.citizenId.trim(),
        businessName: profileForm.businessName.trim(),
        businessTaxId: profileForm.businessTaxId.trim(),
        businessBranchName: profileForm.businessBranchName.trim(),
        address: profileForm.address.trim(),
        signatureName: profileForm.signatureName.trim(),
        profileUpdatedAt: Date.now(),
      });
      await refreshProfile();
      showNotice('บันทึกข้อมูลผู้เสียภาษีแล้ว');
    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSavingProfile(false);
    }
  };

  const surfaceClass = isDark
    ? 'rounded-3xl border border-white/10 bg-[#151c2c] text-[#edf2ff]'
    : 'rounded-3xl border border-[#dce7de] bg-white text-slate-900';

  const subSurfaceClass = isDark
    ? 'rounded-2xl border border-white/8 bg-[#0f1524]'
    : 'rounded-2xl border border-[#e8efe8] bg-[#f8fbf7]';

  const mutedTextClass = isDark ? 'text-[#9fb0d4]' : 'text-slate-500';
  const inputClass = isDark
    ? 'w-full rounded-2xl border border-white/10 bg-[#0d1422] px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400'
    : 'w-full rounded-2xl border border-[#d5e4d7] bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500';
  const tabButtonClass = (selected: boolean) =>
    selected
      ? 'rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white'
      : isDark
        ? 'rounded-2xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-[#dbe5ff]'
        : 'rounded-2xl bg-[#edf5ee] px-4 py-2.5 text-sm font-semibold text-slate-700';
  const segmentButtonClass = (selected: boolean, variant: 'income' | 'expense') =>
    selected
      ? variant === 'income'
        ? 'rounded-2xl border border-emerald-500 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-600'
        : 'rounded-2xl border border-rose-500 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-600'
      : isDark
        ? 'rounded-2xl border border-white/10 bg-transparent px-4 py-2.5 text-sm font-semibold text-[#dbe5ff]'
        : 'rounded-2xl border border-[#d5e4d7] bg-white px-4 py-2.5 text-sm font-semibold text-slate-600';
  const actionButtonClass = isDark
    ? 'inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-center text-sm font-semibold leading-tight text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60'
    : 'inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold leading-tight text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60';
  const ghostButtonClass = isDark
    ? 'inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-transparent px-4 py-3 text-center text-sm font-semibold leading-tight text-[#e4ecff]'
    : 'inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-[#d5e4d7] bg-white px-4 py-3 text-center text-sm font-semibold leading-tight text-slate-700';
  const secondaryMenuGridClass = 'grid grid-cols-2 gap-2 xl:flex';
  const secondaryMenuButtonClass = `${ghostButtonClass} w-full justify-start px-3 text-left`;
  const tabGridClass = 'grid grid-cols-2 gap-2 md:grid-cols-3 xl:flex';
  const tabChipClass = (selected: boolean) => `${tabButtonClass(selected)} min-h-[3rem] w-full justify-center px-3`;
  const keypadButtonClass = isDark
    ? 'aspect-square w-full rounded-2xl border border-white/10 bg-[#10192a] text-2xl font-black text-white transition hover:bg-white/10'
    : 'aspect-square w-full rounded-2xl border border-[#dfe9e1] bg-white text-2xl font-black text-slate-800 transition hover:bg-[#edf5ee]';
  const attachmentChipClass = `${ghostButtonClass} max-w-full justify-start px-3`;

  return (
    <div className="space-y-5">
      <section className={`${surfaceClass} overflow-hidden`}>
        <div className="flex flex-col gap-5 px-5 py-6 md:px-8 md:py-7">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className={`text-sm font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>เมนูหลัก</p>
              <h1 className="text-3xl font-black tracking-tight md:text-4xl">บันทึกรายรับ-รายจ่าย</h1>
              <p className={`max-w-3xl text-sm leading-6 ${mutedTextClass}`}>
                บันทึกรายการรายวัน เก็บเลขอ้างอิงเอกสารเป็นรายเดือน และสร้าง PDF สำหรับสมุดบัญชีรายรับ-รายจ่ายหรือใบรับรองแทนใบเสร็จรับเงินได้จากหน้าจอนี้
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className={subSurfaceClass}>
                <div className="px-4 py-4">
                  <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${mutedTextClass}`}>รายรับเดือนนี้</p>
                  <p className="mt-2 text-3xl font-black text-emerald-600">{formatCompactCurrency(totals.income)}</p>
                </div>
              </div>
              <div className={subSurfaceClass}>
                <div className="px-4 py-4">
                  <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${mutedTextClass}`}>รายจ่ายเดือนนี้</p>
                  <p className="mt-2 text-3xl font-black text-rose-600">{formatCompactCurrency(totals.expense)}</p>
                </div>
              </div>
              <div className={subSurfaceClass}>
                <div className="px-4 py-4">
                  <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${mutedTextClass}`}>คงเหลือสุทธิ</p>
                  <p className={`mt-2 text-3xl font-black ${totals.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {totals.net >= 0 ? '' : '-'}{formatCompactCurrency(Math.abs(totals.net))}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className={`text-sm font-semibold ${mutedTextClass}`}>เมนูรอง</p>
              {notice ? <p className="text-sm font-semibold text-emerald-600">{notice}</p> : null}
            </div>
            <div className={secondaryMenuGridClass}>
              {SECONDARY_MENU.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={secondaryMenuButtonClass}
                  >
                    <Icon size={16} />
                    <span className="min-w-0 break-words">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className={`${surfaceClass} px-5 py-5 md:px-8 md:py-6`}>
        <div className={tabGridClass}>
          <button type="button" onClick={() => applyTab('income')} className={tabChipClass(activeTab === 'income')}>
            บันทึกรับ
          </button>
          <button type="button" onClick={() => applyTab('expense')} className={tabChipClass(activeTab === 'expense')}>
            บันทึกจ่าย
          </button>
          <button type="button" onClick={() => applyTab('summary')} className={tabChipClass(activeTab === 'summary')}>
            ภาพรวม
          </button>
          <button type="button" onClick={() => applyTab('history')} className={tabChipClass(activeTab === 'history')}>
            ประวัติ
          </button>
          <button type="button" onClick={() => applyTab('profile')} className={tabChipClass(activeTab === 'profile')}>
            ข้อมูลผู้เสียภาษี
          </button>
        </div>
      </section>

      {(activeTab === 'income' || activeTab === 'expense') && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_22rem]">
          <div className={`${surfaceClass} px-5 py-6 md:px-8`}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black">
                    {activeTab === 'income' ? 'บันทึกรายรับ' : 'บันทึกรายจ่าย'}
                  </h2>
                  <p className={`mt-1 text-sm ${mutedTextClass}`}>
                    เลขอ้างอิงจะถูกสร้างตามเดือนอัตโนมัติหากไม่กรอกเอง เพื่อให้จัดแฟ้มเอกสารได้ต่อเนื่อง
                  </p>
                </div>

                {entryForm.id ? (
                  <button
                    type="button"
                    className={ghostButtonClass}
                    onClick={() => clearEntryForm(activeTab)}
                  >
                    เริ่มรายการใหม่
                  </button>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className={`text-sm font-semibold ${mutedTextClass}`}>วันที่รายการ</span>
                  <div className="relative">
                    <input
                      type="date"
                      value={entryForm.transactionDate}
                      onChange={(event) => setEntryForm((prev) => ({ ...prev, transactionDate: event.target.value }))}
                      className={inputClass}
                    />
                    <Calendar size={16} className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 ${mutedTextClass}`} />
                  </div>
                </label>

                <div className="space-y-2">
                  <span className={`text-sm font-semibold ${mutedTextClass}`}>ช่องทางชำระเงิน</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(['cash', 'transfer', 'card', 'other'] as AccountingPaymentMethod[]).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setEntryForm((prev) => ({ ...prev, paymentMethod: method }))}
                        className={segmentButtonClass(
                          entryForm.paymentMethod === method,
                          activeTab === 'income' ? 'income' : 'expense',
                        )}
                      >
                        {PAYMENT_METHOD_LABEL[method]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className={`${subSurfaceClass} px-4 py-4`}>
                <p className={`text-sm font-semibold ${mutedTextClass}`}>
                  {activeTab === 'income' ? 'จำนวนเงินรับ (บาท)' : 'จำนวนเงินจ่าย (บาท)'}
                </p>
                <input
                  value={entryForm.amountInput}
                  inputMode="decimal"
                  onChange={(event) => handleAmountChange(event.target.value)}
                  className={`mt-3 w-full border-0 bg-transparent p-0 text-right text-4xl font-black leading-none outline-none sm:text-5xl ${
                    activeTab === 'income' ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                  placeholder="0"
                />
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '.'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={keypadButtonClass}
                      onClick={() => handleKeypad(key)}
                    >
                      {key}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={`mt-2 w-full ${ghostButtonClass}`}
                  onClick={() => handleKeypad('Del')}
                >
                  ลบตัวท้าย
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className={`text-sm font-semibold ${mutedTextClass}`}>หมวดรายการ</span>
                  <input
                    list={activeTab === 'income' ? 'income-categories' : 'expense-categories'}
                    value={entryForm.category}
                    onChange={(event) => setEntryForm((prev) => ({ ...prev, category: event.target.value }))}
                    placeholder="เช่น ค่าน้ำมัน, ค่าขนส่ง"
                    className={inputClass}
                  />
                </label>

                <label className="space-y-2">
                  <span className={`text-sm font-semibold ${mutedTextClass}`}>เลขที่อ้างอิงเอกสาร</span>
                  <input
                    value={entryForm.referenceNo}
                    onChange={(event) => setEntryForm((prev) => ({ ...prev, referenceNo: event.target.value }))}
                    placeholder={createReferenceNo(entries, entryForm.transactionDate, entryForm.type)}
                    className={inputClass}
                  />
                </label>
              </div>

              <datalist id="income-categories">
                {INCOME_CATEGORIES.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
              <datalist id="expense-categories">
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>

              <label className="space-y-2">
                <span className={`text-sm font-semibold ${mutedTextClass}`}>รายละเอียดรายการ</span>
                <textarea
                  rows={3}
                  value={entryForm.description}
                  onChange={(event) => setEntryForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder={activeTab === 'income' ? 'เช่น ค่าขนส่งงาน BK Bakery' : 'เช่น เติมน้ำมันดีเซลปฏิบัติงาน'}
                  className={`${inputClass} min-h-[112px] resize-y`}
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className={`text-sm font-semibold ${mutedTextClass}`}>คู่ค้า/ร้านค้า</span>
                  <input
                    value={entryForm.counterpartyName}
                    onChange={(event) => setEntryForm((prev) => ({ ...prev, counterpartyName: event.target.value }))}
                    placeholder="ชื่อร้านหรือชื่อผู้รับเงิน"
                    className={inputClass}
                  />
                </label>

                <label className="space-y-2">
                  <span className={`text-sm font-semibold ${mutedTextClass}`}>เลขผู้เสียภาษีคู่ค้า (ถ้ามี)</span>
                  <input
                    value={entryForm.counterpartyTaxId}
                    onChange={(event) => setEntryForm((prev) => ({ ...prev, counterpartyTaxId: event.target.value }))}
                    placeholder="เลขผู้เสียภาษีของร้านค้า"
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className={`text-sm font-semibold ${mutedTextClass}`}>สถานะเอกสารประกอบ</span>
                  <select
                    value={entryForm.documentStatus}
                    onChange={(event) =>
                      setEntryForm((prev) => ({
                        ...prev,
                        documentStatus: event.target.value as AccountingDocumentStatus,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="receipt">มีใบเสร็จ/ใบกำกับ</option>
                    <option value="replacement_receipt">ใช้ใบรับรองแทนใบเสร็จ</option>
                    <option value="other_evidence">ใช้หลักฐานอื่น</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className={`text-sm font-semibold ${mutedTextClass}`}>หมายเหตุเพิ่มเติม</span>
                  <input
                    value={entryForm.note}
                    onChange={(event) => setEntryForm((prev) => ({ ...prev, note: event.target.value }))}
                    placeholder="เช่น งานด่วน / ใช้จ่ายหน้างาน"
                    className={inputClass}
                  />
                </label>
              </div>

              <div className={`${subSurfaceClass} px-4 py-4`}>
                <p className={`text-sm font-semibold ${mutedTextClass}`}>คำแนะนำเอกสาร</p>
                <p className="mt-2 text-sm leading-6">
                  {getDocumentHint(entryForm.documentStatus)}
                </p>
              </div>

              {entryForm.documentStatus === 'replacement_receipt' ? (
                <label className="space-y-2">
                  <span className={`text-sm font-semibold ${mutedTextClass}`}>เหตุผลที่ไม่มีใบเสร็จ</span>
                  <textarea
                    rows={3}
                    value={entryForm.reasonNoReceipt}
                    onChange={(event) => setEntryForm((prev) => ({ ...prev, reasonNoReceipt: event.target.value }))}
                    placeholder="เช่น ซื้อจากแหล่งชุมชน/ผู้ขายไม่ได้ออกใบเสร็จ"
                    className={`${inputClass} min-h-[96px] resize-y`}
                  />
                </label>
              ) : null}

              <div className={`${subSurfaceClass} px-4 py-4`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold">เอกสารแนบ</p>
                    <p className={`mt-1 text-sm ${mutedTextClass}`}>
                      แนบสลิป ใบเสร็จ รูปถ่ายสินค้า หรือหลักฐานประกอบได้หลายไฟล์
                    </p>
                  </div>
                  <label className={`${ghostButtonClass} w-full justify-center md:w-auto`}>
                    <Upload size={16} />
                    <span>เพิ่มไฟล์แนบ</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => setProofFiles(Array.from(event.target.files || []))}
                    />
                  </label>
                </div>

                {(proofFiles.length > 0 || existingProofUrls.length > 0) ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {existingProofUrls.map((url, index) => (
                      <a
                        key={`${url}-${index}`}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className={attachmentChipClass}
                      >
                        <ImageIcon size={15} />
                        <span className="min-w-0 truncate">ไฟล์เดิม {index + 1}</span>
                      </a>
                    ))}
                    {proofFiles.map((file) => (
                      <span key={file.name + file.lastModified} className={attachmentChipClass}>
                        <ImageIcon size={15} />
                        <span className="min-w-0 truncate">{file.name}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 md:flex-row">
                <button
                  type="button"
                  onClick={handleSaveEntry}
                  disabled={savingEntry}
                  className={`w-full md:w-auto ${actionButtonClass}`}
                >
                  <Save size={16} />
                  <span>{savingEntry ? 'กำลังบันทึก...' : entryForm.id ? 'บันทึกการแก้ไข' : 'บันทึกรายการ'}</span>
                </button>

                {entryForm.documentStatus === 'replacement_receipt' ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!ensureProfileReady()) return;
                      const amount = parseAmount(entryForm.amountInput);
                      if (amount <= 0 || !entryForm.description.trim()) {
                        alert('กรุณากรอกจำนวนเงินและรายละเอียดรายการก่อน');
                        return;
                      }
                      exportReplacementReceiptPdf(
                        {
                          id: entryForm.id || 'preview',
                          transactionDate: entryForm.transactionDate,
                          type: 'expense',
                          amount,
                          paymentMethod: entryForm.paymentMethod,
                          description: entryForm.description.trim(),
                          category: entryForm.category.trim(),
                          counterpartyName: entryForm.counterpartyName.trim(),
                          counterpartyTaxId: entryForm.counterpartyTaxId.trim(),
                          referenceNo: entryForm.referenceNo.trim() || createReferenceNo(entries, entryForm.transactionDate, 'expense'),
                          note: entryForm.note.trim(),
                          documentStatus: entryForm.documentStatus,
                          reasonNoReceipt: entryForm.reasonNoReceipt.trim(),
                          proofUrls: existingProofUrls,
                          createdByUid: user?.uid,
                          createdByName: userProfile?.fullName || userProfile?.displayName,
                          timestamp: Date.now(),
                        },
                        profileForm,
                      );
                    }}
                    className={`w-full md:w-auto ${ghostButtonClass}`}
                  >
                    <Download size={16} />
                    <span className="break-words">ตัวอย่างใบรับรองแทนใบเสร็จ</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <aside className={`${surfaceClass} px-5 py-6`}>
            <div className="space-y-4">
              <div>
                <p className={`text-sm font-semibold uppercase tracking-[0.16em] ${mutedTextClass}`}>สถานะเดือนนี้</p>
                <h3 className="mt-2 text-2xl font-black">
                  {getMonthName(month)} {year + 543}
                </h3>
              </div>

              <div className="grid gap-3">
                <div className={subSurfaceClass}>
                  <div className="px-4 py-4">
                    <p className={`text-sm font-semibold ${mutedTextClass}`}>รายการทั้งหมด</p>
                    <p className="mt-2 text-3xl font-black">{totals.count}</p>
                  </div>
                </div>
                <div className={subSurfaceClass}>
                  <div className="px-4 py-4">
                    <p className={`text-sm font-semibold ${mutedTextClass}`}>เลขอ้างอิงแนะนำ</p>
                    <p className="mt-2 text-lg font-black">
                      {createReferenceNo(entries, entryForm.transactionDate, entryForm.type)}
                    </p>
                  </div>
                </div>
                <div className={subSurfaceClass}>
                  <div className="px-4 py-4">
                    <p className={`text-sm font-semibold ${mutedTextClass}`}>แนวทางจัดเอกสาร</p>
                    <ul className="mt-2 space-y-2 text-sm leading-6">
                      <li>1. ลงวันที่และจำนวนเงินจริงทุกครั้ง</li>
                      <li>2. เก็บเลขอ้างอิงรายเดือนต่อเนื่อง</li>
                      <li>3. แนบหลักฐาน หรือใช้ใบรับรองแทนใบเสร็จเมื่อไม่มีใบเสร็จ</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </section>
      )}

      {activeTab === 'summary' && (
        <section className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className={`${surfaceClass} px-5 py-5`}>
              <p className={`text-sm font-semibold ${mutedTextClass}`}>รายรับ</p>
              <p className="mt-3 text-3xl font-black text-emerald-600 sm:text-4xl">{formatCompactCurrency(totals.income)}</p>
              <p className={`mt-2 text-sm ${mutedTextClass}`}>สะสมเดือนนี้ {formatCurrency(totals.income)} บาท</p>
            </div>
            <div className={`${surfaceClass} px-5 py-5`}>
              <p className={`text-sm font-semibold ${mutedTextClass}`}>รายจ่าย</p>
              <p className="mt-3 text-3xl font-black text-rose-600 sm:text-4xl">{formatCompactCurrency(totals.expense)}</p>
              <p className={`mt-2 text-sm ${mutedTextClass}`}>สะสมเดือนนี้ {formatCurrency(totals.expense)} บาท</p>
            </div>
            <div className={`${surfaceClass} px-5 py-5`}>
              <p className={`text-sm font-semibold ${mutedTextClass}`}>กำไรสุทธิ</p>
              <p className={`mt-3 text-3xl font-black sm:text-4xl ${totals.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {totals.net >= 0 ? '' : '-'}{formatCompactCurrency(Math.abs(totals.net))}
              </p>
              <p className={`mt-2 text-sm ${mutedTextClass}`}>สุทธิเดือนนี้ {formatCurrency(totals.net)} บาท</p>
            </div>
          </div>

          <div className={`${surfaceClass} px-5 py-6 md:px-8`}>
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-2xl font-black">สรุปรายรับ-รายจ่าย</h2>
                <p className={`mt-2 text-sm ${mutedTextClass}`}>
                  ดูยอดเดือนปัจจุบัน พร้อมออกไฟล์ PDF ตามสมุดบัญชีรายรับ-รายจ่าย
                </p>
              </div>

              <div className="flex w-full flex-wrap gap-3 md:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (!ensureProfileReady()) return;
                    exportLedgerPdf(monthEntries, profileForm, month, year);
                  }}
                  disabled={monthEntries.length === 0}
                  className={`${actionButtonClass} w-full md:w-auto`}
                >
                  <Download size={16} />
                  <span>Export PDF</span>
                </button>
              </div>
            </div>

            <div className={`${subSurfaceClass} mt-5 px-4 py-4`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className={`text-sm font-semibold ${mutedTextClass}`}>ระบบเฝ้าระวัง VAT</p>
                  <p className="mt-2 text-3xl font-black">
                    {formatCompactCurrency(yearlyIncome)} / {formatCompactCurrency(vatThreshold)}
                  </p>
                  <p className={`mt-2 text-sm ${mutedTextClass}`}>
                    รายรับสะสมทั้งปี {year + 543} หากเกิน {formatCompactCurrency(vatThreshold)} บาทควรตรวจสอบภาระจดทะเบียน VAT กับที่ปรึกษาภาษี
                  </p>
                </div>
                <div className="w-full md:max-w-xs">
                  <div className={`h-3 rounded-full ${isDark ? 'bg-white/8' : 'bg-[#e5efe6]'}`}>
                    <div
                      className="h-3 rounded-full bg-amber-400 transition-all"
                      style={{ width: `${vatProgress}%` }}
                    />
                  </div>
                  <p className={`mt-2 text-right text-sm font-semibold ${mutedTextClass}`}>{vatProgress.toFixed(1)}%</p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className={subSurfaceClass}>
                <div className="px-4 py-4">
                  <p className="text-sm font-semibold">โครงสร้างเอกสารที่ระบบออกให้</p>
                  <ul className="mt-3 space-y-2 text-sm leading-6">
                    <li>1. สมุดบัญชีรายรับ-รายจ่ายรายเดือน</li>
                    <li>2. เลขอ้างอิงเอกสารตามเดือน (RV/PV)</li>
                    <li>3. ใบรับรองแทนใบเสร็จรับเงินสำหรับรายการที่ไม่มีใบเสร็จ</li>
                    <li>4. แนบหลักฐานรูปถ่าย/สลิป/เอกสารประกอบเพิ่มเติมได้</li>
                  </ul>
                </div>
              </div>

              <div className={subSurfaceClass}>
                <div className="px-4 py-4">
                  <p className="text-sm font-semibold">รายการที่ควรออกใบรับรองแทนใบเสร็จ</p>
                  <div className="mt-3 space-y-2">
                    {expenseReplacementCandidates.slice(0, 4).map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          if (!ensureProfileReady()) return;
                          exportReplacementReceiptPdf(entry, profileForm);
                        }}
                        className={`${ghostButtonClass} grid w-full grid-cols-[minmax(0,1fr)_auto] items-center justify-between gap-3 px-3`}
                      >
                        <span className="truncate text-left">{entry.description}</span>
                        <span>{formatCompactCurrency(entry.amount)}</span>
                      </button>
                    ))}
                    {expenseReplacementCandidates.length === 0 ? (
                      <p className={`text-sm ${mutedTextClass}`}>ยังไม่มีรายการรายจ่ายในเดือนนี้</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'history' && (
        <section className="space-y-5">
          <div className={`${surfaceClass} px-5 py-6 md:px-8`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-2xl font-black">ประวัติรายการ</h2>
                <p className={`mt-2 text-sm ${mutedTextClass}`}>
                  เลือกเดือนและปีเพื่อตรวจสอบรายการ พร้อมแก้ไข ลบ หรือออกเอกสาร PDF ย้อนหลัง
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className={inputClass}>
                  {MONTHS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
                <select value={year} onChange={(event) => setYear(Number(event.target.value))} className={inputClass}>
                  {years.map((value) => (
                    <option key={value} value={value}>{value + 543}</option>
                  ))}
                </select>
                <select
                  value={historyFilter}
                  onChange={(event) => setHistoryFilter(event.target.value as HistoryFilter)}
                  className={inputClass}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="income">เฉพาะรายรับ</option>
                  <option value="expense">เฉพาะรายจ่าย</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className={`${surfaceClass} px-5 py-8 text-center text-sm ${mutedTextClass}`}>กำลังโหลดข้อมูล...</div>
            ) : historyEntries.length === 0 ? (
              <div className={`${surfaceClass} px-5 py-8 text-center text-sm ${mutedTextClass}`}>ยังไม่มีรายการในช่วงที่เลือก</div>
            ) : (
              historyEntries.map((entry) => (
                <article key={entry.id} className={`${surfaceClass} px-5 py-5`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={segmentButtonClass(true, entry.type === 'income' ? 'income' : 'expense')}>
                          {entry.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                        </span>
                        <span className={`text-sm font-semibold ${mutedTextClass}`}>{formatThaiDate(entry.transactionDate)}</span>
                        <span className={`text-sm font-semibold ${mutedTextClass}`}>{entry.referenceNo || '-'}</span>
                      </div>
                      <h3 className="mt-3 text-xl font-black">{entry.description}</h3>
                      <div className={`mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm ${mutedTextClass}`}>
                        <span>หมวด: {entry.category || '-'}</span>
                        <span>คู่ค้า: {entry.counterpartyName || '-'}</span>
                        <span>ชำระ: {PAYMENT_METHOD_LABEL[entry.paymentMethod]}</span>
                        <span>เอกสาร: {DOCUMENT_STATUS_LABEL[entry.documentStatus]}</span>
                      </div>
                      {entry.note ? <p className={`mt-3 text-sm leading-6 ${mutedTextClass}`}>{entry.note}</p> : null}
                      {entry.reasonNoReceipt ? (
                        <p className="mt-2 text-sm font-medium text-amber-600">
                          เหตุผลที่ไม่มีใบเสร็จ: {entry.reasonNoReceipt}
                        </p>
                      ) : null}
                      {Array.isArray(entry.proofUrls) && entry.proofUrls.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {entry.proofUrls.map((url, index) => (
                            <a
                              key={`${url}-${index}`}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                            className={attachmentChipClass}
                          >
                            <ImageIcon size={15} />
                            <span className="min-w-0 truncate">หลักฐาน {index + 1}</span>
                          </a>
                        ))}
                      </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-start gap-3 lg:min-w-[13rem] lg:items-end">
                      <p className={`text-3xl font-black ${entry.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {entry.type === 'income' ? '+' : '-'}{formatCompactCurrency(entry.amount)}
                      </p>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                        <button type="button" onClick={() => handleEditEntry(entry)} className={`${ghostButtonClass} w-full sm:w-auto`}>
                          <Pencil size={15} />
                          <span>แก้ไข</span>
                        </button>
                        {entry.type === 'expense' ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!ensureProfileReady()) return;
                              exportReplacementReceiptPdf(entry, profileForm);
                            }}
                            className={`${ghostButtonClass} w-full sm:w-auto`}
                          >
                            <Download size={15} />
                            <span>ใบรับรอง</span>
                          </button>
                        ) : null}
                        <button type="button" onClick={() => handleDeleteEntry(entry)} className={`${ghostButtonClass} w-full sm:w-auto`}>
                          <Trash2 size={15} />
                          <span>ลบ</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      {activeTab === 'profile' && (
        <section className={`${surfaceClass} px-5 py-6 md:px-8`}>
          <div className="max-w-4xl space-y-5">
            <div>
              <h2 className="text-2xl font-black">ข้อมูลผู้เสียภาษี</h2>
              <p className={`mt-2 text-sm ${mutedTextClass}`}>
                ข้อมูลชุดนี้จะถูกใช้ใน PDF สมุดบัญชีรายรับ-รายจ่าย และใบรับรองแทนใบเสร็จรับเงิน
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className={`text-sm font-semibold ${mutedTextClass}`}>ชื่อ-นามสกุล / ผู้ประกอบการ</span>
                <input
                  value={profileForm.fullName}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, fullName: event.target.value }))}
                  className={inputClass}
                />
              </label>

              <label className="space-y-2">
                <span className={`text-sm font-semibold ${mutedTextClass}`}>เลขบัตรประชาชน</span>
                <input
                  value={profileForm.citizenId}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, citizenId: event.target.value }))}
                  className={inputClass}
                />
              </label>

              <label className="space-y-2">
                <span className={`text-sm font-semibold ${mutedTextClass}`}>ชื่อกิจการ / ร้านค้า</span>
                <input
                  value={profileForm.businessName}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, businessName: event.target.value }))}
                  className={inputClass}
                />
              </label>

              <label className="space-y-2">
                <span className={`text-sm font-semibold ${mutedTextClass}`}>เลขประจำตัวผู้เสียภาษี</span>
                <input
                  value={profileForm.businessTaxId}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, businessTaxId: event.target.value }))}
                  className={inputClass}
                />
              </label>

              <label className="space-y-2">
                <span className={`text-sm font-semibold ${mutedTextClass}`}>สาขา</span>
                <input
                  value={profileForm.businessBranchName}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, businessBranchName: event.target.value }))}
                  className={inputClass}
                />
              </label>

              <label className="space-y-2">
                <span className={`text-sm font-semibold ${mutedTextClass}`}>ชื่อผู้ลงนาม</span>
                <input
                  value={profileForm.signatureName}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, signatureName: event.target.value }))}
                  className={inputClass}
                />
              </label>
            </div>

            <label className="space-y-2">
              <span className={`text-sm font-semibold ${mutedTextClass}`}>ที่อยู่</span>
              <textarea
                rows={4}
                value={profileForm.address}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, address: event.target.value }))}
                className={`${inputClass} min-h-[108px] resize-y`}
              />
            </label>

            <div className={`${subSurfaceClass} px-4 py-4`}>
              <p className="text-sm font-semibold">ฟิลด์ที่ระบบใช้ตอน export</p>
              <ul className="mt-3 space-y-2 text-sm leading-6">
                <li>1. ชื่อผู้ประกอบการ/ชื่อผู้เสียภาษี</li>
                <li>2. เลขประจำตัวผู้เสียภาษีหรือเลขบัตรประชาชน</li>
                <li>3. ที่อยู่และสาขา</li>
                <li>4. ชื่อผู้ลงนามในเอกสาร</li>
              </ul>
            </div>

            <button type="button" onClick={handleSaveProfile} disabled={savingProfile} className={`${actionButtonClass} w-full md:w-auto`}>
              <Save size={16} />
              <span>{savingProfile ? 'กำลังบันทึก...' : 'บันทึกข้อมูลผู้เสียภาษี'}</span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

export default AdminAccounting;
