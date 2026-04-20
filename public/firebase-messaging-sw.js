/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/12.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.8.0/firebase-messaging-compat.js');

const query = new URLSearchParams(self.location.search);
const firebaseConfig = {
  apiKey: query.get('apiKey') || '',
  authDomain: query.get('authDomain') || '',
  projectId: query.get('projectId') || '',
  messagingSenderId: query.get('messagingSenderId') || '',
  appId: query.get('appId') || '',
};

const hasRequiredConfig =
  !!firebaseConfig.apiKey &&
  !!firebaseConfig.projectId &&
  !!firebaseConfig.messagingSenderId &&
  !!firebaseConfig.appId;

if (hasRequiredConfig) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    if (payload?.notification?.title || payload?.notification?.body) {
      return;
    }

    const title = payload?.notification?.title || 'SFast Trucklog';
    const body = payload?.notification?.body || 'มีการอัปเดตงานใหม่';
    const targetLink = payload?.fcmOptions?.link || '/';

    self.registration.showNotification(title, {
      body,
      icon: '/icons/web-app-manifest-192x192.png',
      badge: '/favicon-32x32.png',
      data: {
        link: targetLink,
      },
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = event.notification?.data?.link || '/';
  event.waitUntil(clients.openWindow(target));
});
