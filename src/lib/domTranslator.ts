/**
 * Reversible Real-Time DOM Localization Engine (`useDomTranslator`).
 *
 * When `locale === 'ar'`, observes the DOM via `MutationObserver` and translates
 * text nodes and UI attributes (`placeholder`, `title`, `aria-label`, `data-tip`)
 * into Arabic while storing the exact original English string in a `WeakMap`.
 * Switching back to `locale === 'en'` restores every node and attribute 1:1.
 */
import { useEffect } from 'react';
import { translateToArabic, useI18n } from './i18n';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT', 'SVG', 'PATH']);
const TRANSLATED_ATTRS = ['placeholder', 'title', 'aria-label', 'data-tip'] as const;

const originalTextMap = new WeakMap<Text, { source: string; output: string }>();
const originalAttrMap = new WeakMap<Element, Record<string, { source: string; output: string }>>();

function shouldSkipTextNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  if (SKIP_TAGS.has(parent.tagName)) return true;
  if (parent.closest('pre, code, .py-sif, .neo-mono[data-no-i18n]')) return true;
  return false;
}

export function useDomTranslator() {
  const locale = useI18n((s) => s.locale);
  const numerals = useI18n((s) => s.numerals);

  useEffect(() => {
    const root = document.body;
    if (!root) return;

    let applying = false;

    const processTextNode = (node: Text) => {
      if (shouldSkipTextNode(node)) return;
      const current = node.nodeValue ?? '';
      if (!current.trim()) return;

      const record = originalTextMap.get(node);
      if (locale === 'en') {
        if (record && current === record.output && record.source !== current) {
          node.nodeValue = record.source;
        }
        return;
      }

      // If React updated the text node with a new English value, update our source baseline
      const source = record && current === record.output ? record.source : current;
      const translated = translateToArabic(source, numerals);
      originalTextMap.set(node, { source, output: translated });
      if (translated !== current) {
        node.nodeValue = translated;
      }
    };

    const processElementAttrs = (el: Element) => {
      if (SKIP_TAGS.has(el.tagName)) return;
      let attrRecord = originalAttrMap.get(el);
      for (const attr of TRANSLATED_ATTRS) {
        const val = el.getAttribute(attr);
        if (!val || !val.trim()) continue;
        const saved = attrRecord?.[attr];
        if (locale === 'en') {
          if (saved && val === saved.output && saved.source !== val) {
            el.setAttribute(attr, saved.source);
          }
          continue;
        }
        const source = saved && val === saved.output ? saved.source : val;
        const translated = translateToArabic(source, numerals);
        if (!attrRecord) {
          attrRecord = {};
          originalAttrMap.set(el, attrRecord);
        }
        attrRecord[attr] = { source, output: translated };
        if (translated !== val) {
          el.setAttribute(attr, translated);
        }
      }
    };

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        processTextNode(node as Text);
        return;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (SKIP_TAGS.has(el.tagName)) return;
        processElementAttrs(el);
        let child = el.firstChild;
        while (child) {
          walk(child);
          child = child.nextSibling;
        }
      }
    };

    const runPass = (target: Node = root) => {
      if (applying) return;
      applying = true;
      try {
        walk(target);
      } finally {
        applying = false;
      }
    };

    runPass(root);

    if (locale === 'en') return;

    const observer = new MutationObserver((mutations) => {
      if (applying) return;
      applying = true;
      try {
        for (const m of mutations) {
          if (m.type === 'characterData') {
            processTextNode(m.target as Text);
          } else if (m.type === 'attributes' && m.target.nodeType === Node.ELEMENT_NODE) {
            processElementAttrs(m.target as Element);
          } else if (m.type === 'childList') {
            m.addedNodes.forEach((n) => walk(n));
          }
        }
      } finally {
        applying = false;
      }
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATED_ATTRS],
    });

    return () => observer.disconnect();
  }, [locale, numerals]);
}
