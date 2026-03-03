import React, { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Plus,
  Trash2,
  RefreshCw,
  MapPin,
  Truck,
  User,
  Car,
  Loader2,
  Check,
  X,
  Pencil,
  Save,
  Building2,
  Package,
  Contact,
  Star,
} from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { addOption, renameOptionAndSyncJobs } from '../services/firebaseService';
import { updateUserProfile } from '../services/userService';
import { OptionCategory } from '../types';
import { db } from '../firebase';
import { collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';

const Settings: React.FC = () => {
  const { data, refreshData, syncing, lastUpdate } = useData();
  const { user, userProfile, refreshProfile } = useAuth();
  const isDark = false;

  const formatLastUpdate = (date: Date | null) => {
    if (!date) return 'ไม่ทราบ';
    return date.toLocaleString('th-TH', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  const [activeTab, setActiveTab] = useState<OptionCategory>(OptionCategory.LOCATION);
  const [newValue, setNewValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingItem, setDeletingItem] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [renamingItem, setRenamingItem] = useState<string | null>(null);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<'success' | 'error' | null>(null);
  const [pinnedLocations, setPinnedLocations] = useState<string[]>([]);
  const [savingPinnedLocations, setSavingPinnedLocations] = useState(false);
  const LEGACY_PINNED_LOCATIONS_STORAGE_KEY = 'settings.pinnedLocations.v1';

  const normalizePinnedLocations = (value: unknown): string[] =>
    Array.from(
      new Set(
        (Array.isArray(value) ? value : [])
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );

  useEffect(() => {
    setPinnedLocations(normalizePinnedLocations(userProfile?.pinnedLocations));
  }, [userProfile?.pinnedLocations]);

  useEffect(() => {
    if (!user?.uid || !userProfile) return;
    if (normalizePinnedLocations(userProfile.pinnedLocations).length > 0) return;

    try {
      const raw = localStorage.getItem(LEGACY_PINNED_LOCATIONS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const legacyPinned = normalizePinnedLocations(parsed);
      if (legacyPinned.length === 0) return;

      void persistPinnedLocations(legacyPinned).then(() => {
        localStorage.removeItem(LEGACY_PINNED_LOCATIONS_STORAGE_KEY);
      });
    } catch (error) {
      console.error('Failed to migrate legacy pinned locations:', error);
    }
  }, [user?.uid, userProfile]);

  const tabs = [
    { id: OptionCategory.LOCATION, label: 'สถานที่', icon: MapPin },
    { id: OptionCategory.VEHICLE, label: 'ประเภทรถ', icon: Truck },
    { id: OptionCategory.DRIVER, label: 'คนขับ', icon: User },
    { id: OptionCategory.PLATE, label: 'ทะเบียน', icon: Car },
    { id: OptionCategory.EMPLOYER_COMPANY, label: 'บริษัทผู้ว่าจ้าง', icon: Building2 },
    { id: OptionCategory.PRODUCT_TYPE, label: 'ประเภทสินค้า', icon: Package },
    { id: OptionCategory.CONTACT, label: 'ผู้ติดต่อ', icon: Contact },
  ];

  const getCurrentOptions = (): string[] => {
    if (!data?.options) return [];
    let options: string[] = [];
    switch (activeTab) {
      case OptionCategory.LOCATION: options = data.options.locations; break;
      case OptionCategory.VEHICLE: options = data.options.vehicleTypes; break;
      case OptionCategory.DRIVER: options = data.options.drivers; break;
      case OptionCategory.PLATE: options = data.options.licensePlates; break;
      case OptionCategory.EMPLOYER_COMPANY: options = data.options.employerCompanies; break;
      case OptionCategory.PRODUCT_TYPE: options = data.options.productTypes; break;
      case OptionCategory.CONTACT: options = data.options.contacts; break;
      default: options = [];
    }
    const uniqueSorted = Array.from(new Set(options)).sort((a, b) => a.localeCompare(b, 'th'));
    if (activeTab !== OptionCategory.LOCATION) {
      return uniqueSorted;
    }

    const pinnedSet = new Set(pinnedLocations);
    const pinned = uniqueSorted.filter((item) => pinnedSet.has(item));
    const unpinned = uniqueSorted.filter((item) => !pinnedSet.has(item));
    return [...pinned, ...unpinned];
  };

  const persistPinnedLocations = async (nextPinnedLocations: string[]) => {
    if (!user?.uid) {
      setPinnedLocations(nextPinnedLocations);
      return;
    }

    const normalized = normalizePinnedLocations(nextPinnedLocations);
    const previous = pinnedLocations;
    setPinnedLocations(normalized);
    setSavingPinnedLocations(true);
    try {
      await updateUserProfile(user.uid, {
        pinnedLocations: normalized,
        profileUpdatedAt: Date.now(),
      });
      await refreshProfile();
    } catch (error) {
      console.error('Failed to save pinned locations:', error);
      setPinnedLocations(previous);
      alert('บันทึกสถานที่ติดดาวไม่สำเร็จ');
    } finally {
      setSavingPinnedLocations(false);
    }
  };

  const togglePinnedLocation = async (value: string) => {
    const next = pinnedLocations.includes(value)
      ? pinnedLocations.filter((item) => item !== value)
      : [value, ...pinnedLocations];
    await persistPinnedLocations(next);
  };

  const handleAdd = async () => {
    if (!newValue.trim()) return;
    setAdding(true);
    try {
      await addOption(activeTab, newValue.trim());
      setNewValue('');
    } catch (error) {
      console.error('Failed to add option:', error);
      alert('เกิดข้อผิดพลาดในการเพิ่ม');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (value: string) => {
    if (!confirm(`ต้องการลบ "${value}" ใช่ไหม?`)) return;
    setDeletingItem(value);
    try {
      // Find and delete the option document
      const optionsRef = collection(db, 'options');
      const q = query(optionsRef, where('category', '==', activeTab), where('value', '==', value));
      const snapshot = await getDocs(q);
      
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      if (activeTab === OptionCategory.LOCATION) {
        await persistPinnedLocations(pinnedLocations.filter((item) => item !== value));
      }
      
    } catch (error) {
      console.error('Failed to delete option:', error);
      alert('เกิดข้อผิดพลาดในการลบ');
    } finally {
      setDeletingItem(null);
    }
  };

  const startRename = (value: string) => {
    setEditingItem(value);
    setEditValue(value);
  };

  const cancelRename = () => {
    setEditingItem(null);
    setEditValue('');
  };

  const handleRename = async (oldValue: string) => {
    const nextValue = editValue.trim();
    if (!nextValue) return;

    setRenamingItem(oldValue);
    try {
      await renameOptionAndSyncJobs(activeTab, oldValue, nextValue);
      if (activeTab === OptionCategory.LOCATION && oldValue !== nextValue) {
        await persistPinnedLocations(
          pinnedLocations.map((item) => (item === oldValue ? nextValue : item))
        );
      }
      cancelRename();
    } catch (error) {
      console.error('Failed to rename option:', error);
      const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการแก้ไขชื่อ';
      alert(message);
    } finally {
      setRenamingItem(null);
    }
  };

  const handleManualSync = async () => {
    setManualSyncing(true);
    setSyncResult(null);
    try {
      const response = await fetch('https://manualsync-psuxy2kmba-as.a.run.app');
      const result = await response.json();
      if (result.success) {
        setSyncResult('success');
      } else {
        setSyncResult('error');
      }
    } catch (error) {
      console.error('Manual sync failed:', error);
      setSyncResult('error');
    } finally {
      setManualSyncing(false);
      setTimeout(() => setSyncResult(null), 3000);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-accent-primary to-accent-secondary shadow-lg shadow-accent-primary/20">
            <SettingsIcon className="text-white" size={24} />
          </div>
          <div className="min-w-0">
            <h1 className={`text-2xl font-bold ${isDark ? 'text-dark-text' : 'text-light-text'}`}>
              ตั้งค่า
            </h1>
            <p className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
              จัดการข้อมูลตัวเลือก และซิงค์ข้อมูล
            </p>
          </div>
        </div>

        {/* Manual Sync Button */}
        <div className="flex w-full items-center gap-4 sm:w-auto">
          <div className="text-right hidden sm:block">
            <div className={`text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
              อัปเดตล่าสุด
            </div>
            <div className={`text-sm font-medium ${isDark ? 'text-dark-text' : 'text-light-text'}`}>
              {formatLastUpdate(lastUpdate)}
            </div>
          </div>
          <button
          onClick={handleManualSync}
          disabled={manualSyncing}
          className={`hidden items-center gap-2 rounded-xl px-4 py-2 font-medium transition-all md:flex ${
            syncResult === 'success' 
              ? 'bg-green-500 text-white' 
              : syncResult === 'error'
              ? 'bg-red-500 text-white'
              : 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:shadow-lg hover:shadow-accent-primary/30'
          } disabled:opacity-50`}
        >
          {manualSyncing ? (
            <Loader2 size={18} className="animate-spin" />
          ) : syncResult === 'success' ? (
            <Check size={18} />
          ) : syncResult === 'error' ? (
            <X size={18} />
          ) : (
            <RefreshCw size={18} />
          )}
          {manualSyncing ? 'กำลังซิงค์...' : syncResult === 'success' ? 'สำเร็จ!' : syncResult === 'error' ? 'ล้มเหลว' : 'Sync to Sheets'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={`grid w-full grid-cols-2 gap-1 rounded-xl p-1 sm:grid-cols-4 xl:grid-cols-7 ${isDark ? 'bg-dark-card' : 'bg-light-card shadow-lg'}`}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-center font-medium transition-all sm:flex-row sm:gap-2 sm:px-3 sm:py-3 ${
                isActive
                  ? 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white shadow-lg'
                  : isDark
                  ? 'text-dark-muted hover:bg-white/5'
                  : 'text-light-muted hover:bg-black/5'
              }`}
            >
              <Icon size={18} />
              <span className="text-[11px] leading-tight sm:text-sm">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Options List */}
      <div className={`rounded-2xl border overflow-hidden ${
        isDark ? 'bg-dark-card border-dark-muted/20' : 'bg-light-card border-light-muted/20 shadow-lg'
      }`}>
        {/* Add New */}
        <div className={`p-4 border-b flex flex-wrap gap-3 ${isDark ? 'border-dark-muted/20' : 'border-light-muted/20'}`}>
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
            placeholder={`เพิ่ม${tabs.find(t => t.id === activeTab)?.label}ใหม่...`}
            className={`min-w-0 flex-1 px-4 py-2 rounded-xl border ${
              isDark 
                ? 'bg-dark-bg border-dark-muted/30 text-dark-text placeholder-dark-muted' 
                : 'bg-light-bg border-light-muted/30 text-light-text placeholder-light-muted'
            }`}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newValue.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-success text-white font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {adding ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            เพิ่ม
          </button>
        </div>

        {/* List */}
        <div className="max-h-96 overflow-y-auto">
          {getCurrentOptions().length === 0 ? (
            <div className={`p-8 text-center ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
              ไม่มีข้อมูล
            </div>
          ) : (
            getCurrentOptions().map((item, index) => (
              <div
                key={`${item}-${index}`}
                onClick={() => {
                  if (editingItem !== item) startRename(item);
                }}
                className={`flex items-center justify-between gap-2 px-4 py-3 border-b last:border-b-0 cursor-pointer ${
                  isDark ? 'border-dark-muted/10 hover:bg-white/5' : 'border-light-muted/10 hover:bg-black/5'
                }`}
              >
                {editingItem === item ? (
                  <>
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(item);
                        if (e.key === 'Escape') cancelRename();
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg border ${
                        isDark
                          ? 'bg-dark-bg border-dark-muted/30 text-dark-text'
                          : 'bg-light-bg border-light-muted/30 text-light-text'
                      }`}
                      autoFocus
                    />
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {activeTab === OptionCategory.LOCATION && (
                        <button
                          onClick={() => {
                            void togglePinnedLocation(item);
                          }}
                          disabled={renamingItem === item || savingPinnedLocations}
                          className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                            pinnedLocations.includes(item)
                              ? 'text-amber-500 hover:bg-amber-500/10'
                              : 'text-slate-400 hover:bg-slate-500/10'
                          }`}
                          title={pinnedLocations.includes(item) ? 'เอาออกจากรายการติดดาว' : 'ติดดาวให้อยู่ด้านบน'}
                        >
                          <Star size={16} fill={pinnedLocations.includes(item) ? 'currentColor' : 'none'} />
                        </button>
                      )}
                      <button
                        onClick={() => handleRename(item)}
                        disabled={renamingItem === item || !editValue.trim()}
                        className="p-2 rounded-lg text-green-500 hover:bg-green-500/10 transition-colors disabled:opacity-50"
                        title="บันทึก"
                      >
                        {renamingItem === item ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      </button>
                      <button
                        onClick={cancelRename}
                        disabled={renamingItem === item}
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-500/10 transition-colors disabled:opacity-50"
                        title="ยกเลิก"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 min-w-0">
                      {activeTab === OptionCategory.LOCATION && pinnedLocations.includes(item) && (
                        <Star size={14} className="shrink-0 text-amber-500" fill="currentColor" />
                      )}
                      <span className={isDark ? 'text-dark-text truncate' : 'text-light-text truncate'}>{item}</span>
                      <Pencil size={14} className={isDark ? 'text-dark-muted shrink-0' : 'text-light-muted shrink-0'} />
                    </div>
                    <div className="flex items-center gap-1">
                      {activeTab === OptionCategory.LOCATION && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void togglePinnedLocation(item);
                          }}
                          disabled={deletingItem === item || savingPinnedLocations}
                          className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                            pinnedLocations.includes(item)
                              ? 'text-amber-500 hover:bg-amber-500/10'
                              : 'text-slate-400 hover:bg-slate-500/10'
                          }`}
                          title={pinnedLocations.includes(item) ? 'เอาออกจากรายการติดดาว' : 'ติดดาวให้อยู่ด้านบน'}
                        >
                          <Star size={16} fill={pinnedLocations.includes(item) ? 'currentColor' : 'none'} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item);
                        }}
                        disabled={deletingItem === item}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        {deletingItem === item ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Count */}
        <div className={`px-4 py-3 border-t text-sm ${
          isDark ? 'bg-dark-bg/50 border-dark-muted/20 text-dark-muted' : 'bg-light-bg/50 border-light-muted/20 text-light-muted'
        }`}>
          ทั้งหมด {getCurrentOptions().length} รายการ
        </div>
      </div>
    </div>
  );
};

export default Settings;
