import { adminConfigured, sameOrigin, sessionFrom } from '@/lib/mf/auth';
import { alertTo, sendMail } from '@/lib/mf/mail';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!adminConfigured() || !sessionFrom(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!sameOrigin(req)) return Response.json({ error: 'Bad origin' }, { status: 403 });
  const r = await sendMail('Test alert', 'This is a test alert from Kanethic Mutual Fund Intelligence. If you received this, failure emails will reach you.');
  return Response.json({ ...r, to: alertTo() });
}
