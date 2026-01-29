import React, { useState, useEffect } from 'react';
import { User, Mail, Shield, Save, Loader2 } from 'lucide-react';
import Modal from './Modal';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { updateUserProfile } from '../services/userService';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, userProfile, refreshProfile } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && userProfile) {
      setDisplayName(userProfile.displayName || '');
    }
  }, [isOpen, userProfile]);

  const handleSave = async () => {
    if (!user || !userProfile) return;
    
    setSaving(true);
    try {
      await updateUserProfile(user.uid, { displayName });
      await refreshProfile();
      onClose();
    } catch (error) {
      console.error('Failed to update profile:', error);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSaving(false);
    }
  };

  if (!userProfile) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ข้อมูลผู้ใช้งาน">
      <div className="space-y-6">
        {/* Avatar Placeholder */}
        <div className="flex flex-col items-center justify-center">
          {userProfile.photoURL ? (
            <div className="relative mb-3">
              <img 
                src={userProfile.photoURL} 
                alt={displayName} 
                className="w-24 h-24 rounded-full object-cover border-4 border-accent-primary/20 shadow-xl"
              />
            </div>
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-lg mb-3">
              <span className="text-4xl font-bold text-white">
                {displayName.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
            สร้างเมื่อ: {new Date(userProfile.createdAt).toLocaleDateString('th-TH')}
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          {/* Email (Read-only) */}
          <div className="space-y-1">
            <label className={`text-sm font-medium ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
              อีเมล
            </label>
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
              isDark ? 'bg-dark-bg/50 border-dark-muted/20 text-dark-text' : 'bg-light-bg/50 border-light-muted/20 text-light-text'
            }`}>
              <Mail size={18} className="opacity-50" />
              <span>{userProfile.email}</span>
            </div>
          </div>

          {/* Role (Read-only) */}
          <div className="space-y-1">
            <label className={`text-sm font-medium ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
              สิทธิ์การใช้งาน
            </label>
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
              isDark ? 'bg-dark-bg/50 border-dark-muted/20 text-dark-text' : 'bg-light-bg/50 border-light-muted/20 text-light-text'
            }`}>
              <Shield size={18} className="opacity-50" />
              <div className="flex items-center gap-2">
                <span className="capitalize">{userProfile.role}</span>
                {userProfile.role === 'admin' && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-accent-primary/20 text-accent-primary font-bold">
                    Admin
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Display Name (Editable) */}
          <div className="space-y-1">
            <label className={`text-sm font-medium ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
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
                className={`w-full pl-11 pr-4 py-3 rounded-xl border transition-all outline-none ${
                  isDark 
                    ? 'bg-dark-bg border-dark-muted/30 text-dark-text focus:border-accent-primary' 
                    : 'bg-light-bg border-light-muted/30 text-light-text focus:border-accent-primary'
                }`}
                placeholder="ระบุชื่อที่ต้องการแสดง"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all ${
              isDark 
                ? 'bg-dark-bg hover:bg-white/5 text-dark-text' 
                : 'bg-light-bg hover:bg-black/5 text-light-text'
            }`}
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !displayName.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-bold shadow-lg shadow-accent-primary/20 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
