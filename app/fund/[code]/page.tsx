import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FundView } from '@/components/funds';
import { isSchemeCode } from '@/lib/mfapi';

export const metadata: Metadata = { title: 'Mutual fund NAV' };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isSchemeCode(code)) notFound();
  return <FundView code={code} />;
}
