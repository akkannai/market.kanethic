import { handle, json } from '@/lib/mf/api';
import { toCsv } from '@/lib/mf/csv';
import { categoryDetail, status } from '@/lib/mf/queries';
export const dynamic = 'force-dynamic';

export const GET = (req: Request, { params }: { params: Promise<{ slug: string }> }) => handle(async () => {
  const { slug } = await params;
  const sp = new URL(req.url).searchParams;
  const plan = sp.get('plan') === 'Direct' ? 'Direct' : 'Regular';
  const opt = ['Growth', 'IDCW', 'Bonus'].includes(sp.get('opt') ?? '') ? (sp.get('opt') as string) : 'Growth';
  const d = await categoryDetail(slug, plan, opt);
  if (!d) return json({ error: 'Category not found' }, 0, 404);
  if (sp.get('format') === 'csv') {
    const st = await status();
    const f = (n: number | null) => (n === null ? '' : n.toFixed(2));
    const body = toCsv(
      ['Scheme code', 'Scheme name', 'AMC', 'Plan', 'Option', 'NAV', 'NAV date', 'Previous NAV date', '1D change', '1D %', '1M %', '3M %', '6M %', '1Y % (absolute)', '3Y % (CAGR)', '5Y % (CAGR)'],
      d.rows.map((r) => [r.code, r.name, r.amc, r.plan, r.opt, r.nav, r.navDate, r.prevDate, r.chg === null ? '' : r.chg.toFixed(4), f(r.chgPct), f(r.r1m), f(r.r3m), f(r.r6m), f(r.r1y), f(r.r3y), f(r.r5y)]),
    ) + `\r\n"Source: AMFI India (NAVAll.txt); history mfapi.in. Data as of ${st.dataAsOf ?? ''}. Mutual fund investments are subject to market risks, read all scheme related documents carefully. Kanethic Private Limited, AMFI Registered MFD ARN-254247. For information only, not investment advice."\r\n`;
    return new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="kanethic-${slug}-${plan.toLowerCase()}-${opt.toLowerCase()}-${d.summary.navDate ?? 'nav'}.csv"`, 'Cache-Control': 'public, max-age=60' } });
  }
  return json({ ...d, status: await status() }, 60);
});
