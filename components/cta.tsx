'use client';
import { MessageCircle } from 'lucide-react';
import { contactHref } from '@/lib/contact';
import { useT } from './lang';

export function TalkToUs({ message, compact = false }: { message?: string; compact?: boolean }) {
  const t = useT();
  const href = contactHref(message ?? 'Hello Kanethic, I would like to know more about investing in mutual funds.');
  return (
    <a className={`cta-btn ${compact ? 'compact' : ''}`} href={href} target="_blank" rel="noopener noreferrer">
      <MessageCircle size={16} aria-hidden /> {t('Talk to Kanethic')}
    </a>
  );
}

export function FloatingCta() {
  const t = useT();
  const href = contactHref('Hello Kanethic, I would like to know more about mutual fund investing.');
  return (
    <a className="cta-float" href={href} target="_blank" rel="noopener noreferrer" aria-label={t('Talk to Kanethic on WhatsApp')}>
      <MessageCircle size={18} aria-hidden /> <span>{t('Talk to Kanethic')}</span>
    </a>
  );
}

export function CtaBand({ message }: { message?: string }) {
  const t = useT();
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
