import type { Metadata } from 'next';
import { NavTodayPage } from '@/components/mf-nav';
export const metadata: Metadata = { title: 'NAV Today — Mutual Funds' };
export default function Page() { return <NavTodayPage />; }
