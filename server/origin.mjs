// Browsers send an Origin on POST. Match the actual host, allowing HTTPS in
// production and HTTP for local development. This is not authentication.
export function isAllowedOrigin(req) {
  if (!req.headers.origin) return true;
  try {
    const origin = new URL(req.headers.origin);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
    return origin.host === req.headers.host && !origin.username && !origin.password &&
      (origin.protocol === 'https:' || (origin.protocol === 'http:' && local));
  } catch { return false; }
}
