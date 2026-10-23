import type { Metadata } from 'next';
import { CategoriesPage } from '@/components/mf-nav';
export const metadata: Metadata = { title: 'Mutual Fund Categories' };
export default function Page() { return <CategoriesPage />; }
