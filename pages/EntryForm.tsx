import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { JobEntry, OptionCategory } from '../types';
import { addJob, addOption, getTodayJobById, RevisionConflictError, syncTodayJobToJobs, triggerTodayJobNotification, updateTodayJob, uploadImages } from '../services/firebaseService';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Save, Loader2, Camera, X, Image as ImageIcon, FileText } from 'lucide-react';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { formatDate } from '../utils/formatters';
import { FirebaseError } from 'firebase/app';

type DriverEntryRouteState = {
  fromTodayJob?: {
    id?: string;
    jobNo?: string;
    invNo?: string;
    transportDocNo?: string;
    workOrderNo?: string;
    date?: string;
    pickupLocation?: string;
    dropoffLocation?: string;
    vehicleType?: string;
    licensePlate?: string;
    driverName?: string;
    rounds?: number;
    productName?: string;
  };
};

const toPositiveRounds = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.round(parsed);
};

const parseRoundsFromQuantity = (value?: string): number => {
  const match = (value || '').match(/(\d+(\.\d+)?)/);
  if (!match) return 1;
  return toPositiveRounds(match[1]);
};

const toImageUrls = (urls?: string[], single?: string): string[] => {
  if (Array.isArray(urls) && urls.length > 0) {
    return urls.filter((url) => typeof url === 'string' && url.trim().length > 0);
  }
  if (typeof single === 'string' && single.trim().length > 0) {
    return [single.trim()];
  }
  return [];
};

const mergeImageUrls = (existing: string[], incoming: string[]): string[] => {
  const normalized = [...existing, ...incoming]
    .filter((url) => typeof url === 'string' && url.trim().length > 0)
    .map((url) => url.trim());
  return Array.from(new Set(normalized));
};

type EntryFormData = Omit<JobEntry, 'id' | 'timestamp' | 'originImageUrl' | 'destinationImageUrl'>;

const EntryForm: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { data } = useData();
  const { user, userProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isDriverEntryMode = location.pathname === '/driver/entry';
  const isDark = false;
  const isAdmin = userProfile?.role === 'admin';
  const driverFullName =
    userProfile?.fullName?.trim() ||
    userProfile?.displayName?.trim() ||
    '';
  const queryParams = new URLSearchParams(location.search);
  const queryJobId = queryParams.get('jobId') || '';
  const routeState = (location.state || null) as DriverEntryRouteState | null;
  const fromTodayJob = routeState?.fromTodayJob;
  const sourceJobId = fromTodayJob?.id || queryJobId;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dirtyFieldsRef = useRef<Set<keyof EntryFormData>>(new Set());
  
  // Origin Image State (รูปภาพต้นทาง)
  const [originImages, setOriginImages] = useState<File[]>([]);
  const [originPreviews, setOriginPreviews] = useState<string[]>([]);
  const [existingOriginImageUrls, setExistingOriginImageUrls] = useState<string[]>([]);
  const [originImagesTouched, setOriginImagesTouched] = useState(false);
  const originFileInputRef = useRef<HTMLInputElement>(null);
  
  // Destination Image State (รูปภาพปลายทาง)
  const [destinationImages, setDestinationImages] = useState<File[]>([]);
  const [destinationPreviews, setDestinationPreviews] = useState<string[]>([]);
  const [existingDestinationImageUrls, setExistingDestinationImageUrls] = useState<string[]>([]);
  const [destinationImagesTouched, setDestinationImagesTouched] = useState(false);
  const destinationFileInputRef = useRef<HTMLInputElement>(null);

  // Document Image State (รูปภาพเอกสาร)
  const [documentImages, setDocumentImages] = useState<File[]>([]);
  const [documentPreviews, setDocumentPreviews] = useState<string[]>([]);
  const [existingDocumentImageUrls, setExistingDocumentImageUrls] = useState<string[]>([]);
  const [documentImagesTouched, setDocumentImagesTouched] = useState(false);
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

  // Helper to get local date string YYYY-MM-DD
  const getLocalDate = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const local = new Date(now.getTime() - offset);
    return local.toISOString().split('T')[0];
  };

  // Form State
  const [formData, setFormData] = useState<EntryFormData>({
    date: getLocalDate(),
    pickupLocation: '',
    dropoffLocation: '',
    rounds: 1,
    productName: 'Inverter',
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
    jointPrice: '' as any
  });

  const applyTodayJobData = (payload?: {
    jobNo?: string;
    invNo?: string;
    transportDocNo?: string;
    workOrderNo?: string;
    date?: string;
    pickupLocation?: string;
    dropoffLocation?: string;
    vehicleType?: string;
    licensePlate?: string;
    driverName?: string;
    rounds?: number;
    productName?: string;
    remarks?: string;
    fuelAndToll?: number | null;
  }) => {
    if (!payload) return;
    const dirtyFields = dirtyFieldsRef.current;
    setFormData((prev) => {
      const next = { ...prev };

      const tryAssignText = (field: keyof EntryFormData, value?: string) => {
        const normalized = (value || '').trim();
        if (!normalized || dirtyFields.has(field)) return;
        (next as Record<string, unknown>)[field] = normalized;
      };

      tryAssignText('date', payload.date);
      tryAssignText('pickupLocation', payload.pickupLocation);
      tryAssignText('dropoffLocation', payload.dropoffLocation);
      tryAssignText('productName', payload.productName);
      tryAssignText('vehicleType', payload.vehicleType);
      tryAssignText('licensePlate', payload.licensePlate);
      tryAssignText('driverName', payload.driverName);
      tryAssignText('jobNo', payload.jobNo);
      tryAssignText('invNo', payload.invNo);
      tryAssignText('transportDocNo', payload.transportDocNo);
      tryAssignText('workOrderNo', payload.workOrderNo);
      tryAssignText('remarks', payload.remarks);

      if (!dirtyFields.has('rounds') && payload.rounds) {
        next.rounds = toPositiveRounds(payload.rounds);
      }

      if (!dirtyFields.has('fuelAndToll') && payload.fuelAndToll !== undefined) {
        next.fuelAndToll = payload.fuelAndToll === null ? '' as any : payload.fuelAndToll;
      }

      return next;
    });
  };

  useEffect(() => {
    if (!isDriverEntryMode) return;
    dirtyFieldsRef.current.clear();
    applyTodayJobData(fromTodayJob);

    if (!sourceJobId) return;

    setExistingOriginImageUrls([]);
    setExistingDestinationImageUrls([]);
    setExistingDocumentImageUrls([]);
    setOriginImagesTouched(false);
    setDestinationImagesTouched(false);
    setDocumentImagesTouched(false);

    let cancelled = false;
    const loadTodayJob = async () => {
      try {
        const row = await getTodayJobById(sourceJobId);
        if (!row || cancelled) return;
        setExistingOriginImageUrls(toImageUrls(row.originImageUrls, row.originImageUrl));
        setExistingDestinationImageUrls(toImageUrls(row.destinationImageUrls, row.destinationImageUrl));
        setExistingDocumentImageUrls(toImageUrls(row.documentImageUrls, row.documentImageUrl));
        applyTodayJobData({
          jobNo: row.jobNo,
          invNo: row.invNo,
          transportDocNo: row.transportDocNo,
          workOrderNo: row.workOrderNo || row.ticketNo,
          date: row.pickup?.date || '',
          pickupLocation: row.pickup?.location,
          dropoffLocation: row.delivery?.location,
          productName: row.productName || 'Inverter',
          vehicleType: row.vehicleType,
          licensePlate: row.plateNo,
          driverName: row.driverName,
          rounds: row.rounds || parseRoundsFromQuantity(row.quantity),
          remarks: row.importantNote,
          fuelAndToll: row.fuelAndToll,
        });
      } catch (error) {
        console.error('Failed to load today job for driver entry:', error);
      }
    };

    void loadTodayJob();
    return () => {
      cancelled = true;
    };
  }, [fromTodayJob, isDriverEntryMode, queryJobId, sourceJobId]);

  useEffect(() => {
    if (!isDriverEntryMode || !driverFullName) return;
    setFormData((prev) => ({
      ...prev,
      driverName: driverFullName,
    }));
  }, [driverFullName, isDriverEntryMode]);

  const locationOptions = useMemo(() => {
    const sortedLocations = Array.from(
      new Set(data.options.locations.map((item) => item.trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'th'));
    const pinnedSet = new Set(pinnedLocations);
    const pinned = sortedLocations.filter((item) => pinnedSet.has(item));
    const unpinned = sortedLocations.filter((item) => !pinnedSet.has(item));
    return [...pinned, ...unpinned];
  }, [data.options.locations, pinnedLocations]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    dirtyFieldsRef.current.add(name as keyof EntryFormData);
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

  const handleRemoveExistingOriginImage = (index: number) => {
    setExistingOriginImageUrls((prev) => prev.filter((_, i) => i !== index));
    setOriginImagesTouched(true);
  };

  const handleRemoveExistingDestinationImage = (index: number) => {
    setExistingDestinationImageUrls((prev) => prev.filter((_, i) => i !== index));
    setDestinationImagesTouched(true);
  };

  const handleRemoveExistingDocumentImage = (index: number) => {
    setExistingDocumentImageUrls((prev) => prev.filter((_, i) => i !== index));
    setDocumentImagesTouched(true);
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
      if (isDriverEntryMode) {
        if (!sourceJobId) {
          setIsSubmitting(false);
          alert('ไม่พบเลขอ้างอิงใบแจ้งงาน กรุณากลับไปเลือกงานใหม่');
          return;
        }

        const latestTodayJob = await getTodayJobById(sourceJobId);
        if (!latestTodayJob) {
          setIsSubmitting(false);
          alert('ไม่พบข้อมูลใบแจ้งงานล่าสุด กรุณากลับไปหน้า งานวันนี้ แล้วเข้าใหม่');
          return;
        }

        const pickupBase = latestTodayJob.pickup || {
          location: '',
          date: '',
          time: '',
          contact: '',
        };
        const deliveryBase = latestTodayJob.delivery || {
          location: '',
          date: '',
          time: '',
          contact: '',
        };
        const dirtyFields = dirtyFieldsRef.current;

        const fuelAndTollRaw = typeof formData.fuelAndToll === 'string'
          ? formData.fuelAndToll.trim()
          : formData.fuelAndToll;
        const fuelAndTollValue = fuelAndTollRaw === '' || fuelAndTollRaw === null || fuelAndTollRaw === undefined
          ? null
          : Number(fuelAndTollRaw);
        const nextFuelAndToll = Number.isFinite(fuelAndTollValue) ? fuelAndTollValue : null;

        const mergedWorkOrderNo = dirtyFields.has('workOrderNo')
          ? (formData.workOrderNo || '')
          : (latestTodayJob.workOrderNo || latestTodayJob.ticketNo || '');
        const mergedInvNo = dirtyFields.has('invNo')
          ? (formData.invNo || '')
          : (latestTodayJob.invNo || '');
        const mergedTransportDocNo = dirtyFields.has('transportDocNo')
          ? (formData.transportDocNo || '')
          : (latestTodayJob.transportDocNo || '');
        const mergedDriverName = dirtyFields.has('driverName')
          ? (formData.driverName || '')
          : (latestTodayJob.driverName || '');
        const mergedRounds = dirtyFields.has('rounds')
          ? toPositiveRounds(formData.rounds)
          : (latestTodayJob.rounds || parseRoundsFromQuantity(latestTodayJob.quantity));
        const currentDriverUpdateCount = Number.isFinite(Number(latestTodayJob.driverUpdateCount))
          ? Number(latestTodayJob.driverUpdateCount)
          : 0;
        const nextDriverUpdateCount = currentDriverUpdateCount + 1;
        const canMoveToReadyToClose = !!latestTodayJob.acceptedAt && nextDriverUpdateCount > 1;
        const nextReadyToClose = latestTodayJob.status === 'in_progress' ? canMoveToReadyToClose : false;
        const shouldNotifyReady = !latestTodayJob.readyToClose && nextReadyToClose;

        const storageJobId = `today_${sourceJobId}`;
        const [newOriginImageUrls, newDestinationImageUrls, newDocumentImageUrls] = await Promise.all([
          originImages.length > 0 ? uploadImages(originImages, storageJobId) : Promise.resolve([] as string[]),
          destinationImages.length > 0 ? uploadImages(destinationImages, storageJobId) : Promise.resolve([] as string[]),
          documentImages.length > 0 ? uploadImages(documentImages, storageJobId) : Promise.resolve([] as string[]),
        ]);

        const baseOriginImageUrls = originImagesTouched
          ? existingOriginImageUrls
          : toImageUrls(latestTodayJob.originImageUrls, latestTodayJob.originImageUrl);
        const baseDestinationImageUrls = destinationImagesTouched
          ? existingDestinationImageUrls
          : toImageUrls(latestTodayJob.destinationImageUrls, latestTodayJob.destinationImageUrl);
        const baseDocumentImageUrls = documentImagesTouched
          ? existingDocumentImageUrls
          : toImageUrls(latestTodayJob.documentImageUrls, latestTodayJob.documentImageUrl);

        const mergedOriginImageUrls = mergeImageUrls(
          baseOriginImageUrls,
          newOriginImageUrls
        );
        const mergedDestinationImageUrls = mergeImageUrls(
          baseDestinationImageUrls,
          newDestinationImageUrls
        );
        const mergedDocumentImageUrls = mergeImageUrls(
          baseDocumentImageUrls,
          newDocumentImageUrls
        );

        await updateTodayJob(sourceJobId, {
          jobNo: dirtyFields.has('jobNo') ? (formData.jobNo || '') : (latestTodayJob.jobNo || ''),
          ...(dirtyFields.has('invNo') || typeof latestTodayJob.invNo === 'string'
            ? { invNo: mergedInvNo }
            : {}),
          transportDocNo: mergedTransportDocNo,
          workOrderNo: mergedWorkOrderNo,
          ticketNo: mergedWorkOrderNo,
          vehicleType: dirtyFields.has('vehicleType') ? formData.vehicleType : (latestTodayJob.vehicleType || ''),
          plateNo: dirtyFields.has('licensePlate') ? formData.licensePlate : (latestTodayJob.plateNo || ''),
          driverName: driverFullName || mergedDriverName || latestTodayJob.assignedToName || '',
          rounds: mergedRounds,
          productName: dirtyFields.has('productName')
            ? (formData.productName || 'Inverter')
            : (latestTodayJob.productName || 'Inverter'),
          driverUpdateCount: nextDriverUpdateCount,
          fuelAndToll: dirtyFields.has('fuelAndToll') ? nextFuelAndToll : (latestTodayJob.fuelAndToll ?? null),
          readyToClose: nextReadyToClose,
          readyToCloseAt: nextReadyToClose ? Date.now() : null,
          pickup: {
            ...pickupBase,
            date: dirtyFields.has('date')
              ? (formData.date || '')
              : (pickupBase.date || formData.date),
            location: dirtyFields.has('pickupLocation')
              ? (formData.pickupLocation || '')
              : (pickupBase.location || ''),
          },
          delivery: {
            ...deliveryBase,
            location: dirtyFields.has('dropoffLocation')
              ? (formData.dropoffLocation || '')
              : (deliveryBase.location || ''),
          },
          importantNote: dirtyFields.has('remarks')
            ? formData.remarks
            : (latestTodayJob.importantNote || ''),
          originImageUrls: mergedOriginImageUrls,
          originImageUrl: mergedOriginImageUrls[0] || '',
          destinationImageUrls: mergedDestinationImageUrls,
          destinationImageUrl: mergedDestinationImageUrls[0] || '',
          documentImageUrls: mergedDocumentImageUrls,
          documentImageUrl: mergedDocumentImageUrls[0] || '',
          lastSavedAt: Date.now(),
          updatedByUid: user?.uid || latestTodayJob.updatedByUid || '',
        }, latestTodayJob.revision);
        await syncTodayJobToJobs(sourceJobId);
        if (shouldNotifyReady) {
          try {
            // Notify admin only when job becomes "ready to close" for the first time.
            await triggerTodayJobNotification('ready', sourceJobId);
          } catch (notifyError) {
            console.error('Notify ready event failed:', notifyError);
          }
        }

        setExistingOriginImageUrls(mergedOriginImageUrls);
        setExistingDestinationImageUrls(mergedDestinationImageUrls);
        setExistingDocumentImageUrls(mergedDocumentImageUrls);
        setOriginImagesTouched(false);
        setDestinationImagesTouched(false);
        setDocumentImagesTouched(false);
        handleRemoveAllOriginImages();
        handleRemoveAllDestinationImages();
        handleRemoveAllDocumentImages();

        setIsSubmitting(false);
        setShowSuccessModal(true);
        window.setTimeout(() => {
          setShowSuccessModal(false);
          navigate('/driver/today', { replace: true });
        }, 900);
        return;
      }

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
        productName: 'Inverter',
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
        jointPrice: '' as any
      });
      dirtyFieldsRef.current.clear();
      handleRemoveAllOriginImages();
      handleRemoveAllDestinationImages();
      handleRemoveAllDocumentImages();
    } catch (error) {
      setIsSubmitting(false);
      console.error('Failed to save:', error);
      if (error instanceof RevisionConflictError) {
        alert(error.message);
        return;
      }
      if (error instanceof FirebaseError) {
        alert(`เกิดข้อผิดพลาดในการบันทึก: ${error.code}`);
      } else {
        alert('เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่');
      }
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
          [OptionCategory.EMPLOYER_COMPANY]: null,
          [OptionCategory.PRODUCT_TYPE]: 'productName',
          [OptionCategory.CONTACT]: null,
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
      productName: 'ประเภทสินค้า',
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
      jointPrice: 'ราคาจ่ายรถร่วม'
    };

    const hiddenFields = new Set<string>();
    if (!isAdmin) {
      hiddenFields.add('customerPrice');
      hiddenFields.add('jointPrice');
    }
    if (isDriverEntryMode) {
      hiddenFields.add('jobNo');
    }

    const data = Object.entries(formData)
      .filter(([key]) => !hiddenFields.has(key))
      .map(([key, value]) => ({
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

  const inputClass = isDriverEntryMode
    ? 'driver-clay-input w-full rounded-xl px-4 py-3 text-light-text transition-all focus:outline-none'
    : `w-full border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-primary transition-all ${
        isDark
          ? 'bg-dark-bg border-dark-muted/30 text-dark-text placeholder-dark-muted/50'
          : 'bg-light-bg border-light-muted/30 text-light-text placeholder-light-muted/50'
      }`;

  const pageClass = isDriverEntryMode ? 'driver-clay rounded-[28px] p-2 sm:p-3' : '';
  const headerTitleClass = isDriverEntryMode ? 'text-3xl font-black text-slate-700' : `text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`;
  const headerTextClass = isDriverEntryMode ? 'driver-clay-muted' : isDark ? 'text-dark-muted' : 'text-light-muted';
  const mutedTextClass = isDriverEntryMode ? 'driver-clay-muted' : isDark ? 'text-dark-muted' : 'text-light-muted';
  const uploadButtonClass = isDriverEntryMode
    ? 'driver-clay-btn driver-clay-btn-info w-full'
    : `w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all ${
        isDark
          ? 'bg-dark-bg border-dark-muted/30 text-dark-text hover:border-accent-primary'
          : 'bg-light-bg border-light-muted/30 text-light-text hover:border-accent-primary'
      }`;
  const submitButtonClass = isDriverEntryMode
    ? 'driver-clay-btn driver-clay-btn-primary rounded-xl px-8 py-3 font-bold'
    : 'flex items-center gap-2 bg-gradient-to-r from-accent-primary to-accent-secondary hover:brightness-110 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-accent-primary/25 disabled:opacity-50 disabled:cursor-not-allowed';
  const formClass = isDriverEntryMode
    ? 'driver-clay-card space-y-6 rounded-3xl border p-6 shadow-2xl sm:p-8'
    : `space-y-6 rounded-3xl border p-8 shadow-2xl ${
        isDark ? 'bg-dark-card border-dark-muted/10' : 'bg-light-card border-light-muted/10'
      }`;
  const embeddedFormClass = `space-y-6 rounded-2xl border p-4 shadow-sm sm:p-6 ${
    isDark ? 'bg-dark-card border-dark-muted/10' : 'bg-light-card border-light-muted/10'
  }`;

  return (
    <div className={embedded ? 'w-full' : `mx-auto max-w-4xl ${pageClass}`}>
      {!embedded && (
        <header className="mb-8">
          <h2 className={`${headerTitleClass} mb-2`}>
            {isDriverEntryMode ? 'บันทึกหน้างาน' : 'บันทึกงานวิ่งรถ'}
          </h2>
          <p className={headerTextClass}>
            {isDriverEntryMode ? 'อัปเดตข้อมูลหน้างานจากใบแจ้งงานที่ได้รับมอบหมาย' : 'กรอกข้อมูลงานวิ่งรถใหม่ลงในระบบ'}
          </p>
        </header>
      )}

      <form onSubmit={handleSubmitClick} className={embedded ? embeddedFormClass : formClass}>
        {isDriverEntryMode ? (
          <div className="driver-clay-soft space-y-3 rounded-2xl border p-4">
            <DisplayRow label="เลขที่ใบสั่งงาน (Work Order)" value={formData.workOrderNo || '-'} isDark={isDark} isDriverStyle={isDriverEntryMode} />
            <DisplayRow label="วันที่ (Date)" value={formatDate(formData.date || '-')} isDark={isDark} isDriverStyle={isDriverEntryMode} />
            <DisplayRow label="สถานที่รับ (Pickup)" value={formData.pickupLocation || '-'} isDark={isDark} isDriverStyle={isDriverEntryMode} />
            <DisplayRow label="สถานที่ส่ง (Dropoff)" value={formData.dropoffLocation || '-'} isDark={isDark} isDriverStyle={isDriverEntryMode} />
            <DisplayRow label="ประเภทสินค้า (Product)" value={formData.productName || 'Inverter'} isDark={isDark} isDriverStyle={isDriverEntryMode} />
            <DisplayRow label="ประเภทรถ (Type)" value={formData.vehicleType || '-'} isDark={isDark} isDriverStyle={isDriverEntryMode} />
            <DisplayRow label="ป้ายทะเบียน (Plate)" value={formData.licensePlate || '-'} isDark={isDark} isDriverStyle={isDriverEntryMode} />
            <DisplayRow label="พนักงานขับรถ (Driver)" value={formData.driverName || '-'} isDark={isDark} isDriverStyle={isDriverEntryMode} />
          </div>
        ) : (
          <>
            {/* Row 1: Date & Rounds */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormGroup label="วันที่ (Date)" isDark={isDark} isDriverStyle={isDriverEntryMode}>
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
              <FormGroup label="จำนวนรอบ (Rounds)" isDark={isDark} isDriverStyle={isDriverEntryMode}>
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
                options={locationOptions}
                onChange={handleInputChange}
                onAdd={() => openAddModal(OptionCategory.LOCATION)}
                isDark={isDark}
              />
              <SelectWithAdd 
                label="สถานที่ส่ง (Dropoff)" 
                name="dropoffLocation"
                value={formData.dropoffLocation}
                options={locationOptions}
                onChange={handleInputChange}
                onAdd={() => openAddModal(OptionCategory.LOCATION)}
                isDark={isDark}
              />
            </div>

            {/* Row 3: Product & Vehicle Info */}
            <div className={`grid grid-cols-1 md:grid-cols-2 ${embedded ? 'xl:grid-cols-2' : 'xl:grid-cols-4'} gap-6`}>
              <SelectWithAdd
                label="ประเภทสินค้า (Product)"
                name="productName"
                value={formData.productName}
                options={data.options.productTypes}
                onChange={handleInputChange}
                onAdd={() => openAddModal(OptionCategory.PRODUCT_TYPE)}
                isDark={isDark}
              />
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
          </>
        )}

        {isDriverEntryMode && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormGroup label="จำนวนรอบ (Rounds)" isDark={isDark} isDriverStyle={isDriverEntryMode}>
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
            <FormGroup label="Job No." isDark={isDark} isDriverStyle={isDriverEntryMode}>
              <input
                type="text"
                name="jobNo"
                value={formData.jobNo}
                onChange={handleInputChange}
                className={inputClass}
              />
            </FormGroup>
            <FormGroup label="Invoice No." isDark={isDark} isDriverStyle={isDriverEntryMode}>
              <input
                type="text"
                name="invNo"
                value={formData.invNo}
                onChange={handleInputChange}
                className={inputClass}
              />
            </FormGroup>
            <FormGroup label="เลขที่ใบขนส่ง (Transport Doc)" isDark={isDark} isDriverStyle={isDriverEntryMode}>
              <input
                type="text"
                name="transportDocNo"
                value={formData.transportDocNo}
                onChange={handleInputChange}
                className={inputClass}
              />
            </FormGroup>
          </div>
        )}

        {/* Row 4: Job & Invoice */}
        {!isDriverEntryMode && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormGroup label="Job No." isDark={isDark} isDriverStyle={isDriverEntryMode}>
              <input 
                type="text" 
                name="jobNo"
                value={formData.jobNo}
                onChange={handleInputChange}
                placeholder="e.g. JOB-001"
                className={inputClass}
              />
            </FormGroup>
            <FormGroup label="Invoice No." isDark={isDark} isDriverStyle={isDriverEntryMode}>
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
        )}

        {/* Row 4.5: Work Order & Transport Doc */}
        {!isDriverEntryMode && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormGroup label="เลขที่ใบสั่งงาน (Work Order)" isDark={isDark} isDriverStyle={isDriverEntryMode}>
              <input 
                type="text" 
                name="workOrderNo"
                value={formData.workOrderNo}
                onChange={handleInputChange}
                className={inputClass}
              />
            </FormGroup>
            <FormGroup label="เลขที่ใบขนส่ง (Transport Doc)" isDark={isDark} isDriverStyle={isDriverEntryMode}>
              <input 
                type="text" 
                name="transportDocNo"
                value={formData.transportDocNo}
                onChange={handleInputChange}
                className={inputClass}
              />
            </FormGroup>
          </div>
        )}

        {/* Row 4.6: Fuel/Toll & Admin Prices */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FormGroup label="ค่าน้ำมัน/ทางด่วน" isDark={isDark} isDriverStyle={isDriverEntryMode}>
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
              <FormGroup label="ราคาเก็บลูกค้า (Admin Only)" isDark={isDark} isDriverStyle={isDriverEntryMode}>
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
              <FormGroup label="ราคาจ่ายรถร่วม (Admin Only)" isDark={isDark} isDriverStyle={isDriverEntryMode}>
                <div className="relative">
                  <input 
                    type="number" 
                    name="jointPrice"
                    value={formData.jointPrice}
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
          <FormGroup label="รูปภาพต้นทาง (Origin Photo)" isDark={isDark} isDriverStyle={isDriverEntryMode}>
            <div className="space-y-3">
              {/* Hidden file inputs for origin */}
              <input
                ref={originFileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleOriginImageSelect}
                className="hidden"
              />
              
              {/* Existing origin images */}
              {existingOriginImageUrls.length > 0 && (
                <div className="space-y-2">
                  <span className={`text-sm ${mutedTextClass}`}>รูปที่บันทึกแล้ว {existingOriginImageUrls.length} รูป</span>
                  <div className="grid grid-cols-2 gap-3">
                    {existingOriginImageUrls.map((url, index) => (
                      <div key={`existing-origin-${index}`} className="relative overflow-hidden rounded-xl border border-dark-muted/20">
                        <img
                          src={url}
                          alt={`Existing Origin ${index + 1}`}
                          className="h-32 w-full object-cover"
                          onClick={() => window.open(url, '_blank')}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveExistingOriginImage(index)}
                          className="absolute right-2 top-2 rounded-full bg-red-500 px-2 py-1 text-[10px] font-semibold text-white shadow-lg hover:bg-red-600"
                        >
                          ลบ
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Origin image preview */}
              {originPreviews.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${mutedTextClass}`}>
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
                className={uploadButtonClass}
              >
                <Camera size={20} className="text-accent-primary" />
                <span>เพิ่มรูปภาพ</span>
              </button>
              
              <p className={`text-xs ${mutedTextClass}`}>
                รูปภาพจะถูกบีบอัดอัตโนมัติก่อนอัพโหลด
              </p>
            </div>
          </FormGroup>

          {/* Row 5.5: Image Upload - Destination (รูปภาพปลายทาง) */}
          <FormGroup label="รูปภาพปลายทาง (Destination Photo)" isDark={isDark} isDriverStyle={isDriverEntryMode}>
            <div className="space-y-3">
              {/* Hidden file inputs for destination */}
              <input
                ref={destinationFileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleDestinationImageSelect}
                className="hidden"
              />
              
              {/* Existing destination images */}
              {existingDestinationImageUrls.length > 0 && (
                <div className="space-y-2">
                  <span className={`text-sm ${mutedTextClass}`}>รูปที่บันทึกแล้ว {existingDestinationImageUrls.length} รูป</span>
                  <div className="grid grid-cols-2 gap-3">
                    {existingDestinationImageUrls.map((url, index) => (
                      <div key={`existing-destination-${index}`} className="relative overflow-hidden rounded-xl border border-dark-muted/20">
                        <img
                          src={url}
                          alt={`Existing Destination ${index + 1}`}
                          className="h-32 w-full object-cover"
                          onClick={() => window.open(url, '_blank')}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveExistingDestinationImage(index)}
                          className="absolute right-2 top-2 rounded-full bg-red-500 px-2 py-1 text-[10px] font-semibold text-white shadow-lg hover:bg-red-600"
                        >
                          ลบ
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Destination image preview */}
              {destinationPreviews.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${mutedTextClass}`}>
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
                className={uploadButtonClass}
              >
                <Camera size={20} className="text-accent-primary" />
                <span>เพิ่มรูปภาพ</span>
              </button>
              
              <p className={`text-xs ${mutedTextClass}`}>
                รูปภาพจะถูกบีบอัดอัตโนมัติก่อนอัพโหลด
              </p>
            </div>
          </FormGroup>

          {/* Row 5.8: Image Upload - Document (รูปภาพเอกสาร) */}
          <FormGroup label="รูปภาพเอกสาร (Document Photo)" isDark={isDark} isDriverStyle={isDriverEntryMode}>
            <div className="space-y-3">
              {/* Hidden file inputs for document */}
              <input
                ref={documentFileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleDocumentImageSelect}
                className="hidden"
              />
              
              {/* Existing document images */}
              {existingDocumentImageUrls.length > 0 && (
                <div className="space-y-2">
                  <span className={`text-sm ${mutedTextClass}`}>รูปที่บันทึกแล้ว {existingDocumentImageUrls.length} รูป</span>
                  <div className="grid grid-cols-2 gap-3">
                    {existingDocumentImageUrls.map((url, index) => (
                      <div key={`existing-document-${index}`} className="relative overflow-hidden rounded-xl border border-dark-muted/20">
                        <img
                          src={url}
                          alt={`Existing Document ${index + 1}`}
                          className="h-32 w-full object-cover"
                          onClick={() => window.open(url, '_blank')}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveExistingDocumentImage(index)}
                          className="absolute right-2 top-2 rounded-full bg-red-500 px-2 py-1 text-[10px] font-semibold text-white shadow-lg hover:bg-red-600"
                        >
                          ลบ
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Document image preview */}
              {documentPreviews.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${mutedTextClass}`}>
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
                className={uploadButtonClass}
              >
                <FileText size={20} className="text-accent-primary" />
                <span>เพิ่มรูปภาพ</span>
              </button>
              
              <p className={`text-xs ${mutedTextClass}`}>
                รูปภาพเอกสารประกอบงาน
              </p>
            </div>
          </FormGroup>
        </div>

        {/* Row 6: Remarks */}
        <FormGroup label="หมายเหตุ (Remarks)" isDark={isDark} isDriverStyle={isDriverEntryMode}>
          <textarea 
            name="remarks"
            value={formData.remarks}
            onChange={handleInputChange}
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </FormGroup>

        {/* Actions */}
        <div className={`pt-4 flex gap-3 ${isDriverEntryMode ? 'justify-between' : 'justify-end'}`}>
          {isDriverEntryMode && (
            <button
              type="button"
              onClick={() => navigate('/driver/today')}
              disabled={isSubmitting}
              className="driver-clay-btn driver-clay-btn-ghost rounded-xl px-8 py-3 font-bold disabled:opacity-60"
            >
              กลับ
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className={submitButtonClass}
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
              <label className={`block text-sm mb-1 ${mutedTextClass}`}>
                ชื่อรายการใหม่
              </label>
              <input 
                autoFocus
                type="text" 
                value={newOptionValue}
                onChange={(e) => setNewOptionValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveOption()}
                className={isDriverEntryMode
                  ? 'driver-clay-input w-full rounded-lg px-3 py-2 focus:outline-none'
                  : `w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-accent-secondary focus:outline-none ${
                      isDark
                        ? 'bg-dark-bg border-dark-muted/30 text-dark-text'
                        : 'bg-light-bg border-light-muted/30 text-light-text'
                    }`}
              />
           </div>
           <button 
            onClick={handleSaveOption}
            disabled={isSavingOption}
            className={`${isDriverEntryMode ? 'driver-clay-btn driver-clay-btn-primary' : 'w-full bg-accent-secondary text-white font-bold py-2 rounded-lg hover:brightness-110 transition-all'} flex items-center justify-center gap-2 ${isSavingOption ? 'opacity-70 cursor-not-allowed' : ''}`}
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
const FormGroup: React.FC<{ label: string; children: React.ReactNode; isDark: boolean; isDriverStyle?: boolean }> = ({ label, children, isDark, isDriverStyle = false }) => (
  <div className="min-w-0 flex flex-col gap-2">
    <label className={`text-sm font-medium ${isDriverStyle ? 'driver-clay-muted' : isDark ? 'text-dark-text' : 'text-light-text'}`}>{label}</label>
    {children}
  </div>
);

const DisplayRow: React.FC<{ label: string; value: string; isDark: boolean; isDriverStyle?: boolean }> = ({ label, value, isDark, isDriverStyle = false }) => (
  <div className="space-y-1">
    <p className={`text-xs font-medium ${isDriverStyle ? 'driver-clay-muted' : isDark ? 'text-dark-muted' : 'text-light-muted'}`}>{label}</p>
    <p className={`text-sm font-semibold ${isDriverStyle ? 'text-slate-700' : isDark ? 'text-dark-text' : 'text-slate-900'}`}>{value}</p>
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
  isDriverStyle?: boolean;
}> = ({ label, name, value, options, onChange, onAdd, isDark, isDriverStyle = false }) => {
  const selectClass = isDriverStyle
    ? 'driver-clay-input min-w-0 w-full appearance-none rounded-xl px-4 py-3 pr-10 text-light-text focus:outline-none'
    : `min-w-0 w-full appearance-none border rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-accent-primary transition-all ${
        isDark
          ? 'bg-dark-bg border-dark-muted/30 text-dark-text'
          : 'bg-light-bg border-light-muted/30 text-light-text'
      }`;

  const sortedOptions = useMemo(() => [...options].sort((a, b) => a.localeCompare(b, 'th')), [options]);

  return (
    <FormGroup label={label} isDark={isDark} isDriverStyle={isDriverStyle}>
      <div className="flex min-w-0 gap-2">
        <div className="relative min-w-0 flex-1">
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
          className={
            isDriverStyle
              ? 'driver-clay-btn driver-clay-btn-primary h-[46px] w-[52px] shrink-0 rounded-xl p-0'
              : `shrink-0 border p-3 rounded-xl transition-all ${
                  isDark
                    ? 'bg-dark-card border-dark-muted/30 text-accent-primary hover:bg-accent-primary hover:text-white'
                    : 'bg-light-card border-light-muted/30 text-accent-primary hover:bg-accent-primary hover:text-white'
                }`
          }
          title="เพิ่มรายการใหม่"
        >
          <Plus size={20} />
        </button>
      </div>
    </FormGroup>
  );
};

export default EntryForm;
