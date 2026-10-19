// "Talk to us" button: .env ma NEXT_PUBLIC_WHATSAPP (country code sathe digits, jem 919XXXXXXXXX) ke NEXT_PUBLIC_CONTACT_URL set karo.
// Beyma thi koi na hoy to button batavvama aavto nathi. Build time par inline thay che.
export function contactHref(message: string): string | null {
  const wa = (process.env.NEXT_PUBLIC_WHATSAPP || '').replace(/\D/g, '');
  if (wa.length >= 10) return `https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
  const url = process.env.NEXT_PUBLIC_CONTACT_URL;
  return url && /^https?:\/\//.test(url) ? url : null;
}
