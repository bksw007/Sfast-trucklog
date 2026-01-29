import React, { useState, useRef, useMemo } from 'react';
import { JobEntry, OptionCategory } from '../types';
import { addJob, addOption } from '../services/firebaseService';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Save, Loader2, Camera, X, Image as ImageIcon, FileText } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { formatDate } from '../utils/formatters';

const EntryForm: React.FC = () => {
  const { theme } = useTheme();
  const { data } = useData();
  const { userProfile } = useAuth();
  const isDark = theme === 'dark';
  const isAdmin = userProfile?.role === 'admin';
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Origin Image State (รูปภาพต้นทาง)
  const [originImages, setOriginImages] = useState<File[]>([]);
  const [originPreviews, setOriginPreviews] = useState<string[]>([]);
  const originFileInputRef = useRef<HTMLInputElement>(null);
  
  // Destination Image State (รูปภาพปลายทาง)
  const [destinationImages, setDestinationImages] = useState<File[]>([]);
  const [destinationPreviews, setDestinationPreviews] = useState<string[]>([]);
  const destinationFileInputRef = useRef<HTMLInputElement>(null);

  // Document Image State (รูปภาพเอกสาร)
  const [documentImages, setDocumentImages] = useState<File[]>([]);
  const [documentPreviews, setDocumentPreviews] = useState<string[]>([]);
  const documentFileInputRef = useRef<HTMLInputElement>(null);
  
  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState<OptionCategory | null>(null);
  const [newOptionValue, setNewOptionValue] = useState('');
  const [isSavingOption, setIsSavingOption] = useState(false);
  const [showOptionSuccess, setShowOptionSuccess] = useState(false);
  
  // Confirm Modal States
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Helper to get local date string YYYY-MM-DD
  const getLocalDate = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const local = new Date(now.getTime() - offset);
    return local.toISOString().split('T')[0];
  };

  // Form State
  const [formData, setFormData] = useState<Omit<JobEntry, 'id' | 'timestamp' | 'originImageUrl' | 'destinationImageUrl'>>({
    date: getLocalDate(),
    pickupLocation: '',
    dropoffLocation: '',
    rounds: 1,
    vehicleType: '',
    driverName: '',
    licensePlate: '',
    workOrderNo: '',
    transportDocNo: '',
    fuelAndToll: '' as any,
    remarks: '',
    customerPrice: '' as any,
    driverPrice: '' as any
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'rounds' ? parseInt(value) || 0 : value
    }));
  };

  // Origin Image handling (รูปภาพต้นทาง)
  const handleOriginImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    
    setOriginImages(prev => [...prev, ...imageFiles]);
    
    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setOriginPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveOriginImage = (index: number) => {
    setOriginImages(prev => prev.filter((_, i) => i !== index));
    setOriginPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveAllOriginImages = () => {
    setOriginImages([]);
    setOriginPreviews([]);
    if (originFileInputRef.current) {
      originFileInputRef.current.value = '';
    }
  };
  
  // Destination Image handling (รูปภาพปลายทาง)
  const handleDestinationImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    
    setDestinationImages(prev => [...prev, ...imageFiles]);
    
    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setDestinationPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveDestinationImage = (index: number) => {
    setDestinationImages(prev => prev.filter((_, i) => i !== index));
    setDestinationPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveAllDestinationImages = () => {
    setDestinationImages([]);
    setDestinationPreviews([]);
    if (destinationFileInputRef.current) {
      destinationFileInputRef.current.value = '';
    }
  };

  // Document Image handling (รูปภาพเอกสาร)
  const handleDocumentImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    
    setDocumentImages(prev => [...prev, ...imageFiles]);
    
    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setDocumentPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveDocumentImage = (index: number) => {
    setDocumentImages(prev => prev.filter((_, i) => i !== index));
    setDocumentPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveAllDocumentImages = () => {
    setDocumentImages([]);
    setDocumentPreviews([]);
    if (documentFileInputRef.current) {
      documentFileInputRef.current.value = '';
    }
  };

  const handleSubmitClick = (e: React.FormEvent) => {
    e.preventDefault();
    // Show confirmation modal
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirmModal(false);
    setIsSubmitting(true);
    
    try {
      // Use Firebase service with multiple images
      await addJob(
        formData, 
        originImages, 
        destinationImages, 
        documentImages
      );
      setIsSubmitting(false);
      
      // Show success modal
      setShowSuccessModal(true);
      // Auto close after 1.5s
      setTimeout(() => setShowSuccessModal(false), 1500);
      
      // Reset form for next entry
      setFormData({
        date: getLocalDate(),
        pickupLocation: '',
        dropoffLocation: '',
        rounds: 1,
        vehicleType: '',
        driverName: '',
        licensePlate: '',
        jobNo: '',
        invNo: '',
        workOrderNo: '',
        transportDocNo: '',
        fuelAndToll: '' as any,
        remarks: '',
        customerPrice: '' as any,
        driverPrice: '' as any
      });
      handleRemoveAllOriginImages();
      handleRemoveAllDestinationImages();
      handleRemoveAllDocumentImages();
    } catch (error) {
      setIsSubmitting(false);
      console.error('Failed to save:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่');
    }
  };

  const openAddModal = (category: OptionCategory) => {
    setModalCategory(category);
    setNewOptionValue('');
    setIsAddModalOpen(true);
  };

  const handleSaveOption = async () => {
    if (modalCategory && newOptionValue.trim() && !isSavingOption) {
      setIsSavingOption(true);
      
      try {
        await addOption(modalCategory, newOptionValue.trim());
        
        const fieldMap: Record<OptionCategory, keyof typeof formData | null> = {
          [OptionCategory.LOCATION]: null,
          [OptionCategory.VEHICLE]: 'vehicleType',
          [OptionCategory.DRIVER]: 'driverName',
          [OptionCategory.PLATE]: 'licensePlate',
        };
        
        const fieldName = fieldMap[modalCategory];
        if (fieldName) {
          setFormData(prev => ({...prev, [fieldName]: newOptionValue.trim()}));
        }
        setIsAddModalOpen(false);
        setShowOptionSuccess(true);
        // Auto close after 1.5s
        setTimeout(() => setShowOptionSuccess(false), 1500);
      } catch (error) {
        console.error('Failed to save option:', error);
      } finally {
        setIsSavingOption(false);
      }
    }
  };

  // Prepare confirmation data
  const getConfirmData = () => {
    const labels: Record<string, string> = {
      date: 'วันที่',
      pickupLocation: 'สถานที่รับ',
      dropoffLocation: 'สถานที่ส่ง',
      rounds: 'จำนวนรอบ',
      vehicleType: 'ประเภทรถ',
      driverName: 'พนักงานขับรถ',
      licensePlate: 'ป้ายทะเบียน',
      jobNo: 'Job No.',
      invNo: 'Invoice No.',
      workOrderNo: 'เลขที่ใบสั่งงาน',
      transportDocNo: 'เลขที่ใบขนส่ง',
      fuelAndToll: 'ค่าน้ำมัน/ทางด่วน',
      remarks: 'หมายเหตุ',
      customerPrice: 'ราคาเก็บลูกค้า',
      driverPrice: 'ราคาจ่ายรถร่วม'
    };

    const data = Object.entries(formData).map(([key, value]) => ({
      label: labels[key] || key,
      value: key === 'date' ? formatDate(String(value)) : String(value)
    }));

    // Add origin image info if selected
    if (originImages.length > 0) {
      data.push({
        label: 'รูปภาพต้นทาง',
        value: `${originImages.length} รูป`
      });
    }
    
    // Add destination image info if selected
    if (destinationImages.length > 0) {
      data.push({
        label: 'รูปภาพปลายทาง',
        value: `${destinationImages.length} รูป`
      });
    }

    // Add document image info
    if (documentImages.length > 0) {
      data.push({
        label: 'รูปภาพเอกสาร',
        value: `${documentImages.length} รูป`
      });
    }

    return data;
  };

  if (!data) return (
    <div className="p-10 flex justify-center">
      <Loader2 className="animate-spin text-accent-primary" />
    </div>
  );

  const inputClass = `w-full border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-primary transition-all ${
    isDark 
      ? 'bg-dark-bg border-dark-muted/30 text-dark-text placeholder-dark-muted/50' 
      : 'bg-light-bg border-light-muted/30 text-light-text placeholder-light-muted/50'
  }`;

  return (
    <div className="max-w-4xl mx-auto">
       <header className="mb-8">
        <h2 className={`text-3xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
          บันทึกงานวิ่งรถ
        </h2>
        <p className={isDark ? 'text-dark-muted' : 'text-light-muted'}>
          กรอกข้อมูลงานวิ่งรถใหม่ลงในระบบ
        </p>
      </header>

      <form onSubmit={handleSubmitClick} className={`p-8 rounded-3xl border shadow-2xl space-y-6 ${
        isDark ? 'bg-dark-card border-dark-muted/10' : 'bg-light-card border-light-muted/10'
      }`}>
        
        {/* Row 1: Date & Rounds */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormGroup label="วันที่ (Date)" isDark={isDark}>
            <div className="relative">
              <input 
                type="date" 
                name="date"
                required
                value={formData.date}
                onChange={handleInputChange}
                className={`${inputClass} cursor-pointer dark:[color-scheme:dark]`}
                onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
              />
            </div>
          </FormGroup>
          <FormGroup label="จำนวนรอบ (Rounds)" isDark={isDark}>
            <input 
              type="number" 
              name="rounds"
              min="1"
              required
              value={formData.rounds}
              onChange={handleInputChange}
              className={inputClass}
            />
          </FormGroup>
        </div>

        {/* Row 2: Locations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SelectWithAdd 
            label="สถานที่รับ (Pickup)" 
            name="pickupLocation"
            value={formData.pickupLocation}
            options={data.options.locations}
            onChange={handleInputChange}
            onAdd={() => openAddModal(OptionCategory.LOCATION)}
            isDark={isDark}
          />
          <SelectWithAdd 
            label="สถานที่ส่ง (Dropoff)" 
            name="dropoffLocation"
            value={formData.dropoffLocation}
            options={data.options.locations}
            onChange={handleInputChange}
            onAdd={() => openAddModal(OptionCategory.LOCATION)}
            isDark={isDark}
          />
        </div>

        {/* Row 3: Vehicle Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SelectWithAdd 
            label="ประเภทรถ (Type)" 
            name="vehicleType"
            value={formData.vehicleType}
            options={data.options.vehicleTypes}
            onChange={handleInputChange}
            onAdd={() => openAddModal(OptionCategory.VEHICLE)}
            isDark={isDark}
          />
          <SelectWithAdd 
            label="ป้ายทะเบียน (Plate)" 
            name="licensePlate"
            value={formData.licensePlate}
            options={data.options.licensePlates}
            onChange={handleInputChange}
            onAdd={() => openAddModal(OptionCategory.PLATE)}
            isDark={isDark}
          />
           <SelectWithAdd 
            label="พนักงานขับรถ (Driver)" 
            name="driverName"
            value={formData.driverName}
            options={data.options.drivers}
            onChange={handleInputChange}
            onAdd={() => openAddModal(OptionCategory.DRIVER)}
            isDark={isDark}
          />
        </div>

        {/* Row 4: Job & Invoice */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <FormGroup label="Job No." isDark={isDark}>
            <input 
              type="text" 
              name="jobNo"
              value={formData.jobNo}
              onChange={handleInputChange}
              placeholder="e.g. JOB-001"
              className={inputClass}
            />
          </FormGroup>
          <FormGroup label="Invoice No." isDark={isDark}>
            <input 
              type="text" 
              name="invNo"
              value={formData.invNo}
              onChange={handleInputChange}
              placeholder="e.g. INV-2023-001"
              className={inputClass}
            />
          </FormGroup>
        </div>

        {/* Row 4.5: Work Order & Transport Doc */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormGroup label="เลขที่ใบสั่งงาน (Work Order)" isDark={isDark}>
            <input 
              type="text" 
              name="workOrderNo"
              value={formData.workOrderNo}
              onChange={handleInputChange}
              className={inputClass}
            />
          </FormGroup>
          <FormGroup label="เลขที่ใบขนส่ง (Transport Doc)" isDark={isDark}>
            <input 
              type="text" 
              name="transportDocNo"
              value={formData.transportDocNo}
              onChange={handleInputChange}
              className={inputClass}
            />
          </FormGroup>
        </div>

        {/* Row 4.6: Fuel/Toll & Admin Prices */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FormGroup label="ค่าน้ำมัน/ทางด่วน" isDark={isDark}>
            <input 
              type="number" 
              name="fuelAndToll"
              value={formData.fuelAndToll}
              onChange={handleInputChange}
              className={inputClass}
              placeholder="0.00"
            />
          </FormGroup>

          {isAdmin && (
            <>
              <FormGroup label="ราคาเก็บลูกค้า (Admin Only)" isDark={isDark}>
                <div className="relative">
                  <input 
                    type="number" 
                    name="customerPrice"
                    value={formData.customerPrice}
                    onChange={handleInputChange}
                    className={`${inputClass} border-accent-primary/50 bg-accent-primary/5`}
                    placeholder="0.00"
                  />
                </div>
              </FormGroup>
              <FormGroup label="ราคาจ่ายรถร่วม (Admin Only)" isDark={isDark}>
                <div className="relative">
                  <input 
                    type="number" 
                    name="driverPrice"
                    value={formData.driverPrice}
                    onChange={handleInputChange}
                    className={`${inputClass} border-red-500/30 bg-red-500/5`}
                    placeholder="0.00"
                  />
                </div>
              </FormGroup>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Row 5: Image Upload - Origin (รูปภาพต้นทาง) */}
          <FormGroup label="รูปภาพต้นทาง (Origin Photo)" isDark={isDark}>
            <div className="space-y-3">
              {/* Hidden file inputs for origin */}
              <input
                ref={originFileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={handleOriginImageSelect}
                className="hidden"
              />
              
              {/* Origin image preview */}
              {originPreviews.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                      {originPreviews.length} รูป
                    </span>
                    <button
                      type="button"
                      onClick={handleRemoveAllOriginImages}
                      className="text-xs text-red-500 hover:text-red-600"
                    >
                      ลบทั้งหมด
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {originPreviews.map((preview, index) => (
                      <div key={index} className="relative">
                        <img 
                          src={preview} 
                          alt={`Origin ${index + 1}`} 
                          className="w-full h-32 object-cover rounded-xl border border-dark-muted/20"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveOriginImage(index)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors shadow-lg"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Single button for add image */}
              <button
                type="button"
                onClick={() => originFileInputRef.current?.click()}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                  isDark
                    ? 'bg-dark-bg border-dark-muted/30 text-dark-text hover:border-accent-primary'
                    : 'bg-light-bg border-light-muted/30 text-light-text hover:border-accent-primary'
                }`}
              >
                <Camera size={20} className="text-accent-primary" />
                <span>เพิ่มรูปภาพ</span>
              </button>
              
              <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                รูปภาพจะถูกบีบอัดอัตโนมัติก่อนอัพโหลด
              </p>
            </div>
          </FormGroup>

          {/* Row 5.5: Image Upload - Destination (รูปภาพปลายทาง) */}
          <FormGroup label="รูปภาพปลายทาง (Destination Photo)" isDark={isDark}>
            <div className="space-y-3">
              {/* Hidden file inputs for destination */}
              <input
                ref={destinationFileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={handleDestinationImageSelect}
                className="hidden"
              />
              
              {/* Destination image preview */}
              {destinationPreviews.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                      {destinationPreviews.length} รูป
                    </span>
                    <button
                      type="button"
                      onClick={handleRemoveAllDestinationImages}
                      className="text-xs text-red-500 hover:text-red-600"
                    >
                      ลบทั้งหมด
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {destinationPreviews.map((preview, index) => (
                      <div key={index} className="relative">
                        <img 
                          src={preview} 
                          alt={`Destination ${index + 1}`} 
                          className="w-full h-32 object-cover rounded-xl border border-dark-muted/20"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveDestinationImage(index)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors shadow-lg"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Single button for add image */}
              <button
                type="button"
                onClick={() => destinationFileInputRef.current?.click()}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                  isDark
                    ? 'bg-dark-bg border-dark-muted/30 text-dark-text hover:border-accent-primary'
                    : 'bg-light-bg border-light-muted/30 text-light-text hover:border-accent-primary'
                }`}
              >
                <Camera size={20} className="text-accent-primary" />
                <span>เพิ่มรูปภาพ</span>
              </button>
              
              <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                รูปภาพจะถูกบีบอัดอัตโนมัติก่อนอัพโหลด
              </p>
            </div>
          </FormGroup>

          {/* Row 5.8: Image Upload - Document (รูปภาพเอกสาร) */}
          <FormGroup label="รูปภาพเอกสาร (Document Photo)" isDark={isDark}>
            <div className="space-y-3">
              {/* Hidden file inputs for document */}
              <input
                ref={documentFileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={handleDocumentImageSelect}
                className="hidden"
              />
              
              {/* Document image preview */}
              {documentPreviews.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                      {documentPreviews.length} รูป
                    </span>
                    <button
                      type="button"
                      onClick={handleRemoveAllDocumentImages}
                      className="text-xs text-red-500 hover:text-red-600"
                    >
                      ลบทั้งหมด
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {documentPreviews.map((preview, index) => (
                      <div key={index} className="relative">
                        <img 
                          src={preview} 
                          alt={`Document ${index + 1}`} 
                          className="w-full h-32 object-cover rounded-xl border border-dark-muted/20"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveDocumentImage(index)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors shadow-lg"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Single button for add image */}
              <button
                type="button"
                onClick={() => documentFileInputRef.current?.click()}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                  isDark
                    ? 'bg-dark-bg border-dark-muted/30 text-dark-text hover:border-accent-primary'
                    : 'bg-light-bg border-light-muted/30 text-light-text hover:border-accent-primary'
                }`}
              >
                <FileText size={20} className="text-accent-primary" />
                <span>เพิ่มรูปภาพ</span>
              </button>
              
              <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                รูปภาพเอกสารประกอบงาน
              </p>
            </div>
          </FormGroup>
        </div>

        {/* Row 6: Remarks */}
        <FormGroup label="หมายเหตุ (Remarks)" isDark={isDark}>
          <textarea 
            name="remarks"
            value={formData.remarks}
            onChange={handleInputChange}
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </FormGroup>

        {/* Actions */}
        <div className="pt-4 flex justify-end">
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="flex items-center gap-2 bg-gradient-to-r from-accent-primary to-accent-secondary hover:brightness-110 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-accent-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Save size={20} />}
            {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
          </button>
        </div>
      </form>

      {/* Add Option Modal */}
      <Modal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)}
        title="เพิ่มรายการใหม่"
      >
        <div className="space-y-4">
           <div>
              <label className={`block text-sm mb-1 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                ชื่อรายการใหม่
              </label>
              <input 
                autoFocus
                type="text" 
                value={newOptionValue}
                onChange={(e) => setNewOptionValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveOption()}
                className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-accent-secondary focus:outline-none ${
                  isDark 
                    ? 'bg-dark-bg border-dark-muted/30 text-dark-text' 
                    : 'bg-light-bg border-light-muted/30 text-light-text'
                }`}
              />
           </div>
           <button 
            onClick={handleSaveOption}
            disabled={isSavingOption}
            className={`w-full bg-accent-secondary text-white font-bold py-2 rounded-lg hover:brightness-110 transition-all flex items-center justify-center gap-2 ${isSavingOption ? 'opacity-70 cursor-not-allowed' : ''}`}
           >
             {isSavingOption ? (
               <>
                 <Loader2 className="animate-spin" size={18} />
                 กำลังบันทึก...
               </>
             ) : (
               'ยืนยัน'
             )}
           </button>
        </div>
      </Modal>

      {/* Option Success Modal */}
      <ConfirmModal
        isOpen={showOptionSuccess}
        onClose={() => setShowOptionSuccess(false)}
        onConfirm={() => setShowOptionSuccess(false)}
        title="เพิ่มรายการสำเร็จ!"
        message="รายการใหม่ถูกบันทึกและเลือกให้อัตโนมัติแล้ว"
        type="success"
        confirmText="ตกลง"
        showCancel={false}
        showConfirm={false}
      />

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSubmit}
        title="ตรวจสอบข้อมูล"
        message="กรุณาตรวจสอบข้อมูลก่อนบันทึก"
        type="confirm"
        confirmText="ยืนยันบันทึก"
        cancelText="แก้ไข"
        data={getConfirmData()}
        imagePreview={originPreviews[0] || destinationPreviews[0]}
      />

      {/* Success Modal */}
      <ConfirmModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        onConfirm={() => setShowSuccessModal(false)}
        title="บันทึกสำเร็จ!"
        message="ข้อมูลถูกบันทึกลงระบบเรียบร้อยแล้ว"
        type="success"
        confirmText="ตกลง"
        showCancel={false}
        showConfirm={false}
      />
    </div>
  );
};

// Helper Components
const FormGroup: React.FC<{ label: string; children: React.ReactNode; isDark: boolean }> = ({ label, children, isDark }) => (
  <div className="flex flex-col gap-2">
    <label className={`text-sm font-medium ${isDark ? 'text-dark-text' : 'text-light-text'}`}>{label}</label>
    {children}
  </div>
);

const SelectWithAdd: React.FC<{
  label: string;
  name: string;
  value: string;
  options: string[];
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onAdd: () => void;
  isDark: boolean;
}> = ({ label, name, value, options, onChange, onAdd, isDark }) => {
  const selectClass = `w-full appearance-none border rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-accent-primary transition-all ${
    isDark 
      ? 'bg-dark-bg border-dark-muted/30 text-dark-text' 
      : 'bg-light-bg border-light-muted/30 text-light-text'
  }`;

  const sortedOptions = useMemo(() => [...options].sort((a, b) => a.localeCompare(b, 'th')), [options]);

  return (
    <FormGroup label={label} isDark={isDark}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <select 
            name={name}
            value={value}
            onChange={onChange}
            required
            className={selectClass}
          >
            <option value="" disabled>เลือกรายการ...</option>
            {sortedOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <button 
          type="button"
          onClick={onAdd}
          className={`border p-3 rounded-xl transition-all ${
            isDark 
              ? 'bg-dark-card border-dark-muted/30 text-accent-primary hover:bg-accent-primary hover:text-white' 
              : 'bg-light-card border-light-muted/30 text-accent-primary hover:bg-accent-primary hover:text-white'
          }`}
          title="เพิ่มรายการใหม่"
        >
          <Plus size={20} />
        </button>
      </div>
    </FormGroup>
  );
};

export default EntryForm;