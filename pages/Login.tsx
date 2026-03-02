import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Loader2, Mail, Lock } from 'lucide-react';

const Login: React.FC = () => {
  const { theme } = useTheme();
  const { loginWithEmail, signupWithEmail, loginWithGoogle } = useAuth();
  const isDark = theme === 'dark';
  
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    if (!isLogin && password !== confirmPassword) {
      setError('รหัสผ่านไม่ตรงกัน');
      setLoading(false);
      return;
    }

    try {
      if (isLogin) {
        await loginWithEmail(email, password);
      } else {
        await signupWithEmail(email, password);
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.code === 'auth/invalid-credential') {
        setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      } else if (err.code === 'auth/user-not-found') {
        setError('ไม่พบบัญชีผู้ใช้นี้');
      } else if (err.code === 'auth/wrong-password') {
        setError('รหัสผ่านไม่ถูกต้อง');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('อีเมลนี้ถูกใช้งานแล้ว');
      } else if (err.code === 'auth/weak-password') {
        setError('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      } else {
        setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error('Google login error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('ยกเลิกการเข้าสู่ระบบด้วย Google');
      } else {
        setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${
      isDark 
        ? 'bg-gradient-to-br from-dark-bg via-purple-900/10 to-dark-bg' 
        : 'bg-gradient-to-br from-purple-50 via-white to-blue-50'
    }`}>
      <div className={`w-full max-w-md rounded-3xl shadow-2xl p-6 ${
        isDark ? 'bg-dark-card/90 backdrop-blur-xl' : 'bg-white/90 backdrop-blur-xl'
      }`}>
        {/* Logo & Title */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-28 h-28 rounded-2xl bg-white p-2 mb-3 shadow-lg shadow-purple-500/25 ring-1 ring-black/5">
            <img src="/icons/truck-logo.png" alt="SFast Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            SFast Trucklog
          </h1>
          <p className={`text-sm mt-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
            {isLogin ? 'เข้าสู่ระบบเพื่อจัดการงานวิ่ง' : 'สมัครสมาชิกใหม่'}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center">
            {error}
          </div>
        )}

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
              อีเมล
            </label>
            <div className="relative">
              <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`} size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl border transition-all focus:ring-2 focus:ring-accent-primary focus:outline-none ${
                  isDark 
                    ? 'bg-dark-bg border-dark-muted/30 text-dark-text placeholder-dark-muted/50' 
                    : 'bg-light-bg border-light-muted/30 text-light-text placeholder-light-muted/50'
                }`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
              รหัสผ่าน
            </label>
            <div className="relative">
              <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`} size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl border transition-all focus:ring-2 focus:ring-accent-primary focus:outline-none ${
                  isDark 
                    ? 'bg-dark-bg border-dark-muted/30 text-dark-text placeholder-dark-muted/50' 
                    : 'bg-light-bg border-light-muted/30 text-light-text placeholder-light-muted/50'
                }`}
              />
            </div>
          </div>

          {!isLogin && (
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                ยืนยันรหัสผ่าน
              </label>
              <div className="relative">
                <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`} size={18} />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border transition-all focus:ring-2 focus:ring-accent-primary focus:outline-none ${
                    isDark 
                      ? 'bg-dark-bg border-dark-muted/30 text-dark-text placeholder-dark-muted/50' 
                      : 'bg-light-bg border-light-muted/30 text-light-text placeholder-light-muted/50'
                  }`}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-accent-primary to-accent-secondary hover:brightness-110 transition-all shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : null}
            {loading ? 'กำลังดำเนินการ...' : (isLogin ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก')}
          </button>
        </form>

        {/* Toggle Login/Signup */}
        <div className="mt-4 text-center">
          <p className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
            {isLogin ? 'ยังไม่มีบัญชีใช่ไหม? ' : 'มีบัญชีอยู่แล้ว? '}
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setEmail('');
                setPassword('');
                setConfirmPassword('');
              }}
              className="text-accent-primary font-semibold hover:underline focus:outline-none"
            >
              {isLogin ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
            </button>
          </p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 my-4">
          <div className={`flex-1 h-px ${isDark ? 'bg-dark-muted/30' : 'bg-light-muted/30'}`} />
          <span className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>หรือ</span>
          <div className={`flex-1 h-px ${isDark ? 'bg-dark-muted/30' : 'bg-light-muted/30'}`} />
        </div>

        {/* Google Login */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className={`w-full py-2.5 rounded-xl font-medium border transition-all flex items-center justify-center gap-3 ${
            isDark 
              ? 'bg-dark-bg border-dark-muted/30 text-dark-text hover:bg-white/5' 
              : 'bg-white border-light-muted/30 text-light-text hover:bg-black/5'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          เข้าสู่ระบบด้วย Google
        </button>
      </div>
    </div>
  );
};

export default Login;
