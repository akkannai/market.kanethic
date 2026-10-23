import type { Metadata } from 'next';
import { ComparePage } from '@/components/mf-scheme';
export const metadata: Metadata = { title: 'Compare Mutual Funds' };
export default function Page() { return <ComparePage />; }
