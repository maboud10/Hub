/**
 * HR Portal · Documents — my vault (rendered A4 documents, upload), e-signatures,
 * the instant letter generator, payslips and policy acknowledgements. Tabs
 * honour `?tab=vault|sign|letters|payslips|policies`; `&new=<letterKind>` presets
 * the letter generator; `&doc=<id>` opens a document. Always "mine": People Ops
 * never sees other people's documents here.
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { FolderLock, Receipt, ScrollText, Signature, Stamp, type LucideIcon } from 'lucide-react';
import { NeoTabs } from '@/components/neo';
import { POLICIES } from '@/hr/constants';
import { useHr } from '@/hr/store';
import { useSessionUser } from '@/store/selectors';
import { Vault } from './documents/Vault';
import { SignModal, SignTab } from './documents/SignTab';
import { LettersTab } from './documents/LettersTab';
import { PayslipsTab } from './documents/PayslipsTab';
import { PoliciesTab } from './documents/PoliciesTab';
import { DocumentViewer } from './documents/DocumentViewer';
import { DOC_TABS, isDocTab, isLetterKind, policyState, useMyDocuments, type DocTab } from './documents/model';

const TAB_META: Record<DocTab, { label: string; icon: LucideIcon }> = {
  vault: { label: 'Vault', icon: FolderLock },
  sign: { label: 'To sign', icon: Signature },
  letters: { label: 'Letters', icon: Stamp },
  payslips: { label: 'Payslips', icon: Receipt },
  policies: { label: 'Policies', icon: ScrollText },
};

export function DocumentsPage() {
  const [params, setParams] = useSearchParams();
  const me = useSessionUser();
  const mine = useMyDocuments();
  const acks = useHr((s) => s.acks);
  const letters = useHr((s) => s.letters);

  const tabParam = params.get('tab');
  const newParam = params.get('new');
  const preset = isLetterKind(newParam) ? newParam : null;
  const tab: DocTab = isDocTab(tabParam) ? tabParam : preset ? 'letters' : 'vault';

  // Viewer: open while `?doc=` is present; remember the last id so it can animate closed.
  const docParam = params.get('doc');
  const [lastDoc, setLastDoc] = useState(docParam);
  if (docParam && docParam !== lastDoc) setLastDoc(docParam);
  const [signId, setSignId] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);

  const counts = useMemo<Record<DocTab, number>>(() => {
    const toSign = mine.filter((d) => d.signature?.required && !d.signature.signedAt).length;
    const policies = POLICIES.filter((p) => p.mandatory && policyState(p, acks, me?.id).state !== 'done').length;
    const pendingLetters = letters.filter((l) => l.userId === me?.id && l.status === 'pending').length;
    return { vault: 0, sign: toSign, letters: pendingLetters, payslips: 0, policies };
  }, [mine, acks, letters, me]);

  const update = useCallback(
    (fn: (p: URLSearchParams) => void) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          fn(next);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  const setTab = (t: DocTab) =>
    update((p) => {
      p.set('tab', t);
      p.delete('new');
    });
  const openDoc = useCallback(
    (id: string) =>
      update((p) => {
        p.set('doc', id);
        p.delete('new');
      }),
    [update],
  );
  const closeDoc = useCallback(() => update((p) => p.delete('doc')), [update]);
  const clearPreset = useCallback(() => update((p) => p.delete('new')), [update]);
  const openSign = useCallback((id: string) => {
    setSignId(id);
    setSignOpen(true);
  }, []);
  const closeSign = useCallback(() => setSignOpen(false), []);

  const tabItems = useMemo(
    () =>
      DOC_TABS.map((t) => {
        const m = TAB_META[t];
        const Icon = m.icon;
        return {
          value: t,
          label: m.label,
          icon: <Icon aria-hidden="true" />,
          count: counts[t] > 0 ? counts[t] : null,
        };
      }),
    [counts],
  );

  return (
    <div className="hr-doc">
      <div className="hr-doc-tabs-bar">
        <NeoTabs value={tab} onChange={setTab} items={tabItems} label="Documents" className="hr-doc-tabs" />
      </div>
      <div id="hr-doc-panel" role="tabpanel" className="hr-doc-panel">
        {tab === 'vault' && <Vault onOpen={openDoc} onSign={openSign} onLetters={() => setTab('letters')} />}
        {tab === 'sign' && <SignTab onSign={openSign} onOpen={openDoc} />}
        {tab === 'letters' && <LettersTab preset={preset} onOpenDoc={openDoc} onClearPreset={clearPreset} />}
        {tab === 'payslips' && <PayslipsTab />}
        {tab === 'policies' && <PoliciesTab />}
      </div>
      <DocumentViewer
        docId={docParam ?? lastDoc}
        open={!!docParam}
        onClose={closeDoc}
        onSign={(id) => {
          closeDoc();
          openSign(id);
        }}
      />
      <SignModal docId={signId} open={signOpen} onClose={closeSign} />
    </div>
  );
}
