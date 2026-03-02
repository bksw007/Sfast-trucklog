import React, { useState, useEffect } from 'react';
import { User, Shield, AlertTriangle, Search, Loader2 } from 'lucide-react';
import Modal from './Modal';
import { useAuth } from '../contexts/AuthContext';
import { getAllUsers, updateUserRole } from '../services/userService';
import { UserProfile, UserRole } from '../types';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const UserManagementModal: React.FC<UserManagementModalProps> = ({ isOpen, onClose }) => {
  const { userProfile, user: currentUser } = useAuth();
  const isDark = false;

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [brokenPhotoUids, setBrokenPhotoUids] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen && userProfile?.role === 'admin') {
      fetchUsers();
    }
  }, [isOpen, userProfile]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const allUsers = await getAllUsers();
      setUsers(allUsers);
      setBrokenPhotoUids(new Set());
    } catch (error) {
      console.error('Failed to fetch users:', error);
      alert('ไม่สามารถดึงข้อมูลผู้ใช้ได้');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (targetUid: string, currentRole: UserRole, newRole: UserRole) => {
    if (targetUid === currentUser?.uid) {
      alert('คุณไม่สามารถเปลี่ยนสิทธิ์ของตัวเองได้');
      return;
    }
    
    if (currentRole === newRole) return;
    
    if (!confirm(`ต้องการเปลี่ยนสิทธิ์ผู้ใช้นี้เป็น ${newRole.toUpperCase()} ใช่หรือไม่?`)) return;

    setUpdatingUser(targetUid);
    try {
      await updateUserRole(targetUid, newRole);
      // Update local state
      setUsers(prev => prev.map(u => 
        u.uid === targetUid ? { ...u, role: newRole } : u
      ));
    } catch (error) {
      console.error('Failed to update role:', error);
      alert('เกิดข้อผิดพลาดในการเปลี่ยนสิทธิ์');
    } finally {
      setUpdatingUser(null);
    }
  };

  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (userProfile?.role !== 'admin') return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="จัดการผู้ใช้งาน">
      <div className="space-y-4">
        <div className={`text-xs p-3 rounded-lg flex items-start gap-2 ${
          isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'
        }`}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            รายชื่อจะแสดงเฉพาะผู้ที่เคยเข้าสู่ระบบแอพพลิเคชันแล้วเท่านั้น 
            (ผู้ใช้ที่สร้างใน Firebase Console แต่ยังไม่เคย Login จะไม่แสดงในรายการนี้)
          </span>
        </div>
        {/* Search */}
        <div className="relative">
          <Search size={18} className={`absolute left-4 top-1/2 -translate-y-1/2 ${
            isDark ? 'text-dark-muted' : 'text-light-muted'
          }`} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-11 pr-4 py-2 rounded-xl border outline-none ${
              isDark 
                ? 'bg-dark-bg border-dark-muted/30 text-dark-text focus:border-accent-primary' 
                : 'bg-light-bg border-light-muted/30 text-light-text focus:border-accent-primary'
            }`}
            placeholder="ค้นหาชื่อ หรืออีเมล..."
          />
        </div>

        {/* User List */}
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={32} className="animate-spin text-accent-primary" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className={`text-center py-8 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
              ไม่พบข้อมูลผู้ใช้
            </div>
          ) : (
            filteredUsers.map((u) => (
              <div 
                key={u.uid}
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  isDark 
                    ? 'bg-dark-bg/50 border-dark-muted/20' 
                    : 'bg-light-bg/50 border-light-muted/20'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  {u.photoURL && !brokenPhotoUids.has(u.uid) ? (
                    <img 
                      src={u.photoURL} 
                      alt={u.displayName} 
                      className="w-10 h-10 rounded-full object-cover border-2 border-white/10"
                      onError={() => {
                        setBrokenPhotoUids((prev) => {
                          if (prev.has(u.uid)) return prev;
                          const next = new Set(prev);
                          next.add(u.uid);
                          return next;
                        });
                      }}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center text-white font-bold">
                      {u.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  
                  <div>
                    <div className={`font-medium ${isDark ? 'text-dark-text' : 'text-light-text'}`}>
                      {u.displayName}
                    </div>
                    <div className={`text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                      {u.email}
                    </div>
                  </div>
                </div>

                {/* Role Switcher */}
                <div className="flex items-center gap-2">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.uid, u.role, e.target.value as UserRole)}
                    disabled={updatingUser === u.uid || u.uid === currentUser?.uid}
                    className={`text-sm rounded-lg px-2 py-1 border outline-none cursor-pointer ${
                      u.role === 'admin'
                        ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/20' 
                        : isDark ? 'bg-dark-card text-dark-text border-dark-muted/20' : 'bg-white text-slate-700 border-slate-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                  {updatingUser === u.uid && (
                    <Loader2 size={16} className="animate-spin text-accent-primary" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};

export default UserManagementModal;
