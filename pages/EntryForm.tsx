import React, { useState, useRef, useMemo } from 'react';
import { JobEntry, OptionCategory } from '../types';
import { addJob, addOption } from '../services/firebaseService';
import { useData } from '../contexts/DataContext';
import { Plus, Save, Loader2, Camera, X, Image as ImageIcon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { formatDate } from '../utils/formatters';

const EntryForm: React.FC = () => {
  const { theme } = useTheme();
  const { data } = useData();
  const isDark = theme === 'dark';
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Image State
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
  const [formData, setFormData] = useState<Omit<JobEntry, 'id' | 'timestamp' | 'imageUrl'>>({
    date: getLocalDate(),
    pickupLocation: '',
    dropoffLocation: '',
    rounds: 1,
    vehicleType: '',
    driverName: '',
    licensePlate: '',
    jobNo: '',
    invNo: '',
    remarks: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'rounds' ? parseInt(value) || 0 : value
    }));
  };

  // Image handling
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
        return;
      }
      
      setSelectedImage(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
      // Use Firebase service directly
      await addJob(formData, selectedImage || undefined);
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
        remarks: ''
      });
      handleRemoveImage();
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
      remarks: 'หมายเหตุ'
    };

    const data = Object.entries(formData).map(([key, value]) => ({
      label: labels[key] || key,
      value: key === 'date' ? formatDate(String(value)) : String(value)
    }));

    // Add image info if selected
    if (selectedImage) {
      data.push({
        label: 'รูปภาพ',
        value: `${selectedImage.name} (${(selectedImage.size / 1024 / 1024).toFixed(2)} MB)`
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

        {/* Row 5: Image Upload */}
        <FormGroup label="รูปภาพ (Photo)" isDark={isDark}>
          <div className="space-y-3">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"

              onChange={handleImageSelect}
              className="hidden"
            />
            
            {/* Image preview or upload button */}
            {imagePreview ? (
              <div className="relative inline-block">
                <img 
                  src={imagePreview} 
                  alt="Preview" 
                  className="max-h-48 rounded-xl border border-dark-muted/20"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors shadow-lg"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                    isDark
                      ? 'bg-dark-bg border-dark-muted/30 text-dark-text hover:border-accent-primary'
                      : 'bg-light-bg border-light-muted/30 text-light-text hover:border-accent-primary'
                  }`}
                >
                  <Camera size={20} className="text-accent-primary" />
                  <span>ถ่ายรูป / เลือกรูป</span>
                </button>
              </div>
            )}
            
            <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
              รูปภาพจะถูกบีบอัดอัตโนมัติก่อนอัพโหลด (สูงสุด 10MB)
            </p>
          </div>
        </FormGroup>

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
        imagePreview={imagePreview}
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