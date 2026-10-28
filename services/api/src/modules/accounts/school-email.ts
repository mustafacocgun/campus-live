/**
 * True when the e-mail's domain is exactly one of the allowed school domains: `ogr.sakarya.edu.tr`
 * must be listed on its own, and `evil-sakarya.edu.tr` or `sakarya.edu.tr.evil.com` never match.
 */
export function isSchoolEmail(email: string, allowedDomains: string[]): boolean {
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  return allowedDomains.includes(email.slice(at + 1).toLowerCase());
}
