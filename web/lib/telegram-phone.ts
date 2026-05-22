/** Country dial codes for Telegram login UI */

export const TELEGRAM_COUNTRY_OPTIONS = [
  { code: "IN", label: "India", dial: "91" },
  { code: "US", label: "United States", dial: "1" },
  { code: "GB", label: "United Kingdom", dial: "44" },
  { code: "AE", label: "UAE", dial: "971" },
  { code: "SG", label: "Singapore", dial: "65" },
  { code: "CA", label: "Canada", dial: "1" },
  { code: "AU", label: "Australia", dial: "61" },
  { code: "DE", label: "Germany", dial: "49" },
  { code: "FR", label: "France", dial: "33" },
  { code: "PK", label: "Pakistan", dial: "92" },
  { code: "BD", label: "Bangladesh", dial: "880" },
  { code: "LK", label: "Sri Lanka", dial: "94" },
  { code: "NP", label: "Nepal", dial: "977" },
] as const;

export function buildPhoneNumber(countryDial: string, localNumber: string): string {
  const dial = countryDial.replace(/\D/g, "");
  let local = localNumber.replace(/\D/g, "");
  if (!dial || local.length < 6) {
    throw new Error("Enter a valid phone number");
  }
  if (local.startsWith("0")) local = local.replace(/^0+/, "");
  return `+${dial}${local}`;
}

export function normalizePhone(phone: string) {
  const p = phone.trim().replace(/[\s-]/g, "");
  if (!/^\+\d{8,15}$/.test(p)) {
    throw new Error("Phone must be international format, e.g. +919876543210");
  }
  return p;
}

export function sanitizeOtpCode(code: string) {
  return code.replace(/\D/g, "").slice(0, 10);
}
