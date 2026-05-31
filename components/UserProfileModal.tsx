import React, { useState, useEffect } from 'react';
import { User, Mail, Shield, Save, Loader2, BellRing, BellOff, Phone, Contact } from 'lucide-react';
import Modal from './Modal';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { updateUserProfile } from '../services/userService';
import { getStoredPushToken, isPushDisabledForUser, registerPushTokenForUser, unregisterPushTokenForUser } from '../services/pushService';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ProfileFormState = {
  nickname: string;
  employeeCode: string;
  phoneNumber: string;
  lineUserId: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  address: string;
  personalNote: string;
};

const emptyProfileForm = (): ProfileFormState => ({
  nickname: '',
  employeeCode: '',
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

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, userProfile, refreshProfile } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [displayName, setDisplayName] = useState('');
  const [profileForm, setProfileForm] = useState<ProfileFormState>(emptyProfileForm);
  const [saving, setSaving] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const [isPushEnabledOnDevice, setIsPushEnabledOnDevice] = useState(false);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);

  useEffect(() => {
    if (isOpen && userProfile) {
      setDisplayName(userProfile.displayName || '');
      setProfileForm({
        nickname: userProfile.nickname || '',
        employeeCode: userProfile.employeeCode || '',
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
      setPhotoLoadFailed(false);
    }
  }, [isOpen, userProfile]);

  const handleProfileField = (field: keyof ProfileFormState, value: string) => {
    if (field === 'phoneNumber' || field === 'emergencyContactPhone') {
      setProfileForm((prev) => ({ ...prev, [field]: formatPhone(value) }));
      return;
    }
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!user || !userProfile) return;

    setSaving(true);
    try {
      await updateUserProfile(user.uid, {
        displayName: displayName.trim(),
        nickname: profileForm.nickname.trim(),
        employeeCode: profileForm.employeeCode.trim(),
        phoneNumber: formatPhone(profileForm.phoneNumber.trim()),
        lineUserId: profileForm.lineUserId.trim(),
        emergencyContactName: profileForm.emergencyContactName.trim(),
        emergencyContactPhone: formatPhone(profileForm.emergencyContactPhone.trim()),
        address: profileForm.address.trim(),
        personalNote: profileForm.personalNote.trim(),
        profileUpdatedAt: Date.now(),
      });
      await refreshProfile();
      onClose();
    } catch (error) {
      console.error('Failed to update profile:', error);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
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

  if (!userProfile) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="ข้อมูลผู้ใช้งาน"
      panelClassName="md:max-w-4xl lg:max-w-5xl"
    >
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col items-center justify-center lg:sticky lg:top-0">
          {userProfile.photoURL && !photoLoadFailed ? (
            <div className="relative mb-3">
              <img
                src={userProfile.photoURL}
                alt={displayName}
                className="h-24 w-24 rounded-full border-4 border-accent-primary/20 object-cover shadow-xl"
                onError={() => setPhotoLoadFailed(true)}
              />
            </div>
          ) : (
            <div className="mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary shadow-lg">
              <span className="text-4xl font-bold text-white">
                {displayName.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
            สร้างเมื่อ: {new Date(userProfile.createdAt).toLocaleDateString('th-TH')}
          </div>
          {userProfile.profileUpdatedAt && (
            <div className={`text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
              อัปเดตล่าสุด: {new Date(userProfile.profileUpdatedAt).toLocaleString('th-TH')}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className={`text-sm ${isDark ? 'admin-field-label' : 'font-medium text-light-muted'}`}>
              อีเมล
            </label>
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
              isDark ? 'border-dark-muted/20 bg-dark-bg/50 text-dark-text' : 'border-light-muted/20 bg-light-bg/50 text-light-text'
            }`}>
              <Mail size={18} className="shrink-0 opacity-50" />
              <span className="min-w-0 break-all">{userProfile.email}</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className={`text-sm ${isDark ? 'admin-field-label' : 'font-medium text-light-muted'}`}>
              สิทธิ์การใช้งาน
            </label>
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
              isDark ? 'border-dark-muted/20 bg-dark-bg/50 text-dark-text' : 'border-light-muted/20 bg-light-bg/50 text-light-text'
            }`}>
              <Shield size={18} className="opacity-50" />
              <div className="flex items-center gap-2">
                <span>{userProfile.role === 'admin' ? 'แอดมิน' : 'พนักงาน'}</span>
                {userProfile.role === 'admin' && (
                  <span className="rounded-full bg-accent-primary/20 px-2 py-0.5 text-xs font-bold text-accent-primary">
                    Admin
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className={`text-sm ${isDark ? 'admin-field-label' : 'font-medium text-light-muted'}`}>
              ชื่อที่แสดง
            </label>
            <div className="relative">
              <User size={18} className={`absolute left-4 top-1/2 -translate-y-1/2 ${
                isDark ? 'text-dark-muted' : 'text-light-muted'
              }`} />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={`w-full rounded-xl border py-3 pl-11 pr-4 outline-none transition-all ${
                  isDark
                    ? 'border-dark-muted/30 bg-dark-bg text-dark-text focus:border-accent-primary'
                    : 'border-light-muted/30 bg-light-bg text-light-text focus:border-accent-primary'
                }`}
                placeholder="ระบุชื่อที่ต้องการแสดง"
              />
            </div>
          </div>

          <div className={`rounded-2xl border p-4 ${
            isDark ? 'border-dark-muted/25 bg-dark-bg/45' : 'border-light-muted/25 bg-light-bg/60'
          }`}>
            <div className="mb-3 flex items-center gap-2">
              <Contact size={16} className={isDark ? 'text-dark-muted' : 'text-light-muted'} />
              <p className={`text-sm ${isDark ? 'admin-field-label' : 'font-semibold text-light-text'}`}>
                ประวัติส่วนตัว
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <input
                value={profileForm.nickname}
                onChange={(e) => handleProfileField('nickname', e.target.value)}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${
                  isDark
                    ? 'border-dark-muted/30 bg-dark-bg/60 text-dark-text focus:border-accent-primary'
                    : 'border-light-muted/30 bg-white text-light-text focus:border-accent-primary'
                }`}
                placeholder="ชื่อเล่น"
              />
              <input
                value={profileForm.employeeCode}
                onChange={(e) => handleProfileField('employeeCode', e.target.value)}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${
                  isDark
                    ? 'border-dark-muted/30 bg-dark-bg/60 text-dark-text focus:border-accent-primary'
                    : 'border-light-muted/30 bg-white text-light-text focus:border-accent-primary'
                }`}
                placeholder="รหัสพนักงาน"
              />
              <div className="relative">
                <Phone size={15} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`} />
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"
                  value={profileForm.phoneNumber}
                  onChange={(e) => handleProfileField('phoneNumber', e.target.value)}
                  className={`w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none ${
                    isDark
                      ? 'border-dark-muted/30 bg-dark-bg/60 text-dark-text focus:border-accent-primary'
                    : 'border-light-muted/30 bg-white text-light-text focus:border-accent-primary'
                  }`}
                  placeholder="080-123-4567"
                />
              </div>
              <input
                value={profileForm.lineUserId}
                onChange={(e) => handleProfileField('lineUserId', e.target.value)}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${
                  isDark
                    ? 'border-dark-muted/30 bg-dark-bg/60 text-dark-text focus:border-accent-primary'
                    : 'border-light-muted/30 bg-white text-light-text focus:border-accent-primary'
                }`}
                placeholder="LINE ID"
              />
              <input
                value={profileForm.emergencyContactName}
                onChange={(e) => handleProfileField('emergencyContactName', e.target.value)}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${
                  isDark
                    ? 'border-dark-muted/30 bg-dark-bg/60 text-dark-text focus:border-accent-primary'
                    : 'border-light-muted/30 bg-white text-light-text focus:border-accent-primary'
                }`}
                placeholder="ผู้ติดต่อฉุกเฉิน"
              />
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"
                value={profileForm.emergencyContactPhone}
                onChange={(e) => handleProfileField('emergencyContactPhone', e.target.value)}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${
                  isDark
                    ? 'border-dark-muted/30 bg-dark-bg/60 text-dark-text focus:border-accent-primary'
                  : 'border-light-muted/30 bg-white text-light-text focus:border-accent-primary'
                }`}
                placeholder="080-123-4567"
              />
            </div>

            <div className="mt-3 space-y-3">
              <textarea
                rows={2}
                value={profileForm.address}
                onChange={(e) => handleProfileField('address', e.target.value)}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${
                  isDark
                    ? 'border-dark-muted/30 bg-dark-bg/60 text-dark-text focus:border-accent-primary'
                    : 'border-light-muted/30 bg-white text-light-text focus:border-accent-primary'
                }`}
                placeholder="ที่อยู่"
              />
              <textarea
                rows={2}
                value={profileForm.personalNote}
                onChange={(e) => handleProfileField('personalNote', e.target.value)}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${
                  isDark
                    ? 'border-dark-muted/30 bg-dark-bg/60 text-dark-text focus:border-accent-primary'
                    : 'border-light-muted/30 bg-white text-light-text focus:border-accent-primary'
                }`}
                placeholder="ข้อมูลเพิ่มเติม / ประวัติการทำงานย่อ"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className={`text-sm ${isDark ? 'admin-field-label' : 'font-medium text-light-muted'}`}>
              การแจ้งเตือน Push (อุปกรณ์นี้)
            </label>

            <div className={`rounded-xl border px-4 py-3 text-sm ${
              isDark ? 'border-dark-muted/20 bg-dark-bg/50 text-dark-text' : 'border-light-muted/20 bg-light-bg/50 text-light-text'
            }`}>
              สถานะ: {isPushEnabledOnDevice ? 'เปิดแล้ว' : 'ยังไม่เปิด'}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                onClick={handleEnablePush}
                disabled={pushLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#0284c7] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {pushLoading ? <Loader2 size={16} className="animate-spin" /> : <BellRing size={16} />}
                เปิด Push
              </button>

              <button
                onClick={handleDisablePush}
                disabled={pushLoading}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${
                  isDark ? 'bg-dark-bg text-dark-text hover:bg-white/5' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                } disabled:opacity-50`}
              >
                <BellOff size={16} />
                ปิด Push
              </button>
            </div>

            {pushMessage && (
              <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>{pushMessage}</p>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-2 lg:col-start-2">
          <button
            onClick={onClose}
            className={`flex-1 rounded-xl px-4 py-3 font-medium transition-all ${
              isDark
                ? 'bg-dark-bg text-dark-text hover:bg-white/5'
                : 'bg-light-bg text-light-text hover:bg-black/5'
            }`}
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !displayName.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary px-4 py-3 font-bold text-white shadow-lg shadow-accent-primary/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
            บันทึก
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default UserProfileModal;
