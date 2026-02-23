import React, { useState, useEffect, useMemo } from 'react';
import { deleteJob as firebaseDeleteJob, updateJob as firebaseUpdateJob } from '../services/firebaseService';
import { JobEntry, AppData } from '../types';
import { Download, Printer, Filter, X, ChevronDown, Edit2, Eye, Image as ImageIcon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { NotoSansThaiBase64 } from '../fonts/NotoSansThai';
import { formatDate } from '../utils/formatters';

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

const DataTable: React.FC = () => {
  const { theme } = useTheme();
  const { data: appData, refreshData } = useData();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';
  const isDark = theme === 'dark';
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    month: null,
    year: null,
    driver: '',
    vehicleType: '',
    licensePlate: ''
  });

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
  
  // New Images for Edit
  // New Images for Edit
  const [editOriginImageFiles, setEditOriginImageFiles] = useState<File[]>([]);
  const [editDestinationImageFiles, setEditDestinationImageFiles] = useState<File[]>([]);
  const [editDocumentImageFiles, setEditDocumentImageFiles] = useState<File[]>([]);

  // Use real-time data from context
  useEffect(() => {
    if (appData?.jobs) {
      setJobs(appData.jobs.sort((a, b) => b.timestamp - a.timestamp));
      setLoading(false);
    }
  }, [appData]);



  // Extract unique years from data
  const availableYears = useMemo(() => {
    const years = new Set<number>(
      jobs
        .map(job => getJobYearMonth(job.date)?.year)
        .filter((year): year is number => typeof year === 'number')
    );
    return Array.from(years).sort((a, b) => b - a);
  }, [jobs]);

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

  const clearFilters = () => {
    setFilters({
      month: null,
      year: null,
      driver: '',
      vehicleType: '',
      licensePlate: ''
    });
  };

  const hasActiveFilters = filters.month || filters.year || filters.driver || filters.vehicleType || filters.licensePlate;

  // Handle row click
  const handleRowClick = (job: JobEntry) => {
    setSelectedJob(job);
    setEditData({ ...job });
    setEditOriginImageFiles([]); // Reset origin image files
    setEditDestinationImageFiles([]); // Reset destination image files
    setEditDocumentImageFiles([]); // Reset document image files
    setIsEditing(false);
    setIsDetailModalOpen(true);
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
        setEditOriginImageFiles([]);
        setEditDestinationImageFiles([]);
        setEditDocumentImageFiles([]);
      } catch (error) {
        console.error('Failed to update job:', error);
        alert('เกิดข้อผิดพลาดในการแก้ไข');
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

    const getDateSortValue = (dateValue: string): number => {
      const normalizedDate = dateValue?.split('T')[0] || dateValue;
      const parsedTime = new Date(normalizedDate).getTime();
      return Number.isNaN(parsedTime) ? Number.POSITIVE_INFINITY : parsedTime;
    };

    const headers = ["Date", "Pickup", "Dropoff", "Rounds", "Vehicle", "Plate", "Driver", "Job No", "Inv No", "Fuel/Toll", "Remarks"];
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
          j.vehicleType,
          j.licensePlate,
          j.driverName,
          j.jobNo,
          j.invNo,
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
    const tableColumn = ['วันที่', 'เส้นทาง', 'รอบ', 'รถ/ทะเบียน', 'คนขับ', 'Job/Inv'];
    const tableRows = pdfJobs.map(job => [
      formatDate(job.date),
      `${job.pickupLocation} > ${job.dropoffLocation}`,
      job.rounds.toString(),
      `${job.vehicleType}\n${job.licensePlate}`,
      job.driverName,
      `${job.jobNo || '-'}\n${job.invNo || '-'}`
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
        3: { cellWidth: 35, halign: 'center' }, // Vehicle - center
        4: { cellWidth: 30, halign: 'center' }, // Driver - center
        5: { cellWidth: 35, halign: 'center' }  // Job/Inv - center
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
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsDetailModalOpen(false)} />
        
        <div className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl animate-fade-in ${
          isDark ? 'bg-dark-card' : 'bg-white'
        }`}>
          {/* Header with gradient */}
          <div className="bg-gradient-to-r from-accent-primary to-accent-secondary p-6 rounded-t-3xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  {isEditing ? <Edit2 size={24} className="text-white" /> : <Eye size={24} className="text-white" />}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {isEditing ? 'แก้ไขข้อมูล' : 'รายละเอียดงาน'}
                  </h3>
                  <p className="text-white/70 text-sm">{selectedJob.jobNo || 'No Job Number'}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsDetailModalOpen(false)} 
                className="p-2 rounded-xl bg-white/20 hover:bg-white/30 transition-colors"
              >
                <X size={20} className="text-white" />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Quick Stats Row */}
            {!isEditing && (
              <div className="grid grid-cols-3 gap-4">
                <div className={`p-4 rounded-2xl text-center ${isDark ? 'bg-dark-bg' : 'bg-purple-50'}`}>
                  <div className="text-2xl font-bold text-accent-primary">{selectedJob.rounds}</div>
                  <div className={`text-xs ${isDark ? 'text-dark-muted' : 'text-purple-600'}`}>จำนวนรอบ</div>
                </div>
                <div className={`p-4 rounded-2xl text-center ${isDark ? 'bg-dark-bg' : 'bg-blue-50'}`}>
                  <div className="text-lg font-bold text-accent-secondary truncate">{selectedJob.vehicleType}</div>
                  <div className={`text-xs ${isDark ? 'text-dark-muted' : 'text-blue-600'}`}>ประเภทรถ</div>
                </div>
                <div className={`p-4 rounded-2xl text-center ${isDark ? 'bg-dark-bg' : 'bg-green-50'}`}>
                  <div className="text-lg font-bold text-accent-success truncate">{selectedJob.licensePlate}</div>
                  <div className={`text-xs ${isDark ? 'text-dark-muted' : 'text-green-600'}`}>ทะเบียน</div>
                </div>
              </div>
            )}

            {/* Route Section */}
            <div className={`p-5 rounded-2xl border ${isDark ? 'bg-dark-bg/50 border-dark-muted/20' : 'bg-gradient-to-br from-purple-50 to-blue-50 border-purple-100'}`}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-accent-primary/20 flex items-center justify-center">
                  <span className="text-accent-primary text-sm">🚚</span>
                </div>
                <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-700'}`}>เส้นทาง</span>
              </div>
              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className={`text-xs ${isDark ? 'text-dark-muted' : 'text-slate-500'}`}>สถานที่รับ</label>
                    <select
                      value={editData.pickupLocation}
                      onChange={(e) => handleEditChange('pickupLocation', e.target.value)}
                      className={`w-full mt-1 border rounded-xl px-4 py-2 ${
                        isDark ? 'bg-dark-card border-dark-muted/30 text-dark-text' : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      <option value="">เลือกสถานที่</option>
                      {appData?.options.locations.sort((a,b)=>a.localeCompare(b, 'th')).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`text-xs ${isDark ? 'text-dark-muted' : 'text-slate-500'}`}>สถานที่ส่ง</label>
                    <select
                      value={editData.dropoffLocation}
                      onChange={(e) => handleEditChange('dropoffLocation', e.target.value)}
                      className={`w-full mt-1 border rounded-xl px-4 py-2 ${
                        isDark ? 'bg-dark-card border-dark-muted/30 text-dark-text' : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      <option value="">เลือกสถานที่</option>
                      {appData?.options.locations.sort((a,b)=>a.localeCompare(b, 'th')).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className={`flex-1 p-3 rounded-xl ${isDark ? 'bg-dark-card' : 'bg-white'} shadow-sm`}>
                    <div className={`text-xs ${isDark ? 'text-dark-muted' : 'text-slate-400'}`}>รับ</div>
                    <div className={`font-medium ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>{selectedJob.pickupLocation}</div>
                  </div>
                  <div className="text-accent-primary text-xl">→</div>
                  <div className={`flex-1 p-3 rounded-xl ${isDark ? 'bg-dark-card' : 'bg-white'} shadow-sm`}>
                    <div className={`text-xs ${isDark ? 'text-dark-muted' : 'text-slate-400'}`}>ส่ง</div>
                    <div className={`font-medium ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>{selectedJob.dropoffLocation}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Date */}
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-dark-bg' : 'bg-slate-50'}`}>
                <div className={`text-xs mb-1 ${isDark ? 'text-dark-muted' : 'text-slate-400'}`}>📅 วันที่</div>
                {isEditing ? (
                  <div className="relative" onClick={(e) => {
                    const input = e.currentTarget.querySelector('input');
                    if (input && 'showPicker' in input) (input as any).showPicker();
                  }}>
                    <input
                      type="date"
                      value={editData.date}
                      onChange={(e) => handleEditChange('date', e.target.value)}
                      className={`w-full border rounded-lg px-3 py-1 text-sm cursor-pointer dark:[color-scheme:dark] ${
                        isDark ? 'bg-dark-card border-dark-muted/30 text-dark-text' : 'bg-white border-slate-200'
                      }`}
                    />
                  </div>
                ) : (
                  <div className={`font-medium ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>{formatDate(selectedJob.date)}</div>
                )}
              </div>

              {/* Rounds */}
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-dark-bg' : 'bg-slate-50'}`}>
                <div className={`text-xs mb-1 ${isDark ? 'text-dark-muted' : 'text-slate-400'}`}>🔄 จำนวนรอบ</div>
                {isEditing ? (
                  <input
                    type="number"
                    value={editData.rounds}
                    onChange={(e) => handleEditChange('rounds', parseInt(e.target.value))}
                    className={`w-full border rounded-lg px-3 py-1 text-sm ${
                      isDark ? 'bg-dark-card border-dark-muted/30 text-dark-text' : 'bg-white border-slate-200'
                    }`}
                  />
                ) : (
                  <div className={`font-medium ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>{selectedJob.rounds} รอบ</div>
                )}
              </div>

              {/* Vehicle Type */}
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-dark-bg' : 'bg-slate-50'}`}>
                <div className={`text-xs mb-1 ${isDark ? 'text-dark-muted' : 'text-slate-400'}`}>🚛 ประเภทรถ</div>
                {isEditing ? (
                  <select
                    value={editData.vehicleType}
                    onChange={(e) => handleEditChange('vehicleType', e.target.value)}
                    className={`w-full border rounded-lg px-3 py-1 text-sm ${
                      isDark ? 'bg-dark-card border-dark-muted/30 text-dark-text' : 'bg-white border-slate-200'
                    }`}
                  >
                    <option value="">เลือกประเภทรถ</option>
                    {appData?.options.vehicleTypes.sort((a,b)=>a.localeCompare(b, 'th')).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <div className={`font-medium ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>{selectedJob.vehicleType}</div>
                )}
              </div>

              {/* License Plate */}
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-dark-bg' : 'bg-slate-50'}`}>
                <div className={`text-xs mb-1 ${isDark ? 'text-dark-muted' : 'text-slate-400'}`}>🔢 ทะเบียน</div>
                {isEditing ? (
                  <select
                    value={editData.licensePlate}
                    onChange={(e) => handleEditChange('licensePlate', e.target.value)}
                    className={`w-full border rounded-lg px-3 py-1 text-sm ${
                      isDark ? 'bg-dark-card border-dark-muted/30 text-dark-text' : 'bg-white border-slate-200'
                    }`}
                  >
                    <option value="">เลือกทะเบียน</option>
                    {appData?.options.licensePlates.sort((a,b)=>a.localeCompare(b, 'th')).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <div className={`font-medium ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>{selectedJob.licensePlate}</div>
                )}
              </div>

              {/* Driver */}
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-dark-bg' : 'bg-slate-50'}`}>
                <div className={`text-xs mb-1 ${isDark ? 'text-dark-muted' : 'text-slate-400'}`}>👤 คนขับ</div>
                {isEditing ? (
                  <select
                    value={editData.driverName}
                    onChange={(e) => handleEditChange('driverName', e.target.value)}
                    className={`w-full border rounded-lg px-3 py-1 text-sm ${
                      isDark ? 'bg-dark-card border-dark-muted/30 text-dark-text' : 'bg-white border-slate-200'
                    }`}
                  >
                    <option value="">เลือกคนขับ</option>
                    {appData?.options.drivers.sort((a,b)=>a.localeCompare(b, 'th')).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <div className={`font-medium ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>{selectedJob.driverName}</div>
                )}
              </div>

              {/* Job No */}
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-dark-bg' : 'bg-slate-50'}`}>
                <div className={`text-xs mb-1 ${isDark ? 'text-dark-muted' : 'text-slate-400'}`}>📋 Job No.</div>
                {isEditing ? (
                  <input
                    value={editData.jobNo}
                    onChange={(e) => handleEditChange('jobNo', e.target.value)}
                    className={`w-full border rounded-lg px-3 py-1 text-sm ${
                      isDark ? 'bg-dark-card border-dark-muted/30 text-dark-text' : 'bg-white border-slate-200'
                    }`}
                  />
                ) : (
                  <div className={`font-medium ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>{selectedJob.jobNo || '-'}</div>
                )}
              </div>

              {/* Fuel / Toll */}
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-dark-bg' : 'bg-slate-50'}`}>
                <div className={`text-xs mb-1 ${isDark ? 'text-dark-muted' : 'text-slate-400'}`}>⛽ ค่าน้ำมัน/ทางด่วน</div>
                {isEditing ? (
                  <input
                    type="number"
                    value={editData.fuelAndToll ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      handleEditChange('fuelAndToll', value === '' ? '' : parseFloat(value));
                    }}
                    className={`w-full border rounded-lg px-3 py-1 text-sm ${
                      isDark ? 'bg-dark-card border-dark-muted/30 text-dark-text' : 'bg-white border-slate-200'
                    }`}
                    placeholder="0.00"
                  />
                ) : (
                  <div className={`font-medium ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>
                    {selectedJob.fuelAndToll !== null && selectedJob.fuelAndToll !== undefined && selectedJob.fuelAndToll !== ''
                      ? Number(selectedJob.fuelAndToll).toLocaleString()
                      : '-'}
                  </div>
                )}
              </div>

              {/* Admin Only: Price Fields */}
              {isAdmin && (
                <div className="col-span-2 grid grid-cols-2 gap-4">
                  <div className={`p-4 rounded-2xl ${isDark ? 'bg-dark-bg' : 'bg-slate-50'}`}>
                    <div className={`text-xs mb-1 ${isDark ? 'text-dark-muted' : 'text-slate-400'}`}>💰 ราคาเก็บลูกค้า</div>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editData.customerPrice || ''}
                        onChange={(e) => handleEditChange('customerPrice', parseFloat(e.target.value))}
                        className={`w-full border rounded-lg px-3 py-1 text-sm ${
                          isDark ? 'bg-dark-card border-dark-muted/30 text-dark-text' : 'bg-white border-slate-200'
                        }`}
                        placeholder="0.00"
                      />
                    ) : (
                      <div className={`font-medium ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>
                        {selectedJob.customerPrice?.toLocaleString() || '-'}
                      </div>
                    )}
                  </div>
                  <div className={`p-4 rounded-2xl ${isDark ? 'bg-dark-bg' : 'bg-slate-50'}`}>
                    <div className={`text-xs mb-1 ${isDark ? 'text-dark-muted' : 'text-slate-400'}`}>💸 ราคาจ่ายรถร่วม</div>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editData.jointPrice || ''}
                        onChange={(e) => handleEditChange('jointPrice', parseFloat(e.target.value))}
                        className={`w-full border rounded-lg px-3 py-1 text-sm ${
                          isDark ? 'bg-dark-card border-dark-muted/30 text-dark-text' : 'bg-white border-slate-200'
                        }`}
                        placeholder="0.00"
                      />
                    ) : (
                      <div className={`font-medium ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>
                        {selectedJob.jointPrice?.toLocaleString() || '-'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Invoice & Remarks & Image */}
            <div className="space-y-4">
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-dark-bg' : 'bg-slate-50'}`}>
                <div className={`text-xs mb-1 ${isDark ? 'text-dark-muted' : 'text-slate-400'}`}>🧾 Invoice No.</div>
                {isEditing ? (
                  <input
                    value={editData.invNo}
                    onChange={(e) => handleEditChange('invNo', e.target.value)}
                    className={`w-full border rounded-lg px-3 py-1 text-sm ${
                      isDark ? 'bg-dark-card border-dark-muted/30 text-dark-text' : 'bg-white border-slate-200'
                    }`}
                  />
                ) : (
                  <div className={`font-medium ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>{selectedJob.invNo || '-'}</div>
                )}
              </div>

              <div className={`p-4 rounded-2xl ${isDark ? 'bg-dark-bg' : 'bg-amber-50'}`}>
                <div className={`text-xs mb-1 ${isDark ? 'text-dark-muted' : 'text-amber-600'}`}>💬 หมายเหตุ</div>
                {isEditing ? (
                  <textarea
                    value={editData.remarks}
                    onChange={(e) => handleEditChange('remarks', e.target.value)}
                    rows={2}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${
                      isDark ? 'bg-dark-card border-dark-muted/30 text-dark-text' : 'bg-white border-amber-200'
                    }`}
                  />
                ) : (
                  <div className={`font-medium ${isDark ? 'text-dark-text' : 'text-amber-800'}`}>{selectedJob.remarks || '-'}</div>
                )}
              </div>

              {/* Origin Image Section (รูปภาพต้นทาง) */}
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-dark-bg' : 'bg-blue-50/50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <ImageIcon size={16} className={isDark ? 'text-dark-muted' : 'text-blue-500'} />
                  <span className={`text-xs ${isDark ? 'text-dark-muted' : 'text-blue-600'}`}>รูปภาพต้นทาง</span>
                </div>
                
                {isEditing ? (
                  <div className="space-y-3">
                    {/* Existing Images */}
                    {editData.originImageUrls && editData.originImageUrls.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {editData.originImageUrls.map((url, index) => (
                           <div key={index} className="relative w-full h-32 rounded-lg overflow-hidden border border-slate-200">
                            <img src={url} alt={`Origin ${index}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : editData.originImageUrl ? (
                       <div className="relative w-full h-32 rounded-lg overflow-hidden border border-slate-200">
                        <img src={editData.originImageUrl} alt="Origin" className="w-full h-full object-cover" />
                      </div>
                    ) : null}

                    {/* New Images Preview */}
                    {editOriginImageFiles.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">รูปใหม่ที่จะเพิ่ม ({editOriginImageFiles.length}):</p>
                        <div className="grid grid-cols-2 gap-2">
                          {editOriginImageFiles.map((file, index) => (
                            <div key={index} className="relative w-full h-32 rounded-lg overflow-hidden border border-slate-200">
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
                      className="block w-full text-sm text-slate-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:bg-violet-50 file:text-violet-700
                        hover:file:bg-violet-100"
                    />
                    <p className="text-xs text-slate-400">*การอัพโหลดรูปใหม่จะแทนที่รูปเดิมทั้งหมด</p>
                  </div>
                ) : (
                  (selectedJob.originImageUrls && selectedJob.originImageUrls.length > 0) ? (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedJob.originImageUrls.map((url, index) => (
                        <div key={index} className="relative w-full h-32 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.open(url, '_blank')}>
                          <img 
                            src={url} 
                            alt={`Origin ${index}`} 
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" 
                          />
                        </div>
                      ))}
                    </div>
                  ) : selectedJob.originImageUrl ? (
                    <div className="relative w-full h-48 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.open(selectedJob.originImageUrl, '_blank')}>
                      <img 
                        src={selectedJob.originImageUrl} 
                        alt="Origin" 
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" 
                      />
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400 italic text-center py-4">ไม่มีรูปภาพต้นทาง</div>
                  )
                )}
              </div>

              {/* Destination Image Section (รูปภาพปลายทาง) */}
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-dark-bg' : 'bg-green-50/50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <ImageIcon size={16} className={isDark ? 'text-dark-muted' : 'text-green-500'} />
                  <span className={`text-xs ${isDark ? 'text-dark-muted' : 'text-green-600'}`}>รูปภาพปลายทาง</span>
                </div>
                
                {isEditing ? (
                  <div className="space-y-3">
                    {/* Existing Images */}
                    {editData.destinationImageUrls && editData.destinationImageUrls.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {editData.destinationImageUrls.map((url, index) => (
                           <div key={index} className="relative w-full h-32 rounded-lg overflow-hidden border border-slate-200">
                            <img src={url} alt={`Destination ${index}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : editData.destinationImageUrl ? (
                       <div className="relative w-full h-32 rounded-lg overflow-hidden border border-slate-200">
                        <img src={editData.destinationImageUrl} alt="Destination" className="w-full h-full object-cover" />
                      </div>
                    ) : null}

                    {/* New Images Preview */}
                    {editDestinationImageFiles.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">รูปใหม่ที่จะเพิ่ม ({editDestinationImageFiles.length}):</p>
                        <div className="grid grid-cols-2 gap-2">
                          {editDestinationImageFiles.map((file, index) => (
                            <div key={index} className="relative w-full h-32 rounded-lg overflow-hidden border border-slate-200">
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
                      className="block w-full text-sm text-slate-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:bg-green-50 file:text-green-700
                        hover:file:bg-green-100"
                    />
                    <p className="text-xs text-slate-400">*การอัพโหลดรูปใหม่จะแทนที่รูปเดิมทั้งหมด</p>
                  </div>
                ) : (
                  (selectedJob.destinationImageUrls && selectedJob.destinationImageUrls.length > 0) ? (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedJob.destinationImageUrls.map((url, index) => (
                        <div key={index} className="relative w-full h-32 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.open(url, '_blank')}>
                          <img 
                            src={url} 
                            alt={`Destination ${index}`} 
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" 
                          />
                        </div>
                      ))}
                    </div>
                  ) : selectedJob.destinationImageUrl ? (
                    <div className="relative w-full h-48 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.open(selectedJob.destinationImageUrl, '_blank')}>
                      <img 
                        src={selectedJob.destinationImageUrl} 
                        alt="Destination" 
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" 
                      />
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400 italic text-center py-4">ไม่มีรูปภาพปลายทาง</div>
                  )
                )}
              </div>

               {/* Document Image Section (รูปภาพเอกสาร) */}
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-dark-bg' : 'bg-gray-50/50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <ImageIcon size={16} className={isDark ? 'text-dark-muted' : 'text-gray-500'} />
                  <span className={`text-xs ${isDark ? 'text-dark-muted' : 'text-gray-600'}`}>รูปภาพเอกสาร</span>
                </div>
                
                {isEditing ? (
                  <div className="space-y-3">
                    {/* Existing Images */}
                    {editData.documentImageUrls && editData.documentImageUrls.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {editData.documentImageUrls.map((url, index) => (
                           <div key={index} className="relative w-full h-32 rounded-lg overflow-hidden border border-slate-200">
                            <img src={url} alt={`Document ${index}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : editData.documentImageUrl ? (
                       <div className="relative w-full h-32 rounded-lg overflow-hidden border border-slate-200">
                        <img src={editData.documentImageUrl} alt="Document" className="w-full h-full object-cover" />
                      </div>
                    ) : null}

                    {/* New Images Preview */}
                    {editDocumentImageFiles.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">รูปใหม่ที่จะเพิ่ม ({editDocumentImageFiles.length}):</p>
                        <div className="grid grid-cols-2 gap-2">
                          {editDocumentImageFiles.map((file, index) => (
                            <div key={index} className="relative w-full h-32 rounded-lg overflow-hidden border border-slate-200">
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
                      className="block w-full text-sm text-slate-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:bg-gray-50 file:text-gray-700
                        hover:file:bg-gray-100"
                    />
                    <p className="text-xs text-slate-400">*การอัพโหลดรูปใหม่จะแทนที่รูปเดิมทั้งหมด</p>
                  </div>
                ) : (
                  (selectedJob.documentImageUrls && selectedJob.documentImageUrls.length > 0) ? (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedJob.documentImageUrls.map((url, index) => (
                        <div key={index} className="relative w-full h-32 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.open(url, '_blank')}>
                          <img 
                            src={url} 
                            alt={`Document ${index}`} 
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" 
                          />
                        </div>
                      ))}
                    </div>
                  ) : selectedJob.documentImageUrl ? (
                    <div className="relative w-full h-48 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.open(selectedJob.documentImageUrl, '_blank')}>
                      <img 
                        src={selectedJob.documentImageUrl} 
                        alt="Document" 
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" 
                      />
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400 italic text-center py-4">ไม่มีรูปภาพเอกสาร</div>
                  )
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                      isDark ? 'bg-dark-bg hover:bg-white/10 text-dark-text' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="flex-1 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-accent-primary to-accent-secondary hover:brightness-110 transition-all shadow-lg shadow-purple-500/25"
                  >
                    💾 บันทึก
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleDelete}
                    className="flex-1 py-3 rounded-xl font-medium text-red-500 bg-red-50 hover:bg-red-100 transition-all"
                  >
                    🗑️ ลบ
                  </button>
                  <button
                    onClick={handleEditClick}
                    className="flex-1 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-accent-primary to-accent-secondary hover:brightness-110 transition-all shadow-lg shadow-purple-500/25"
                  >
                    ✏️ แก้ไข
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className={`text-3xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            ข้อมูลงานวิ่ง
          </h2>
          <p className={isDark ? 'text-dark-muted' : 'text-light-muted'}>
            จัดการและค้นหาประวัติงานวิ่งทั้งหมด
          </p>
        </div>
      </header>

      {/* Filter Toggle Button + Export Buttons Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            hasActiveFilters 
              ? 'bg-accent-primary text-white' 
              : isDark 
                ? 'bg-dark-card border border-dark-muted/30 hover:bg-white/5' 
                : 'bg-light-card border border-light-muted/20 hover:bg-black/5 shadow-sm'
          }`}
        >
          <Filter size={18} />
          <span className="font-medium">ตัวกรอง</span>
          {hasActiveFilters && (
            <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full">
              {[filters.month, filters.year, filters.driver, filters.vehicleType, filters.licensePlate].filter(Boolean).length}
            </span>
          )}
          <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
        
        {/* Export Buttons */}
        <div className="flex gap-2">
          <button 
            onClick={exportCSV} 
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium border ${
              isDark 
                ? 'bg-dark-card border-dark-muted/30 hover:bg-accent-primary hover:text-white hover:border-accent-primary' 
                : 'bg-light-card border-light-muted/30 hover:bg-accent-primary hover:text-white hover:border-accent-primary shadow-sm'
            }`}
          >
            <Download size={16} /> CSV
          </button>
          <button 
            onClick={() => generatePDFReport(false)} 
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium border ${
              isDark 
                ? 'bg-dark-card border-dark-muted/30 hover:bg-accent-danger hover:text-white hover:border-accent-danger' 
                : 'bg-light-card border-light-muted/30 hover:bg-accent-danger hover:text-white hover:border-accent-danger shadow-sm'
            }`}
          >
            <Download size={16} /> PDF
          </button>
          <button 
            onClick={() => generatePDFReport(true)} 
            className="flex items-center gap-2 bg-accent-secondary text-white px-3 py-2 rounded-lg hover:brightness-110 transition-colors text-sm font-medium shadow-lg shadow-accent-secondary/20"
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className={`p-6 rounded-2xl border animate-fade-in ${
          isDark ? 'bg-dark-card border-dark-muted/20' : 'bg-light-card border-light-muted/20 shadow-lg'
        }`}>
          <div className="flex flex-wrap gap-4">
            {/* Month Filter */}
            <div className="flex-1 min-w-[140px]">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>เดือน</label>
              <select
                value={filters.month || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, month: e.target.value ? parseInt(e.target.value) : null }))}
                className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-dark-bg border-dark-muted/30 text-dark-text' : 'bg-light-bg border-light-muted/30 text-light-text'}`}
              >
                <option value="">ทั้งหมด</option>
                {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            {/* Year Filter */}
            <div className="flex-1 min-w-[120px]">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>ปี</label>
              <select
                value={filters.year || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, year: e.target.value ? parseInt(e.target.value) : null }))}
                className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-dark-bg border-dark-muted/30 text-dark-text' : 'bg-light-bg border-light-muted/30 text-light-text'}`}
              >
                <option value="">ทั้งหมด</option>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {/* Driver Filter */}
            <div className="flex-1 min-w-[150px]">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>คนขับ</label>
              <select
                value={filters.driver}
                onChange={(e) => setFilters(prev => ({ ...prev, driver: e.target.value }))}
                className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-dark-bg border-dark-muted/30 text-dark-text' : 'bg-light-bg border-light-muted/30 text-light-text'}`}
              >
                <option value="">ทั้งหมด</option>
                {appData?.options.drivers.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Vehicle Type Filter */}
            <div className="flex-1 min-w-[140px]">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>ประเภทรถ</label>
              <select
                value={filters.vehicleType}
                onChange={(e) => setFilters(prev => ({ ...prev, vehicleType: e.target.value }))}
                className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-dark-bg border-dark-muted/30 text-dark-text' : 'bg-light-bg border-light-muted/30 text-light-text'}`}
              >
                <option value="">ทั้งหมด</option>
                {appData?.options.vehicleTypes.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            {/* License Plate Filter */}
            <div className="flex-1 min-w-[140px]">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>ป้ายทะเบียน</label>
              <select
                value={filters.licensePlate}
                onChange={(e) => setFilters(prev => ({ ...prev, licensePlate: e.target.value }))}
                className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-dark-bg border-dark-muted/30 text-dark-text' : 'bg-light-bg border-light-muted/30 text-light-text'}`}
              >
                <option value="">ทั้งหมด</option>
                {appData?.options.licensePlates.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Clear Button */}
            {hasActiveFilters && (
              <div className="flex items-end">
                <button onClick={clearFilters} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-danger/10 text-accent-danger hover:bg-accent-danger/20">
                  <X size={16} /> ล้าง
                </button>
              </div>
            )}
          </div>
        </div>
      )}


      {/* Table Container */}
      <div className={`rounded-2xl border shadow-xl overflow-hidden ${
        isDark ? 'bg-dark-card border-dark-muted/10' : 'bg-light-card border-light-muted/10'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className={`uppercase font-medium ${isDark ? 'bg-slate-900/50 text-accent-primary' : 'bg-slate-100 text-accent-primary'}`}>
              <tr>
                <th className="px-2 py-2 md:px-6 md:py-4 text-xs md:text-sm whitespace-nowrap">วันที่</th>
                <th className="px-2 py-2 md:px-4 md:py-4 text-xs md:text-sm whitespace-nowrap w-[210px] md:w-[250px]">เส้นทาง</th>
                <th className="px-2 py-2 md:px-3 md:py-4 text-xs md:text-sm text-center whitespace-nowrap w-[70px] md:w-[80px]">รอบ</th>
                <th className="px-2 py-2 md:px-6 md:py-4 text-xs md:text-sm whitespace-nowrap">รถ / ทะเบียน</th>
                <th className="px-2 py-2 md:px-6 md:py-4 text-xs md:text-sm whitespace-nowrap">คนขับ</th>
                <th className="px-2 py-2 md:px-3 md:py-4 text-xs md:text-sm whitespace-nowrap w-[130px] md:w-[150px]">Job / Inv</th>
                <th className="px-2 py-2 md:px-3 md:py-4 text-xs md:text-sm text-right whitespace-nowrap w-[110px] md:w-[130px]">ค่าน้ำมัน/ทางด่วน</th>
                {isAdmin && (
                  <>
                    <th className="px-2 py-2 md:px-6 md:py-4 text-xs md:text-sm text-right whitespace-nowrap">ราคาลูกค้า</th>
                    <th className="px-2 py-2 md:px-6 md:py-4 text-xs md:text-sm text-right whitespace-nowrap">ราคารถร่วม</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-dark-muted/10' : 'divide-light-muted/10'}`}>
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 9 : 7} className={`text-center py-10 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                    Loading data...
                  </td>
                </tr>
              ) : filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 9 : 7} className={`text-center py-10 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                    ไม่พบข้อมูล
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
                  <tr 
                    key={job.id} 
                    onClick={() => handleRowClick(job)}
                    className={`transition-colors cursor-pointer ${isDark ? 'hover:bg-white/5' : 'hover:bg-accent-primary/5'}`}
                  >
                    <td className={`px-2 py-2 md:px-6 md:py-4 font-medium whitespace-nowrap text-xs md:text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {formatDate(job.date)}
                    </td>
                    <td className="px-2 py-2 md:px-4 md:py-4 w-[210px] md:w-[250px]">
                      <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-1 text-accent-secondary text-xs md:text-sm break-words">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-secondary shrink-0"></span>
                          {job.pickupLocation}
                        </span>
                        <span className="flex items-center gap-1 text-accent-warning text-xs md:text-sm break-words">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-warning shrink-0"></span>
                          {job.dropoffLocation}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 md:px-3 md:py-4 text-center w-[70px] md:w-[80px]">
                      <span className={`inline-block px-2 py-0.5 md:px-3 md:py-1 rounded-lg text-xs md:text-sm font-bold ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                        {job.rounds}
                      </span>
                    </td>
                    <td className="px-2 py-2 md:px-6 md:py-4">
                      <div className={`text-xs md:text-sm whitespace-nowrap ${isDark ? 'text-white' : 'text-slate-900'}`}>{job.licensePlate}</div>
                      <div className={`text-[10px] md:text-xs whitespace-nowrap ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>{job.vehicleType}</div>
                    </td>
                    <td className={`px-2 py-2 md:px-6 md:py-4 text-xs md:text-sm whitespace-nowrap ${isDark ? 'text-dark-text' : 'text-light-text'}`}>
                      {job.driverName}
                    </td>
                    <td className="px-2 py-2 md:px-3 md:py-4 w-[130px] md:w-[150px]">
                      <div className={`font-medium text-xs md:text-sm break-words ${isDark ? 'text-white' : 'text-slate-900'}`}>{job.jobNo || '-'}</div>
                      <div className={`text-[10px] md:text-xs break-words ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>{job.invNo || '-'}</div>
                    </td>
                    <td className={`px-2 py-2 md:px-3 md:py-4 text-right text-xs md:text-sm whitespace-nowrap w-[110px] md:w-[130px] ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {job.fuelAndToll !== null && job.fuelAndToll !== undefined && job.fuelAndToll !== ''
                        ? Number(job.fuelAndToll).toLocaleString()
                        : '-'}
                    </td>
                    {isAdmin && (
                      <>
                        <td className={`px-2 py-2 md:px-6 md:py-4 text-right text-xs md:text-sm whitespace-nowrap ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          {job.customerPrice ? job.customerPrice.toLocaleString() : '-'}
                        </td>
                        <td className={`px-2 py-2 md:px-6 md:py-4 text-right text-xs md:text-sm whitespace-nowrap ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          {job.jointPrice ? job.jointPrice.toLocaleString() : '-'}
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {isDetailModalOpen && renderDetailModal()}

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
        confirmText="ตกลง"
        showCancel={false}
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
