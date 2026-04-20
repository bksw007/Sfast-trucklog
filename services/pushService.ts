import app from '../firebase';
import { addUserFcmToken, removeUserFcmToken } from './userService';

const TOKEN_STORAGE_KEY = 'sfast_fcm_token';
const PUSH_DISABLED_PREFIX = 'sfast_push_disabled:';
const FOREGROUND_NOTIFICATION_ICON = '/icons/web-app-manifest-192x192.png';
const FOREGROUND_NOTIFICATION_BADGE = '/favicon-32x32.png';

type StoredPushBinding = {
  uid: string;
  token: string;
};

type PushRegistrationResult = {
  ok: boolean;
  message: string;
  token?: string;
};

type ForegroundPayload = {
  notification?: {
    title?: string;
    body?: string;
  };
  fcmOptions?: {
    link?: string;
  };
};

let foregroundPushUnsubscribe: (() => void) | null = null;

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
  'serviceWorker' in navigator &&
  'PushManager' in window;

const isAppleMobileBrowser = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua);
};

const readStoredPushBinding = (): StoredPushBinding | null => {
  if (typeof window === 'undefined') return null;

  const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredPushBinding>;
    const token = typeof parsed?.token === 'string' ? parsed.token.trim() : '';
    const uid = typeof parsed?.uid === 'string' ? parsed.uid.trim() : '';
    return token ? { uid, token } : null;
  } catch {
    const legacyToken = raw.trim();
    return legacyToken ? { uid: '', token: legacyToken } : null;
  }
};

const writeStoredPushBinding = (uid: string, token: string) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    TOKEN_STORAGE_KEY,
    JSON.stringify({
      uid: uid.trim(),
      token: token.trim(),
    } satisfies StoredPushBinding)
  );
};

const clearStoredPushBinding = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
};

const getPushDisabledKey = (uid: string) => `${PUSH_DISABLED_PREFIX}${uid.trim()}`;

const readPushDisabledState = (uid: string): boolean => {
  if (typeof window === 'undefined' || !uid.trim()) return false;
  return localStorage.getItem(getPushDisabledKey(uid)) === '1';
};

const writePushDisabledState = (uid: string, disabled: boolean) => {
  if (typeof window === 'undefined' || !uid.trim()) return;

  if (disabled) {
    localStorage.setItem(getPushDisabledKey(uid), '1');
    return;
  }

  localStorage.removeItem(getPushDisabledKey(uid));
};

export const getStoredPushToken = (): string => {
  return readStoredPushBinding()?.token || '';
};

export const isPushDisabledForUser = (uid: string): boolean =>
  readPushDisabledState(uid);

const resolveMessagingContext = async (requestPermission: boolean) => {
  if (!isPushEnvironmentSupported()) {
    return {
      ok: false,
      message: isAppleMobileBrowser()
        ? 'iPhone/iPad เครื่องนี้ยังเปิด Push ไม่ได้ เพราะระบบนี้ใช้ Firebase Messaging บนเว็บ ซึ่งยังไม่รองรับ iOS Safari/PWA'
        : 'อุปกรณ์นี้ไม่รองรับ Web Push',
    } as const;
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
  if (!vapidKey?.trim()) {
    return { ok: false, message: 'ยังไม่ได้ตั้งค่า VAPID key' } as const;
  }

  if (Notification.permission === 'denied') {
    return { ok: false, message: 'เบราว์เซอร์บล็อกการแจ้งเตือนอยู่' } as const;
  }

  const permission = requestPermission ?
    await Notification.requestPermission() :
    Notification.permission;
  if (permission !== 'granted') {
    return { ok: false, message: 'ยังไม่ได้อนุญาตการแจ้งเตือน' } as const;
  }

  const messagingModule = await import('firebase/messaging');
  const supported = await messagingModule.isSupported();
  if (!supported) {
    return {
      ok: false,
      message: isAppleMobileBrowser()
        ? 'iPhone/iPad เครื่องนี้ยังเปิด Push ไม่ได้ เพราะระบบนี้ใช้ Firebase Messaging บนเว็บ ซึ่งยังไม่รองรับ iOS Safari/PWA'
        : 'เบราว์เซอร์นี้ไม่รองรับ Firebase Messaging',
    } as const;
  }

  const swRegistration = await navigator.serviceWorker.register(buildMessagingServiceWorkerUrl());
  const messaging = messagingModule.getMessaging(app);

  return {
    ok: true,
    vapidKey,
    messagingModule,
    messaging,
    swRegistration,
  } as const;
};

const showForegroundNotification = (payload: ForegroundPayload) => {
  if (typeof window === 'undefined' || Notification.permission !== 'granted') return;

  const title = payload.notification?.title || 'SFast Trucklog';
  const body = payload.notification?.body || 'มีการอัปเดตงานใหม่';
  const targetLink = payload.fcmOptions?.link || '/';

  const notification = new Notification(title, {
    body,
    icon: FOREGROUND_NOTIFICATION_ICON,
    badge: FOREGROUND_NOTIFICATION_BADGE,
  });

  notification.onclick = () => {
    window.focus();
    window.location.assign(targetLink);
    notification.close();
  };
};

export const ensureForegroundPushListener = async (): Promise<void> => {
  if (foregroundPushUnsubscribe || !isPushEnvironmentSupported()) return;

  const context = await resolveMessagingContext(false);
  if (!context.ok) return;

  foregroundPushUnsubscribe = context.messagingModule.onMessage(
    context.messaging,
    (payload) => {
      showForegroundNotification(payload as ForegroundPayload);
    }
  );
};

export const stopForegroundPushListener = () => {
  foregroundPushUnsubscribe?.();
  foregroundPushUnsubscribe = null;
};

const linkPushTokenToUser = async (
  uid: string,
  requestPermission: boolean
): Promise<PushRegistrationResult> => {
  if (!uid) return { ok: false, message: 'ไม่พบผู้ใช้งาน' };
  if (!requestPermission && readPushDisabledState(uid)) {
    return { ok: false, message: 'อุปกรณ์นี้ปิดรับ Push ไว้' };
  }

  const context = await resolveMessagingContext(requestPermission);
  if (!context.ok) {
    return { ok: false, message: context.message };
  }

  const token = await context.messagingModule.getToken(context.messaging, {
    vapidKey: context.vapidKey,
    serviceWorkerRegistration: context.swRegistration,
  });

  if (!token) {
    return { ok: false, message: 'ไม่สามารถออก Push token ได้' };
  }

  const previousBinding = readStoredPushBinding();
  if (previousBinding?.token) {
    const previousOwnerUid = previousBinding.uid || uid;
    const shouldDetachPrevious =
      previousBinding.token !== token || previousOwnerUid !== uid;

    if (shouldDetachPrevious) {
      await removeUserFcmToken(previousOwnerUid, previousBinding.token);
    }
  }

  await addUserFcmToken(uid, token);
  writeStoredPushBinding(uid, token);
  writePushDisabledState(uid, false);
  await ensureForegroundPushListener();

  return { ok: true, message: 'เปิดรับแจ้งเตือน Push แล้ว', token };
};

export const registerPushTokenForUser = async (
  uid: string
): Promise<PushRegistrationResult> => linkPushTokenToUser(uid, true);

export const syncPushTokenForUser = async (uid: string): Promise<void> => {
  if (!uid || Notification.permission !== 'granted') return;

  try {
    await linkPushTokenToUser(uid, false);
  } catch (error) {
    console.warn('Silent push token sync failed:', error);
  }
};

export const unregisterPushTokenForUser = async (
  uid: string
): Promise<{ ok: boolean; message: string }> => {
  if (!uid) return { ok: false, message: 'ไม่พบผู้ใช้งาน' };

  writePushDisabledState(uid, true);
  const binding = readStoredPushBinding();
  const token = binding?.token || '';
  if (!token) {
    stopForegroundPushListener();
    return { ok: true, message: 'อุปกรณ์นี้ยังไม่มี token ที่บันทึกไว้' };
  }

  await removeUserFcmToken(binding?.uid || uid, token);
  clearStoredPushBinding();

  try {
    const context = await resolveMessagingContext(false);
    if (context.ok) {
      await context.messagingModule.deleteToken(context.messaging);
    }
  } catch (error) {
    console.warn('Delete push token failed:', error);
  }

  stopForegroundPushListener();

  return { ok: true, message: 'ปิด Push ของอุปกรณ์นี้แล้ว' };
};
