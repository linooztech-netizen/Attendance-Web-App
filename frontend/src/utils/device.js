export function getDeviceFingerprint() {
  let fp = localStorage.getItem('device_fp');
  if (fp) return fp;
  // Generate a unique ID based on device characteristics + random suffix
  const data = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}`,
    screen.colorDepth,
    navigator.hardwareConcurrency || 0,
    new Date().getTimezoneOffset(),
  ].join('|');
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data.charCodeAt(i);
    hash |= 0;
  }
  fp = Math.abs(hash).toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  localStorage.setItem('device_fp', fp);
  return fp;
}

export function getDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android Phone' : 'Android Tablet';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Mac/i.test(ua)) return 'Mac';
  return 'Unknown Device';
}
