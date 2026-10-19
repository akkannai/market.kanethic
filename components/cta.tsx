'use client';
import { MessageCircle } from 'lucide-react';
import { contactHref } from '@/lib/contact';
import { useT } from './lang';

export function TalkToUs({ message, compact = false }: { message?: string; compact?: boolean }) {
  const t = useT();
  const href = contactHref(message ?? 'Hello Kanethic, I would like to know more about investing in mutual funds.');
  if (!href) return null;
  return (
    <a className={`cta-btn ${compact ? 'compact' : ''}`} href={href} target="_blank" rel="noopener noreferrer">
      <MessageCircle size={16} aria-hidden /> {t('Talk to us')}
    </a>
  );
}

export function CtaBand({ message }: { message?: string }) {
  const t = useT();
  if (!contactHref('x')) return null;
  return (
    <section className="cta-band">
      <div>
        <h2>{t('Ready to start investing?')}</h2>
        <p>{t('The Kanethic team will help you get started with SIPs and mutual funds — simple, disciplined and goal-based.')}</p>
      </div>
      <TalkToUs message={message} />
    </section>
  );
}
