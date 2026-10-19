import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { sections } from '@/lib/instruments';
import { CalendarPage, CommoditiesPage, CurrenciesPage, GlobalPage, IndiaPage, NewsPage, SourcesPage, WatchlistPage } from '@/components/sections';

const pages: Record<string, () => React.ReactNode> = {
  india: IndiaPage, global: GlobalPage, currencies: CurrenciesPage, commodities: CommoditiesPage,
  news: NewsPage, calendar: CalendarPage, watchlist: WatchlistPage, sources: SourcesPage,
};

export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(pages).map((section) => ({ section }));

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  return { title: sections.find((s) => s.slug === section)?.label };
}

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const Comp = pages[section];
  if (!Comp) notFound();
  return <Comp />;
}
