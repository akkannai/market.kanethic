// "Talk to Kanethic" -> WhatsApp 9998170093 (default). Override: NEXT_PUBLIC_WHATSAPP (country code sathe digits) ke NEXT_PUBLIC_CONTACT_URL.
const DEFAULT_WHATSAPP = '919998170093';
export function contactHref(message: string): string {
  const url = process.env.NEXT_PUBLIC_CONTACT_URL;
  if (url && /^https?:\/\//.test(url)) return url;
  const wa = (process.env.NEXT_PUBLIC_WHATSAPP || DEFAULT_WHATSAPP).replace(/\D/g, '');
  return `https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
}
