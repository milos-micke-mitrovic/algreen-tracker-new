import { pushApi } from '@algreen/api-client';
import { useAuthStore } from '@algreen/auth';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export async function subscribeToPush(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[Push] serviceWorker or PushManager not supported');
      return false;
    }

    const permission = await Notification.requestPermission();
    console.log('[Push] Notification permission:', permission);
    if (permission !== 'granted') {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    console.log('[Push] Service worker ready, scope:', registration.scope);

    // Get VAPID key from server
    const { data } = await pushApi.getVapidPublicKey();
    const vapidPublicKey = data.publicKey;
    console.log('[Push] VAPID public key received:', vapidPublicKey ? 'yes' : 'no');
    if (!vapidPublicKey) return false;

    // Check for existing subscription
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      console.log('[Push] Existing subscription found, reusing');
    }

    // Subscribe to push
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
    });

    const json = subscription.toJSON();
    console.log('[Push] Subscription endpoint:', json.endpoint?.slice(0, 60) + '...');
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      console.warn('[Push] Subscription missing keys');
      return false;
    }

    // Register subscription on the server
    const { tenantId, user } = useAuthStore.getState();
    if (!tenantId || !user?.id) {
      console.warn('[Push] No tenantId or userId in auth store');
      return false;
    }

    await pushApi.subscribe({
      tenantId,
      userId: user.id,
      endpoint: json.endpoint,
      p256dhKey: json.keys.p256dh,
      authKey: json.keys.auth,
    });

    console.log('[Push] Subscription registered on server successfully');
    return true;
  } catch (err) {
    console.error('[Push] Subscription failed:', err);
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;

    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SW timeout')), 3000)),
    ]);
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    // Unregister on server
    try {
      await pushApi.unsubscribe(subscription.endpoint);
    } catch {
      // Server may be unreachable, continue with local unsubscribe
    }

    await subscription.unsubscribe();
    console.log('[Push] Unsubscribed successfully');
  } catch (err) {
    console.warn('[Push] Unsubscribe failed:', err);
  }
}
