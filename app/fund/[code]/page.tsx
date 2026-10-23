import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SchemePage } from '@/components/mf-scheme';
export const metadata: Metadata = { title: 'Mutual Fund NAV' };
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^\d{3,8}$/.test(code)) notFound();
  return <SchemePage code={code} />;
}
