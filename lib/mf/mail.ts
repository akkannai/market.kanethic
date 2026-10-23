import nodemailer from 'nodemailer';
import { exec, q, utcNow } from './db.ts';

// Failure alert: SMTP env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, ALERT_EMAIL (default alpesh@kanethic.com)
export const alertTo = () => process.env.ALERT_EMAIL || 'alpesh@kanethic.com';
export const mailConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

function transport() {
  const port = Number(process.env.SMTP_PORT) || 465;
  return nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 10_000, socketTimeout: 15_000 });
}

export async function sendMail(subject: string, text: string): Promise<{ sent: boolean; reason?: string }> {
  if (!mailConfigured()) return { sent: false, reason: 'SMTP not configured' };
  try {
    await transport().sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: alertTo(), subject, text });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Ek j kaaran mate 3 kalak ma ek j email (spam na thay e mate). */
export async function alert(key: string, subject: string, text: string, throttleH = 3) {
  const src = `alert:${key}`;
  const [row] = await q<{ last_checked_at: string | null }>('SELECT last_checked_at FROM data_status WHERE source=?', [src]);
  if (row?.last_checked_at && Date.now() - Date.parse(row.last_checked_at.replace(' ', 'T') + 'Z') < throttleH * 3600_000) return { sent: false, reason: 'throttled' };
  const r = await sendMail(`[Kanethic MF] ${subject}`, text);
  await exec('INSERT INTO data_status (source, last_checked_at, last_error) VALUES (?,?,?) ON DUPLICATE KEY UPDATE last_checked_at=VALUES(last_checked_at), last_error=VALUES(last_error)', [src, utcNow(), r.sent ? null : r.reason ?? null]);
  return r;
}
