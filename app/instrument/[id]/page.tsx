import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { InstrumentView } from '@/components/instrument-view';
import { byId, catalog } from '@/lib/instruments';

export const dynamicParams = false;
export const generateStaticParams = () => catalog.map((i) => ({ id: i.id }));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: byId.get(id)?.name };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!byId.has(id)) notFound();
  return <InstrumentView id={id} />;
}
