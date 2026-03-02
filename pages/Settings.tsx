import React, { useState } from 'react';
import { Settings as SettingsIcon, Plus, Trash2, RefreshCw, MapPin, Truck, User, Car, Loader2, Check, X, Pencil, Save } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { addOption, renameOptionAndSyncJobs } from '../services/firebaseService';
import { OptionCategory } from '../types';
import { db } from '../firebase';
import { collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';

const Settings: React.FC = () => {
  const { data, refreshData, syncing, lastUpdate } = useData();
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

  const tabs = [
    { id: OptionCategory.LOCATION, label: 'สถานที่', icon: MapPin },
    { id: OptionCategory.VEHICLE, label: 'ประเภทรถ', icon: Truck },
    { id: OptionCategory.DRIVER, label: 'คนขับ', icon: User },
    { id: OptionCategory.PLATE, label: 'ทะเบียน', icon: Car },
  ];

  const getCurrentOptions = (): string[] => {
    if (!data?.options) return [];
    let options: string[] = [];
    switch (activeTab) {
      case OptionCategory.LOCATION: options = data.options.locations; break;
      case OptionCategory.VEHICLE: options = data.options.vehicleTypes; break;
      case OptionCategory.DRIVER: options = data.options.drivers; break;
      case OptionCategory.PLATE: options = data.options.licensePlates; break;
      default: options = [];
    }
    // Return unique values, sorted A-Z (Thai-aware)
    return Array.from(new Set(options)).sort((a, b) => a.localeCompare(b, 'th'));
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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-accent-primary to-accent-secondary shadow-lg shadow-accent-primary/20">
            <SettingsIcon className="text-white" size={24} />
          </div>
          <div>
            <h1 className={`text-2xl font-bold ${isDark ? 'text-dark-text' : 'text-light-text'}`}>
              ตั้งค่า
            </h1>
            <p className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
              จัดการข้อมูลตัวเลือก และซิงค์ข้อมูล
            </p>
          </div>
        </div>

        {/* Manual Sync Button */}
        <div className="flex items-center gap-4">
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
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
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
      <div className={`p-1 rounded-xl flex gap-1 ${isDark ? 'bg-dark-card' : 'bg-light-card shadow-lg'}`}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white shadow-lg'
                  : isDark
                  ? 'text-dark-muted hover:bg-white/5'
                  : 'text-light-muted hover:bg-black/5'
              }`}
            >
              <Icon size={18} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Options List */}
      <div className={`rounded-2xl border overflow-hidden ${
        isDark ? 'bg-dark-card border-dark-muted/20' : 'bg-light-card border-light-muted/20 shadow-lg'
      }`}>
        {/* Add New */}
        <div className={`p-4 border-b flex gap-3 ${isDark ? 'border-dark-muted/20' : 'border-light-muted/20'}`}>
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
            placeholder={`เพิ่ม${tabs.find(t => t.id === activeTab)?.label}ใหม่...`}
            className={`flex-1 px-4 py-2 rounded-xl border ${
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
                      <span className={isDark ? 'text-dark-text truncate' : 'text-light-text truncate'}>{item}</span>
                      <Pencil size={14} className={isDark ? 'text-dark-muted shrink-0' : 'text-light-muted shrink-0'} />
                    </div>
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
