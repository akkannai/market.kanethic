import type { Metadata } from 'next';
import { AdminPage } from '@/components/mf-admin';
export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };
export default function Page() { return <AdminPage />; }
