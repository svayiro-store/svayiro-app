import { api } from '../api';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushNotificationSupported() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

export async function enablePushNotifications(audience: 'customer' | 'admin') {
  if (!isPushNotificationSupported()) {
    throw new Error('Browser push notifications are not supported on this device/browser.');
  }

  const key = await api.getPushPublicKey();
  if (!key.enabled || !key.publicKey) {
    throw new Error('Push notifications are not configured on the server.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not allowed.');
  }

  let registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    registration = await navigator.serviceWorker.register('/sw.js');
  }
  registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key.publicKey)
  });

  await api.subscribePush(subscription.toJSON(), audience);
  localStorage.setItem(`svayiro_push_enabled_${audience}`, 'true');
  return subscription;
}

export async function disablePushNotifications(audience: 'customer' | 'admin') {
  if (!isPushNotificationSupported()) {
    localStorage.removeItem(`svayiro_push_enabled_${audience}`);
    return;
  }
  let registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await api.unsubscribePush(subscription.endpoint);
    await subscription.unsubscribe();
  }
  localStorage.removeItem(`svayiro_push_enabled_${audience}`);
}

export function wasPushEnabled(audience: 'customer' | 'admin') {
  return typeof window !== 'undefined' && localStorage.getItem(`svayiro_push_enabled_${audience}`) === 'true';
}
