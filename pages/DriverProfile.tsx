import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AtSign,
  BellOff,
  BellRing,
  Camera,
  Contact,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Save,
  Shield,
  User,
  UserCircle2,
  X,
} from 'lucide-react';
import { FirebaseError } from 'firebase/app';
import { useAuth } from '../contexts/AuthContext';
import { ensureUserProfileDocument, updateUserProfile, uploadUserProfileImage } from '../services/userService';
import { getStoredPushToken, isPushDisabledForUser, registerPushTokenForUser, unregisterPushTokenForUser } from '../services/pushService';
import ConfirmModal from '../components/ConfirmModal';

type ProfileFormState = {
  fullName: string;
  nickname: string;
  phoneNumber: string;
  lineUserId: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  address: string;
  personalNote: string;
};

type CropMeta = {
  src: string;
  width: number;
  height: number;
};

const CROP_BOX_SIZE = 280;
const OUTPUT_SIZE = 720;

const emptyForm = (): ProfileFormState => ({
  fullName: '',
  nickname: '',
  phoneNumber: '',
  lineUserId: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  address: '',
  personalNote: '',
});

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const loadImageMeta = (dataUrl: string): Promise<CropMeta> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        src: dataUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => reject(new Error('อ่านรูปภาพไม่สำเร็จ'));
    image.src = dataUrl;
  });

const readFileAsDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const DriverProfile: React.FC = () => {
  const { user, userProfile, refreshProfile } = useAuth();

  const [form, setForm] = useState<ProfileFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [successModal, setSuccessModal] = useState<{ open: boolean; message: string }>({
    open: false,
    message: '',
  });
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const [isPushEnabledOnDevice, setIsPushEnabledOnDevice] = useState(false);

  const [cropMeta, setCropMeta] = useState<CropMeta | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropXRatio, setCropXRatio] = useState(0);
  const [cropYRatio, setCropYRatio] = useState(0);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [syncingGooglePhoto, setSyncingGooglePhoto] = useState(false);
  const [autoGoogleSyncTried, setAutoGoogleSyncTried] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startXRatio: number;
    startYRatio: number;
  } | null>(null);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);

  useEffect(() => {
    if (!userProfile) return;

    setForm({
      fullName: userProfile.fullName || '',
      nickname: userProfile.nickname || '',
      phoneNumber: formatPhone(userProfile.phoneNumber || ''),
      lineUserId: userProfile.lineUserId || '',
      emergencyContactName: userProfile.emergencyContactName || '',
      emergencyContactPhone: formatPhone(userProfile.emergencyContactPhone || ''),
      address: userProfile.address || '',
      personalNote: userProfile.personalNote || '',
    });

    const storedToken = getStoredPushToken();
    const hasTokenOnProfile = !!storedToken && (userProfile.fcmTokens || []).includes(storedToken);
    const pushDisabled = !!userProfile.uid && isPushDisabledForUser(userProfile.uid);
    setIsPushEnabledOnDevice(!pushDisabled && hasTokenOnProfile);
    setPushMessage('');
    setProfileError('');
  }, [userProfile]);

  useEffect(() => {
    if (!user?.uid || !userProfile || syncingGooglePhoto || autoGoogleSyncTried) return;
    if (userProfile.photoURL) return;

    setSyncingGooglePhoto(true);
    user.reload()
      .then(() => {
        const googleProviderPhoto = (user.providerData || [])
          .find((provider) => provider.providerId === 'google.com')
          ?.photoURL
          ?.trim();
        const fallbackPhoto = user.photoURL?.trim();
        const resolvedPhoto = googleProviderPhoto || fallbackPhoto || '';
        if (!resolvedPhoto) return false;

        return updateUserProfile(user.uid, {
          photoURL: resolvedPhoto,
          profileUpdatedAt: Date.now(),
        }).then(() => true);
      })
      .then((didUpdate) => {
        if (didUpdate) {
          return refreshProfile();
        }
        return undefined;
      })
      .catch((error) => {
        console.error('Sync Google photo to profile failed:', error);
      })
      .finally(() => {
        setAutoGoogleSyncTried(true);
        setSyncingGooglePhoto(false);
      });
  }, [autoGoogleSyncTried, refreshProfile, syncingGooglePhoto, user, userProfile]);

  useEffect(() => {
    setAutoGoogleSyncTried(false);
  }, [user?.uid]);

  useEffect(() => {
    if (!successModal.open) return;
    const timer = window.setTimeout(() => {
      setSuccessModal({ open: false, message: '' });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [successModal.open]);

  const cropLayout = useMemo(() => {
    if (!cropMeta) return null;

    const baseScale = Math.max(CROP_BOX_SIZE / cropMeta.width, CROP_BOX_SIZE / cropMeta.height);
    const scale = baseScale * cropZoom;
    const displayW = cropMeta.width * scale;
    const displayH = cropMeta.height * scale;
    const maxPanX = Math.max(0, (displayW - CROP_BOX_SIZE) / 2);
    const maxPanY = Math.max(0, (displayH - CROP_BOX_SIZE) / 2);

    return {
      scale,
      displayW,
      displayH,
      maxPanX,
      maxPanY,
      panX: cropXRatio * maxPanX,
      panY: cropYRatio * maxPanY,
    };
  }, [cropMeta, cropZoom, cropXRatio, cropYRatio]);

  const handleField = (field: keyof ProfileFormState, value: string) => {
    if (field === 'phoneNumber' || field === 'emergencyContactPhone') {
      setForm((prev) => ({ ...prev, [field]: formatPhone(value) }));
      return;
    }

    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!user?.uid) return;

    setSaving(true);
    try {
      const resolvedDisplayName =
        form.nickname.trim() ||
        form.fullName.trim() ||
        userProfile?.displayName?.trim() ||
        user?.email?.split('@')[0] ||
        `user-${user.uid.slice(0, 6)}`;

      await updateUserProfile(user.uid, {
        fullName: form.fullName.trim(),
        displayName: resolvedDisplayName,
        nickname: form.nickname.trim(),
        phoneNumber: formatPhone(form.phoneNumber),
        lineUserId: form.lineUserId.trim(),
        emergencyContactName: form.emergencyContactName.trim(),
        emergencyContactPhone: formatPhone(form.emergencyContactPhone),
        address: form.address.trim(),
        personalNote: form.personalNote.trim(),
        profileUpdatedAt: Date.now(),
      });

      await refreshProfile();
      setSuccessModal({
        open: true,
        message: 'อัปเดตข้อมูลโปรไฟล์เรียบร้อยแล้ว',
      });
    } catch (error) {
      console.error('Save driver profile failed:', error);
      alert('บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSaving(false);
    }
  };

  const handleEnablePush = async () => {
    if (!user?.uid || pushLoading) return;

    setPushLoading(true);
    try {
      const result = await registerPushTokenForUser(user.uid);
      setPushMessage(result.message);
      setIsPushEnabledOnDevice(result.ok);
      await refreshProfile();
    } catch (error) {
      console.error('Enable push failed:', error);
      setPushMessage('เปิด Push ไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setPushLoading(false);
    }
  };

  const handleDisablePush = async () => {
    if (!user?.uid || pushLoading) return;

    setPushLoading(true);
    try {
      const result = await unregisterPushTokenForUser(user.uid);
      setPushMessage(result.message);
      setIsPushEnabledOnDevice(false);
      await refreshProfile();
    } catch (error) {
      console.error('Disable push failed:', error);
      setPushMessage('ปิด Push ไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setPushLoading(false);
    }
  };

  const handleBootstrapProfile = async () => {
    if (!user) return;

    setBootstrapping(true);
    setProfileError('');
    try {
      await ensureUserProfileDocument(user);
      await refreshProfile();
    } catch (error) {
      console.error('Bootstrap profile failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      setProfileError(`ยังสร้างโปรไฟล์ไม่สำเร็จ: ${message}`);
    } finally {
      setBootstrapping(false);
    }
  };

  const openPhotoPicker = () => {
    fileInputRef.current?.click();
  };

  const handlePickPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('รองรับเฉพาะไฟล์รูปภาพ');
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await readFileAsDataURL(file);
      const meta = await loadImageMeta(dataUrl);
      setCropMeta(meta);
      setCropZoom(1);
      setCropXRatio(0);
      setCropYRatio(0);
    } catch (error) {
      console.error('Prepare crop image failed:', error);
      alert('เปิดรูปเพื่อครอปไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      event.target.value = '';
    }
  };

  const handleCancelCrop = () => {
    if (uploadingPhoto) return;

    dragStateRef.current = null;
    setIsDraggingCrop(false);
    setCropMeta(null);
    setCropZoom(1);
    setCropXRatio(0);
    setCropYRatio(0);
  };

  const handleCropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropLayout || uploadingPhoto) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startXRatio: cropXRatio,
      startYRatio: cropYRatio,
    };
    setIsDraggingCrop(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCropPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !cropLayout) return;

    if (cropLayout.maxPanX > 0) {
      const deltaX = event.clientX - dragState.startX;
      const nextXRatio = dragState.startXRatio + deltaX / cropLayout.maxPanX;
      setCropXRatio(clamp(nextXRatio, -1, 1));
    }

    if (cropLayout.maxPanY > 0) {
      const deltaY = event.clientY - dragState.startY;
      const nextYRatio = dragState.startYRatio + deltaY / cropLayout.maxPanY;
      setCropYRatio(clamp(nextYRatio, -1, 1));
    }
  };

  const handleCropPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    dragStateRef.current = null;
    setIsDraggingCrop(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleUploadCroppedPhoto = async () => {
    if (!user?.uid || !cropMeta || !cropLayout) return;

    setUploadingPhoto(true);
    try {
      const image = new Image();
      image.src = cropMeta.src;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('โหลดรูปเพื่อครอปไม่สำเร็จ'));
      });

      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('ไม่สามารถครอปรูปได้');

      const left = (CROP_BOX_SIZE - cropLayout.displayW) / 2 + cropLayout.panX;
      const top = (CROP_BOX_SIZE - cropLayout.displayH) / 2 + cropLayout.panY;
      const sx = (0 - left) / cropLayout.scale;
      const sy = (0 - top) / cropLayout.scale;
      const sWidth = CROP_BOX_SIZE / cropLayout.scale;
      const sHeight = CROP_BOX_SIZE / cropLayout.scale;

      ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (!result) {
            reject(new Error('สร้างไฟล์รูปไม่สำเร็จ'));
            return;
          }
          resolve(result);
        }, 'image/jpeg', 0.92);
      });

      const croppedFile = new File([blob], `profile_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const imageUrl = await uploadUserProfileImage(user.uid, croppedFile);

      await updateUserProfile(user.uid, {
        photoURL: imageUrl,
        profileUpdatedAt: Date.now(),
      });
      await refreshProfile();

      dragStateRef.current = null;
      setIsDraggingCrop(false);
      setCropMeta(null);
      setSuccessModal({
        open: true,
        message: 'อัปเดตรูปโปรไฟล์เรียบร้อยแล้ว',
      });
    } catch (error) {
      console.error('Upload profile image failed:', error);
      if (error instanceof FirebaseError) {
        alert(`อัปเดตรูปโปรไฟล์ไม่สำเร็จ: ${error.code}`);
      } else if (error instanceof Error) {
        alert(`อัปเดตรูปโปรไฟล์ไม่สำเร็จ: ${error.message}`);
      } else {
        alert('อัปเดตรูปโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
      setUploadingPhoto(false);
    }
  };

  const cardClass = 'driver-clay-card';
  const inputClass = 'driver-clay-input px-3 py-2.5 text-sm';
  const iconClass = 'driver-clay-muted';

  if (!userProfile) {
    return (
      <section className={`${cardClass} p-5`}>
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-slate-700">กำลังโหลดข้อมูลโปรไฟล์</p>
          <p className="driver-clay-muted">
            ถ้ายังไม่ขึ้น ให้กดโหลดอีกครั้งหรือสร้างโปรไฟล์ผู้ใช้ใหม่
          </p>
          {profileError && (
            <p className="rounded-xl bg-red-500/10 px-3 py-2 text-red-500">{profileError}</p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={refreshProfile}
              className="driver-clay-btn driver-clay-btn-ghost"
            >
              โหลดอีกครั้ง
            </button>
            <button
              type="button"
              onClick={handleBootstrapProfile}
              disabled={bootstrapping}
              className="driver-clay-btn driver-clay-btn-info"
            >
              {bootstrapping ? <Loader2 size={16} className="animate-spin" /> : null}
              สร้างโปรไฟล์ใหม่
            </button>
          </div>
        </div>
      </section>
    );
  }

  const profileName =
    form.nickname.trim() ||
    form.fullName.trim() ||
    userProfile.displayName ||
    userProfile.email ||
    '-';
  const avatarFallback = (profileName || 'U').trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-4">
      <section className={`${cardClass} overflow-hidden p-1`}>
        <div className="mx-3 mt-3 rounded-[1.35rem] border border-white/85 bg-[#e8ecf1] px-5 py-4 text-[#34495e] shadow-[6px_6px_12px_rgba(166,180,200,0.35),-6px_-6px_12px_rgba(255,255,255,0.9)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/90 bg-[#aec6cf] text-[#5d8aa8] shadow-[4px_4px_8px_rgba(166,180,200,0.35),-4px_-4px_8px_rgba(255,255,255,0.9)]">
              <UserCircle2 size={24} />
            </div>
            <div>
              <p className="text-sm font-black tracking-tight text-[#34495e]">โปรไฟล์พนักงาน</p>
              <p className="text-xs font-semibold text-[#7f8c9a]">แก้ไขข้อมูลส่วนตัวและตั้งค่าแจ้งเตือน</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="driver-clay-soft p-4">
            <div className="flex flex-col items-center gap-3 text-center">
              {userProfile.photoURL ? (
                <img
                  src={userProfile.photoURL}
                  alt={profileName || 'profile'}
                  className="h-36 w-36 rounded-full border-4 border-white object-cover shadow-[10px_10px_22px_rgba(181,188,220,0.45),-8px_-8px_20px_rgba(255,255,255,0.95)]"
                />
              ) : (
                <div className="flex h-36 w-36 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-[#95c8ff] to-[#ffd5e8] text-5xl font-black text-slate-700 shadow-[10px_10px_22px_rgba(181,188,220,0.45),-8px_-8px_20px_rgba(255,255,255,0.95)]">
                  {avatarFallback}
                </div>
              )}

              <div className="space-y-1">
                <p className="text-base font-black text-slate-700">{profileName}</p>
                <p className="driver-clay-muted max-w-full break-all text-xs">
                  {userProfile.email}
                </p>
              </div>

              <button
                type="button"
                onClick={openPhotoPicker}
                disabled={uploadingPhoto || syncingGooglePhoto}
                className="driver-clay-btn driver-clay-btn-primary"
              >
                {uploadingPhoto ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
                เปลี่ยนรูปโปรไฟล์
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePickPhoto}
            className="hidden"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="driver-clay-soft space-y-1 p-3 text-sm">
              <span className="driver-clay-muted">อีเมล</span>
              <div className="flex items-center gap-2 px-1">
                <Mail size={15} className={iconClass} />
                <span className="break-all font-semibold text-slate-700">{userProfile.email}</span>
              </div>
            </div>
            <div className="driver-clay-soft space-y-1 p-3 text-sm">
              <span className="driver-clay-muted">สิทธิ์</span>
              <div className="flex items-center gap-2 px-1">
                <Shield size={15} className={iconClass} />
                <span className="font-semibold text-slate-700">{userProfile.role === 'admin' ? 'แอดมิน' : 'พนักงาน'}</span>
              </div>
            </div>
            <div className="driver-clay-soft space-y-1 p-3 text-sm sm:col-span-2">
              <span className="driver-clay-muted">รหัสพนักงาน</span>
              <div className="flex items-center gap-2 px-1">
                <Shield size={14} className={iconClass} />
                <span className="font-semibold text-slate-700">{userProfile.employeeCode || '-'}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="driver-clay-muted">ชื่อ-นามสกุลจริง</span>
              <div className="relative">
                <User size={14} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`} />
                <input className={`${inputClass} pl-8`} value={form.fullName} onChange={(e) => handleField('fullName', e.target.value)} />
              </div>
            </label>

            <label className="space-y-1 text-sm">
              <span className="driver-clay-muted">ชื่อเล่น</span>
              <div className="relative">
                <UserCircle2 size={14} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`} />
                <input className={`${inputClass} pl-8`} value={form.nickname} onChange={(e) => handleField('nickname', e.target.value)} />
              </div>
            </label>

            <label className="space-y-1 text-sm">
              <span className="driver-clay-muted">LINE ID</span>
              <div className="relative">
                <AtSign size={14} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`} />
                <input className={`${inputClass} pl-8`} value={form.lineUserId} onChange={(e) => handleField('lineUserId', e.target.value)} />
              </div>
            </label>

            <label className="space-y-1 text-sm">
              <span className="driver-clay-muted">เบอร์โทรศัพท์</span>
              <div className="relative">
                <Phone size={14} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`} />
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"
                  className={`${inputClass} pl-8`}
                  value={form.phoneNumber}
                  onChange={(e) => handleField('phoneNumber', e.target.value)}
                  placeholder="080-123-4567"
                />
              </div>
            </label>

            <label className="space-y-1 text-sm">
              <span className="driver-clay-muted">ผู้ติดต่อฉุกเฉิน</span>
              <div className="relative">
                <Contact size={14} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`} />
                <input
                  className={`${inputClass} pl-8`}
                  value={form.emergencyContactName}
                  onChange={(e) => handleField('emergencyContactName', e.target.value)}
                />
              </div>
            </label>

            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="driver-clay-muted">เบอร์ฉุกเฉิน</span>
              <div className="relative">
                <Phone size={14} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`} />
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"
                  className={`${inputClass} pl-8`}
                  value={form.emergencyContactPhone}
                  onChange={(e) => handleField('emergencyContactPhone', e.target.value)}
                  placeholder="080-123-4567"
                />
              </div>
            </label>
          </div>

          <label className="space-y-1 text-sm">
            <span className="driver-clay-muted">ที่อยู่</span>
            <div className="relative">
              <MapPin size={14} className={`pointer-events-none absolute left-3 top-3 ${iconClass}`} />
              <textarea rows={2} className={`${inputClass} pl-8`} value={form.address} onChange={(e) => handleField('address', e.target.value)} />
            </div>
          </label>

          <label className="space-y-1 text-sm">
            <span className="driver-clay-muted">ข้อมูลเพิ่มเติม / ประวัติย่อ</span>
            <div className="relative">
              <FileText size={14} className={`pointer-events-none absolute left-3 top-3 ${iconClass}`} />
              <textarea rows={3} className={`${inputClass} pl-8`} value={form.personalNote} onChange={(e) => handleField('personalNote', e.target.value)} />
            </div>
          </label>

          <div className="driver-clay-soft p-3">
            <div className="mb-2 flex items-center gap-2">
              <Contact size={15} className={iconClass} />
              <p className="text-sm font-semibold text-slate-700">การแจ้งเตือน Push (อุปกรณ์นี้)</p>
            </div>
            <div className="driver-clay-input mb-2 rounded-xl px-3 py-2 text-sm text-slate-700">
              สถานะ: {isPushEnabledOnDevice ? 'เปิดแล้ว' : 'ยังไม่เปิด'}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleEnablePush}
                disabled={pushLoading}
                className="driver-clay-btn driver-clay-btn-info"
              >
                {pushLoading ? <Loader2 size={16} className="animate-spin" /> : <BellRing size={16} />}
                เปิด Push
              </button>
              <button
                type="button"
                onClick={handleDisablePush}
                disabled={pushLoading}
                className="driver-clay-btn driver-clay-btn-ghost"
              >
                <BellOff size={16} />
                ปิด Push
              </button>
            </div>
            {pushMessage && (
              <p className="driver-clay-muted mt-2 text-xs">{pushMessage}</p>
            )}
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="driver-clay-btn driver-clay-btn-primary w-full"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            บันทึกโปรไฟล์
          </button>
        </div>
      </section>

      {cropMeta && cropLayout && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center">
          <div className="modal-clay-backdrop absolute inset-0" onClick={handleCancelCrop} />
          <div className="modal-clay-panel relative w-full max-w-md rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="modal-clay-title text-sm font-semibold">ครอปรูปโปรไฟล์</p>
              <button
                type="button"
                onClick={handleCancelCrop}
                disabled={uploadingPhoto}
                className="modal-clay-close h-8 w-8 rounded-lg p-1.5"
              >
                <X size={16} />
              </button>
            </div>

            <div
              className={`relative mx-auto overflow-hidden rounded-2xl border touch-none select-none ${
                cropLayout.maxPanX > 0 || cropLayout.maxPanY > 0
                  ? (isDraggingCrop ? 'cursor-grabbing' : 'cursor-grab')
                  : 'cursor-default'
              } driver-clay-soft`}
              style={{ width: CROP_BOX_SIZE, height: CROP_BOX_SIZE }}
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerUp}
              onPointerCancel={handleCropPointerUp}
            >
              <img
                src={cropMeta.src}
                alt="crop"
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: `${cropMeta.width}px`,
                  height: `${cropMeta.height}px`,
                  transform: `translate(calc(-50% + ${cropLayout.panX}px), calc(-50% + ${cropLayout.panY}px)) scale(${cropLayout.scale})`,
                  transformOrigin: 'center center',
                }}
              />
              <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-white/85" />
            </div>

            <div className="mt-4 space-y-3">
              <p className="driver-clay-muted text-[11px]">
                ลากรูปในกรอบเพื่อจัดตำแหน่งได้โดยตรง
              </p>
              <label className="block text-xs">
                <span className="driver-clay-muted">ซูม</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={cropZoom}
                  onChange={(e) => setCropZoom(Number(e.target.value))}
                  className="mt-1 w-full"
                />
              </label>

              <label className="block text-xs">
                <span className="driver-clay-muted">เลื่อนซ้าย-ขวา</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={Math.round(cropXRatio * 100)}
                  onChange={(e) => setCropXRatio(Number(e.target.value) / 100)}
                  className="mt-1 w-full"
                />
              </label>

              <label className="block text-xs">
                <span className="driver-clay-muted">เลื่อนบน-ล่าง</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={Math.round(cropYRatio * 100)}
                  onChange={(e) => setCropYRatio(Number(e.target.value) / 100)}
                  className="mt-1 w-full"
                />
              </label>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCancelCrop}
                disabled={uploadingPhoto}
                className="driver-clay-btn driver-clay-btn-ghost"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleUploadCroppedPhoto}
                disabled={uploadingPhoto}
                className="driver-clay-btn driver-clay-btn-primary"
              >
                {uploadingPhoto ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
                ใช้รูปนี้
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={successModal.open}
        onClose={() => setSuccessModal({ open: false, message: '' })}
        onConfirm={() => setSuccessModal({ open: false, message: '' })}
        title="บันทึกสำเร็จ"
        message={successModal.message}
        type="success"
        showCancel={false}
        showConfirm={false}
      />
    </div>
  );
};

export default DriverProfile;
