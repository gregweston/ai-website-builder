// Optional shared-password gate for the whole site. Configure both
// SITE_USERNAME and SITE_PASSWORD (e.g. before deploying somewhere publicly
// reachable) to require a login prompt for every request. This is meant to
// keep random passersby out, not as a strong security boundary — if either
// var is unset the gate is skipped entirely (handy for local development).
export function basicAuth(req, res, next) {
  const expectedUser = process.env.SITE_USERNAME;
  const expectedPass = process.env.SITE_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return next();
  }

  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    const user = separator === -1 ? decoded : decoded.slice(0, separator);
    const pass = separator === -1 ? '' : decoded.slice(separator + 1);
    if (user === expectedUser && pass === expectedPass) {
      return next();
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="AI Webpage Builder"');
  res.status(401).send('Authentication required.');
}
