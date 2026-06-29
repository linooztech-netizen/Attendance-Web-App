export function getDeviceFingerprint() {
  const key = 'device_fp';
  let fp = localStorage.getItem(key);
  if (!fp) {
    const raw = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset()
    ].join('|');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    fp = Math.abs(hash).toString(36) + '-' + Date.now().toString(36);
    localStorage.setItem(key, fp);
  }
  return fp;
}

export function getDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) {
    const m = ua.match(/Android.*?;\s*([^)]+)\)/);
    return m ? m[1].trim() : 'Android Device';
  }
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Mac/.test(ua)) return 'Mac';
  return 'Unknown Device';
}

