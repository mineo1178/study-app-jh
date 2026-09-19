const DEVICE_ID_KEY = 'study-jh-device-id';
const TAB_ID_KEY = 'study-jh-tab-id';

const newId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function getCurrentClientId() {
  if (typeof window === 'undefined') return 'server';
  let deviceId = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = newId();
    window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  let tabId = window.sessionStorage.getItem(TAB_ID_KEY);
  if (!tabId) {
    tabId = newId();
    window.sessionStorage.setItem(TAB_ID_KEY, tabId);
  }
  return `${deviceId}:${tabId}`;
}

export function createTimerId() {
  return newId();
}
