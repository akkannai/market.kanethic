import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryDetailPage } from '@/components/mf-nav';
export const metadata: Metadata = { title: 'Mutual Fund Category' };
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,130}$/.test(slug)) notFound();
  return <CategoryDetailPage slug={slug} />;
}
