import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../services/dataService';
import { JobEntry, AppData } from '../types';
import { Download, Printer, Filter, X, ChevronDown, Edit2, Eye } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useData } from '../contexts/DataContext';
import ConfirmModal from '../components/ConfirmModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

  // Detail Modal State
  const [selectedJob, setSelectedJob] = useState<JobEntry | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<JobEntry | null>(null);
  
  // Confirm/Success Modal States
  const [showConfirmEdit, setShowConfirmEdit] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    setLoading(true);
    const data = await dataService.getAllData();
    setJobs(data.jobs.sort((a, b) => b.timestamp - a.timestamp));
    setLoading(false);
  };

  // Extract unique years from data
  const availableYears = useMemo(() => {
    const years = new Set<number>(jobs.map(job => new Date(job.date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [jobs]);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const jobDate = new Date(job.date);
      const jobMonth = jobDate.getMonth() + 1;
      const jobYear = jobDate.getFullYear();

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

  // Generate filter description for report (English for PDF compatibility)
  const getFilterDescriptionEN = () => {
    const parts: string[] = [];
    
    if (filters.driver) parts.push(`Driver: ${filters.driver}`);
    if (filters.licensePlate) parts.push(`Plate: ${filters.licensePlate}`);
    if (filters.vehicleType) parts.push(`Type: ${filters.vehicleType}`);
    
    if (filters.month || filters.year) {
      const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthName = filters.month ? monthNames[filters.month] : '';
      if (monthName && filters.year) {
        parts.push(`${monthName} ${filters.year}`);
      } else if (monthName) {
        parts.push(monthName);
      } else if (filters.year) {
        parts.push(`Year ${filters.year}`);
      }
    }
    
    return parts.length > 0 ? parts.join(' | ') : 'All Data';
  };

  // Handle row click
  const handleRowClick = (job: JobEntry) => {
    setSelectedJob(job);
    setEditData({ ...job });
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

  // Confirm save edit
  const confirmSaveEdit = async () => {
    setShowConfirmEdit(false);
    if (editData) {
      await dataService.deleteJob(editData.id);
      await dataService.addJob({
        date: editData.date,
        pickupLocation: editData.pickupLocation,
        dropoffLocation: editData.dropoffLocation,
        rounds: editData.rounds,
        vehicleType: editData.vehicleType,
        driverName: editData.driverName,
        licensePlate: editData.licensePlate,
        jobNo: editData.jobNo,
        invNo: editData.invNo,
        remarks: editData.remarks
      });
      await loadJobs();
      await refreshData();
      setIsDetailModalOpen(false);
      setShowSuccessModal(true);
    }
  };

  // Handle delete
  const handleDelete = () => {
    setShowConfirmDelete(true);
  };

  const confirmDelete = async () => {
    setShowConfirmDelete(false);
    if (selectedJob) {
      await dataService.deleteJob(selectedJob.id);
      await loadJobs();
      await refreshData();
      setIsDetailModalOpen(false);
    }
  };

  // Export CSV
  const exportCSV = () => {
    const headers = ["Date", "Pickup", "Dropoff", "Rounds", "Vehicle", "Plate", "Driver", "Job No", "Inv No", "Remarks"];
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + headers.join(",") + "\n"
      + filteredJobs.map(j => [
          j.date, 
          `"${j.pickupLocation}"`, 
          `"${j.dropoffLocation}"`, 
          j.rounds, 
          `"${j.vehicleType}"`, 
          j.licensePlate,
          `"${j.driverName}"`, 
          j.jobNo,
          j.invNo,
          `"${j.remarks}"`
        ].join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sfast_trucklog_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Draw bar chart on PDF
  const drawBarChart = (doc: jsPDF, data: { label: string; value: number }[], x: number, y: number, width: number, height: number, title: string) => {
    const maxVal = Math.max(...data.map(d => d.value), 1);
    const barWidth = (width - 20) / data.length;
    const colors = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];
    
    // Title
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(title, x + width / 2, y, { align: 'center' });
    
    // Draw bars
    data.forEach((item, i) => {
      const barHeight = (item.value / maxVal) * (height - 25);
      const barX = x + 10 + i * barWidth;
      const barY = y + height - barHeight - 15;
      
      // Bar
      const color = colors[i % colors.length];
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      doc.setFillColor(r, g, b);
      doc.rect(barX + 2, barY, barWidth - 4, barHeight, 'F');
      
      // Value on top
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      doc.text(item.value.toString(), barX + barWidth / 2, barY - 2, { align: 'center' });
      
      // Label - truncate if too long
      const label = item.label.length > 8 ? item.label.substring(0, 8) + '..' : item.label;
      doc.setFontSize(7);
      doc.text(label, barX + barWidth / 2, y + height - 5, { align: 'center' });
    });
  };

  // Draw pie chart on PDF
  const drawPieChart = (doc: jsPDF, data: { label: string; value: number }[], x: number, y: number, radius: number, title: string) => {
    const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
    const colors = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
    
    // Title
    doc.setFontSize(10);
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
    
    // Legend
    let legendY = y + radius + 10;
    data.forEach((item, i) => {
      const color = colors[i % colors.length];
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      
      doc.setFillColor(r, g, b);
      doc.rect(x - 25, legendY - 3, 6, 6, 'F');
      
      doc.setFontSize(7);
      doc.setTextColor(60, 60, 60);
      const pct = Math.round((item.value / total) * 100);
      const label = item.label.length > 10 ? item.label.substring(0, 10) + '..' : item.label;
      doc.text(`${label} (${pct}%)`, x - 17, legendY);
      legendY += 8;
    });
  };

  // Generate PDF Report
  const generatePDFReport = (forPrint: boolean = false) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Title
    doc.setFontSize(22);
    doc.setTextColor(124, 58, 237);
    doc.text('SFast Trucklog Report', pageWidth / 2, 22, { align: 'center' });
    
    // Subtitle with filter info
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(getFilterDescriptionEN(), pageWidth / 2, 32, { align: 'center' });
    
    // Date range
    if (filteredJobs.length > 0) {
      const dates = filteredJobs.map(j => new Date(j.date));
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text(`Period: ${minDate.toLocaleDateString('en-US')} - ${maxDate.toLocaleDateString('en-US')}`, pageWidth / 2, 40, { align: 'center' });
    }
    
    // Stats summary boxes
    const totalRounds = filteredJobs.reduce((acc, j) => acc + j.rounds, 0);
    const uniqueDrivers = new Set(filteredJobs.map(j => j.driverName)).size;
    const uniqueVehicles = new Set(filteredJobs.map(j => j.licensePlate)).size;
    
    const boxY = 48;
    const boxH = 18;
    const boxW = 40;
    const startX = 20;
    
    // Box 1 - Total Jobs
    doc.setFillColor(124, 58, 237);
    doc.roundedRect(startX, boxY, boxW, boxH, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text(filteredJobs.length.toString(), startX + boxW/2, boxY + 8, { align: 'center' });
    doc.setFontSize(8);
    doc.text('Total Jobs', startX + boxW/2, boxY + 14, { align: 'center' });
    
    // Box 2 - Total Rounds
    doc.setFillColor(14, 165, 233);
    doc.roundedRect(startX + 45, boxY, boxW, boxH, 3, 3, 'F');
    doc.text(totalRounds.toString(), startX + 45 + boxW/2, boxY + 8, { align: 'center' });
    doc.setFontSize(8);
    doc.text('Total Rounds', startX + 45 + boxW/2, boxY + 14, { align: 'center' });
    
    // Box 3 - Drivers
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(startX + 90, boxY, boxW, boxH, 3, 3, 'F');
    doc.text(uniqueDrivers.toString(), startX + 90 + boxW/2, boxY + 8, { align: 'center' });
    doc.setFontSize(8);
    doc.text('Drivers', startX + 90 + boxW/2, boxY + 14, { align: 'center' });
    
    // Box 4 - Vehicles
    doc.setFillColor(245, 158, 11);
    doc.roundedRect(startX + 135, boxY, boxW, boxH, 3, 3, 'F');
    doc.text(uniqueVehicles.toString(), startX + 135 + boxW/2, boxY + 8, { align: 'center' });
    doc.setFontSize(8);
    doc.text('Vehicles', startX + 135 + boxW/2, boxY + 14, { align: 'center' });
    
    // Charts section
    // Driver performance chart
    const driverData: { [key: string]: number } = {};
    filteredJobs.forEach(j => {
      driverData[j.driverName] = (driverData[j.driverName] || 0) + j.rounds;
    });
    const driverChartData = Object.entries(driverData)
      .map(([label, value]) => ({ label, value }))
      .slice(0, 5);
    
    if (driverChartData.length > 0) {
      drawBarChart(doc, driverChartData, 20, 75, 80, 45, 'Rounds by Driver');
    }
    
    // Vehicle type chart
    const vehicleData: { [key: string]: number } = {};
    filteredJobs.forEach(j => {
      vehicleData[j.vehicleType] = (vehicleData[j.vehicleType] || 0) + 1;
    });
    const vehicleChartData = Object.entries(vehicleData)
      .map(([label, value]) => ({ label, value }));
    
    if (vehicleChartData.length > 0) {
      drawPieChart(doc, vehicleChartData, 150, 100, 20, 'Vehicle Types');
    }
    
    // Table - English headers
    const tableColumn = ['Date', 'Route', 'Rounds', 'Vehicle/Plate', 'Driver', 'Job/Inv'];
    const tableRows = filteredJobs.map(job => [
      job.date,
      `${job.pickupLocation} > ${job.dropoffLocation}`,
      job.rounds.toString(),
      `${job.vehicleType} | ${job.licensePlate}`,
      job.driverName,
      `${job.jobNo || '-'} / ${job.invNo || '-'}`
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 130,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [124, 58, 237], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 50 },
        2: { cellWidth: 15, halign: 'center' },
        3: { cellWidth: 35 },
        4: { cellWidth: 30 },
        5: { cellWidth: 30 }
      }
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`SFast Trucklog Report - Generated: ${new Date().toLocaleString('en-US')} - Page ${i}/${pageCount}`, pageWidth / 2, 290, { align: 'center' });
    }

    if (forPrint) {
      // Open in new window and print
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(pdfUrl, '_blank');
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print();
        });
      }
    } else {
      doc.save(`sfast_trucklog_report_${new Date().toISOString().slice(0,10)}.pdf`);
    }
  };

  // Detail Modal Content
  const renderDetailModal = () => {
    if (!selectedJob || !editData) return null;

    const fields = [
      { key: 'date', label: 'วันที่', type: 'date' },
      { key: 'pickupLocation', label: 'สถานที่รับ', type: 'text' },
      { key: 'dropoffLocation', label: 'สถานที่ส่ง', type: 'text' },
      { key: 'rounds', label: 'จำนวนรอบ', type: 'number' },
      { key: 'vehicleType', label: 'ประเภทรถ', type: 'text' },
      { key: 'licensePlate', label: 'ป้ายทะเบียน', type: 'text' },
      { key: 'driverName', label: 'ชื่อคนขับ', type: 'text' },
      { key: 'jobNo', label: 'Job No.', type: 'text' },
      { key: 'invNo', label: 'Invoice No.', type: 'text' },
      { key: 'remarks', label: 'หมายเหตุ', type: 'textarea' },
    ];

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsDetailModalOpen(false)} />
        
        <div className={`relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-2xl animate-fade-in ${
          isDark ? 'bg-dark-card' : 'bg-light-card'
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {isEditing ? <Edit2 className="text-accent-primary" /> : <Eye className="text-accent-secondary" />}
              <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {isEditing ? 'แก้ไขข้อมูล' : 'รายละเอียดงาน'}
              </h3>
            </div>
            <button onClick={() => setIsDetailModalOpen(false)} className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
              <X size={20} className={isDark ? 'text-dark-muted' : 'text-light-muted'} />
            </button>
          </div>

          {/* Fields */}
          <div className="space-y-4">
            {fields.map(field => (
              <div key={field.key} className="flex flex-col gap-1">
                <label className={`text-sm font-medium ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                  {field.label}
                </label>
                {isEditing ? (
                  field.type === 'textarea' ? (
                    <textarea
                      value={editData[field.key as keyof JobEntry] as string}
                      onChange={(e) => handleEditChange(field.key as keyof JobEntry, e.target.value)}
                      rows={2}
                      className={`w-full border rounded-lg px-3 py-2 ${
                        isDark ? 'bg-dark-bg border-dark-muted/30 text-dark-text' : 'bg-light-bg border-light-muted/30 text-light-text'
                      }`}
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={editData[field.key as keyof JobEntry] as string | number}
                      onChange={(e) => handleEditChange(field.key as keyof JobEntry, field.type === 'number' ? parseInt(e.target.value) : e.target.value)}
                      className={`w-full border rounded-lg px-3 py-2 ${
                        isDark ? 'bg-dark-bg border-dark-muted/30 text-dark-text' : 'bg-light-bg border-light-muted/30 text-light-text'
                      }`}
                    />
                  )
                ) : (
                  <div className={`px-3 py-2 rounded-lg ${isDark ? 'bg-dark-bg' : 'bg-light-bg'}`}>
                    <span className={isDark ? 'text-dark-text' : 'text-light-text'}>
                      {selectedJob[field.key as keyof JobEntry] || '-'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            {isEditing ? (
              <>
                <button
                  onClick={() => setIsEditing(false)}
                  className={`flex-1 py-3 rounded-xl font-medium ${
                    isDark ? 'bg-dark-bg hover:bg-white/10 text-dark-text' : 'bg-light-bg hover:bg-black/5 text-light-text'
                  }`}
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-accent-primary to-accent-secondary hover:brightness-110"
                >
                  บันทึก
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleDelete}
                  className="flex-1 py-3 rounded-xl font-medium text-accent-danger bg-accent-danger/10 hover:bg-accent-danger/20"
                >
                  ลบ
                </button>
                <button
                  onClick={handleEditClick}
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-accent-primary to-accent-secondary hover:brightness-110"
                >
                  แก้ไข
                </button>
              </>
            )}
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
                <th className="px-6 py-4">วันที่</th>
                <th className="px-6 py-4">เส้นทาง</th>
                <th className="px-6 py-4 text-center">รอบ</th>
                <th className="px-6 py-4">รถ / ทะเบียน</th>
                <th className="px-6 py-4">คนขับ</th>
                <th className="px-6 py-4">Job / Inv</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-dark-muted/10' : 'divide-light-muted/10'}`}>
              {loading ? (
                <tr>
                  <td colSpan={6} className={`text-center py-10 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                    Loading data...
                  </td>
                </tr>
              ) : filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`text-center py-10 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
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
                    <td className={`px-6 py-4 font-medium whitespace-nowrap ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {job.date}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-1 text-accent-secondary">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-secondary"></span>
                          {job.pickupLocation}
                        </span>
                        <span className="flex items-center gap-1 text-accent-warning">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-warning"></span>
                          {job.dropoffLocation}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-block px-3 py-1 rounded-lg text-sm font-bold ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                        {job.rounds}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={isDark ? 'text-white' : 'text-slate-900'}>{job.licensePlate}</div>
                      <div className={`text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>{job.vehicleType}</div>
                    </td>
                    <td className={`px-6 py-4 ${isDark ? 'text-dark-text' : 'text-light-text'}`}>
                      {job.driverName}
                    </td>
                    <td className="px-6 py-4">
                      <div className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{job.jobNo || '-'}</div>
                      <div className={`text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>{job.invNo || '-'}</div>
                    </td>
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