import app from '../firebase';
import { addUserFcmToken, removeUserFcmToken } from './userService';

const TOKEN_STORAGE_KEY = 'sfast_fcm_token';

const buildMessagingServiceWorkerUrl = () => {
  const url = new URL('/firebase-messaging-sw.js', window.location.origin);
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  Object.entries(config).forEach(([key, value]) => {
    if (typeof value === 'string' && value.trim()) {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
};

const isPushEnvironmentSupported = () =>
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator;

export const getStoredPushToken = (): string => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
};

export const registerPushTokenForUser = async (
  uid: string
): Promise<{ ok: boolean; message: string; token?: string }> => {
  if (!uid) return { ok: false, message: 'ไม่พบผู้ใช้งาน' };
  if (!isPushEnvironmentSupported()) {
    return { ok: false, message: 'อุปกรณ์นี้ไม่รองรับ Web Push' };
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
  if (!vapidKey?.trim()) {
    return { ok: false, message: 'ยังไม่ได้ตั้งค่า VAPID key' };
  }

  if (Notification.permission === 'denied') {
    return { ok: false, message: 'เบราว์เซอร์บล็อกการแจ้งเตือนอยู่' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, message: 'ยังไม่ได้อนุญาตการแจ้งเตือน' };
  }

  const messagingModule = await import('firebase/messaging');
  const supported = await messagingModule.isSupported();
  if (!supported) {
    return { ok: false, message: 'เบราว์เซอร์นี้ไม่รองรับ Firebase Messaging' };
  }

  const swRegistration = await navigator.serviceWorker.register(buildMessagingServiceWorkerUrl());
  const messaging = messagingModule.getMessaging(app);
  const token = await messagingModule.getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: swRegistration,
  });

  if (!token) {
    return { ok: false, message: 'ไม่สามารถออก Push token ได้' };
  }

  const previousToken = getStoredPushToken();
  if (previousToken && previousToken !== token) {
    await removeUserFcmToken(uid, previousToken);
  }

  await addUserFcmToken(uid, token);
  localStorage.setItem(TOKEN_STORAGE_KEY, token);

  return { ok: true, message: 'เปิดรับแจ้งเตือน Push แล้ว', token };
};

export const unregisterPushTokenForUser = async (
  uid: string
): Promise<{ ok: boolean; message: string }> => {
  if (!uid) return { ok: false, message: 'ไม่พบผู้ใช้งาน' };

  const token = getStoredPushToken();
  if (!token) {
    return { ok: true, message: 'อุปกรณ์นี้ยังไม่มี token ที่บันทึกไว้' };
  }

  await removeUserFcmToken(uid, token);
  localStorage.removeItem(TOKEN_STORAGE_KEY);

  return { ok: true, message: 'ปิด Push ของอุปกรณ์นี้แล้ว' };
};
