/**
 * Document viewer: renders one of my documents as a polished A4 sheet with
 * print / save-as-PDF (only the sheet is printed), "copy verification link"
 * for issued letters and a "Review & sign" hand-off for unsigned agreements.
 * Opened with `?doc=<id>`; documents that aren't yours never render here.
 */
import { useRef, type CSSProperties } from 'react';
import { Copy, Lock, Printer, SearchX, Signature } from 'lucide-react';
import { DOC_KIND_META } from '@/hr/constants';
import { useHr } from '@/hr/store';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { BRAND } from '@/config/brand';
import { formatDate } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/primitives';
import { copyText } from '@/pages/talent/components/format';
import { DocSheet } from './sheets';
import { printSheet, SOURCE_LABEL } from './model';

export function DocumentViewer({ docId, open, onClose, onSign }: { docId: string | null; open: boolean; onClose: () => void; onSign: (id: string) => void }) {
  const me = useSessionUser();
  const doc = useHr((s) => (docId ? s.documents.find((d) => d.id === docId) : undefined));
  const letter = useHr((s) => (doc?.letterId ? s.letters.find((l) => l.id === doc.letterId) : undefined));
  const sheet = useRef<HTMLElement>(null);

  if (!doc || !me || doc.userId !== me.id) {
    return (
      <Modal open={open} onClose={onClose} title="Document not available" width={480}>
        <EmptyState
          icon={<SearchX />}
          title={doc ? 'This document isn’t in your vault' : 'We couldn’t find that document'}
          action={
            <button type="button" className="btn btn--sm" onClick={onClose}>
              Back to my documents
            </button>
          }
        >
          This page only ever shows your own documents. Ask People Ops if something seems to be missing.
        </EmptyState>
      </Modal>
    );
  }

  const meta = DOC_KIND_META[doc.kind];
  const Icon = meta.icon;
  const unsigned = !!doc.signature?.required && !doc.signature.signedAt;
  const verifyUrl = letter?.status === 'issued' ? `https://verify.${BRAND.domain}/${letter.verifyCode}` : null;
  const copyLink = async () => {
    if (!verifyUrl) return;
    if (await copyText(verifyUrl)) toast.success('Verification link copied', 'Share it with the bank, landlord or embassy.');
    else toast.error('Couldn’t copy the link', verifyUrl);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={900}
      className="hr-doc-viewer"
      title={doc.title}
      subtitle={
        <span className="hr-doc-viewer__sub">
          <span>{meta.label}</span>
          <span>{SOURCE_LABEL[doc.source]}</span>
          <span>{formatDate(doc.createdAt)}</span>
          {doc.confidential && (
            <span className="hr-doc-lock">
              <Lock aria-hidden="true" /> Confidential
            </span>
          )}
        </span>
      }
      icon={
        <span className="hr-doc-kind" style={{ '--doc-h': meta.hue } as CSSProperties} aria-hidden="true">
          <Icon />
        </span>
      }
      footer={
        <>
          {verifyUrl && (
            <button type="button" className="btn btn--ghost hr-doc-viewer__copy" onClick={copyLink}>
              <Copy aria-hidden="true" /> Copy verify link
            </button>
          )}
          <button type="button" className="btn" onClick={() => printSheet(sheet.current, doc.title)}>
            <Printer aria-hidden="true" /> Print / save PDF
          </button>
          {unsigned ? (
            <button type="button" className="btn btn--primary" onClick={() => onSign(doc.id)}>
              <Signature aria-hidden="true" /> Review &amp; sign
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={onClose}>
              Done
            </button>
          )}
        </>
      }
    >
      <div className="hr-doc-stage">
        <DocSheet ref={sheet} doc={doc} />
      </div>
    </Modal>
  );
}
