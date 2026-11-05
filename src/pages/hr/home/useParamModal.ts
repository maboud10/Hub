/**
 * Deep-linkable modal state for the HR Home. A modal opens when `?<key>=1` is
 * in the URL (hero, command palette, notifications) or when opened locally
 * (cards, next steps), and the param — plus an optional companion such as
 * `case` — is removed with `replace` when it closes.
 */
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';

export function useParamModal(key: string, companion?: string) {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get(key) === '1';
  const [local, setLocal] = useState(false);
  const hasParam = params.has(key) || (!!companion && params.has(companion));

  const show = useCallback(() => setLocal(true), []);
  const close = useCallback(() => {
    setLocal(false);
    if (!hasParam) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(key);
        if (companion) next.delete(companion);
        return next;
      },
      { replace: true },
    );
  }, [hasParam, key, companion, setParams]);

  return { open: fromUrl || local, show, close, param: companion ? params.get(companion) : null };
}
