import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export default function Workbench({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, a[href], [tabindex="0"]') ?? []);
    focusables()[0]?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = focusables();
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', listener);
    return () => { window.removeEventListener('keydown', listener); previous?.focus(); };
  }, []);
  return <div className="sheet-backdrop"><section ref={ref} className="workbench" role="dialog" aria-modal="true" aria-labelledby="workbench-title">
    <div className="workbench-heading"><h2 id="workbench-title">{title}</h2><button className="icon-btn" onClick={close} aria-label="Close workbench"><X size={18} /></button></div>
    {children}
  </section></div>;
}
