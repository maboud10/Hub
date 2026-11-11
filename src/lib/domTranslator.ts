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
const TRANSLATED_ATTRS = ['placeholder', 'title', 'aria-label', 'data-tip', 'aria-valuetext'] as const;

/** Elements that never get an automatic `dir`: typing direction in form fields belongs to the user. */
const NO_DIR_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION']);
/** Arabic letters only — Arabic-Indic digits (U+0660–0669, U+06F0–06F9) are deliberately excluded. */
const ARABIC_LETTER = /[\u0600-\u065F\u066A-\u06EF\u06FA-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_LETTER = /[A-Za-z]/;
const LTR_MARK = 'data-nx-ltr';
/** Inline tags a paragraph may contain and still be flipped as one unit. */
const PHRASING = new Set(['SPAN', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'DEL', 'INS', 'MARK', 'SMALL', 'SUB', 'SUP', 'CODE', 'KBD', 'ABBR', 'TIME', 'A', 'BDI', 'Q', 'CITE', 'BR', 'WBR']);
/** Paragraph-like elements whose inline content forms one bidi paragraph. */
const TEXT_BLOCKS = new Set(['P', 'LI', 'BLOCKQUOTE', 'DT', 'DD', 'FIGCAPTION', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const BLOCK_DISPLAY = new Set(['block', 'list-item', 'table-cell']);
const INLINE_DISPLAY = new Set(['inline', 'inline-block', 'none']);

const originalTextMap = new WeakMap<Text, { source: string; output: string }>();
const originalAttrMap = new WeakMap<Element, Record<string, { source: string; output: string }>>();

function shouldSkipTextNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  if (SKIP_TAGS.has(parent.tagName)) return true;
  // Code, file formats and user-written messages are never machine-translated word by word.
  if (parent.closest('pre, code, .py-sif, [data-no-i18n], .pc-md')) return true;
  return false;
}

const latinOnly = (text: string) => LATIN_LETTER.test(text) && !ARABIC_LETTER.test(text);

function setLtr(el: HTMLElement, on: boolean) {
  const marked = el.hasAttribute(LTR_MARK);
  if (on && !marked && !el.hasAttribute('dir')) {
    // `start`/`end` alignment would swap sides with `dir`; remember the side it sat on in the RTL layout.
    const align = getComputedStyle(el).textAlign;
    el.setAttribute(LTR_MARK, align === 'start' ? 'r' : align === 'end' ? 'l' : '');
    el.setAttribute('dir', 'ltr');
  } else if (!on && marked) {
    el.removeAttribute('dir');
    el.removeAttribute(LTR_MARK);
  }
}

/**
 * The paragraph an element's text belongs to — reached through inline tags only — provided everything
 * inside it really is inline. Flex/grid descendants disqualify it, because `dir` would mirror them.
 */
function textBlockOf(el: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el;
  while (cur && PHRASING.has(cur.tagName)) cur = cur.parentElement;
  if (!cur || !TEXT_BLOCKS.has(cur.tagName) || cur.isContentEditable) return null;
  if (!BLOCK_DISPLAY.has(getComputedStyle(cur).display)) return null;
  for (const d of cur.querySelectorAll('*')) {
    if (!PHRASING.has(d.tagName)) return null;
    const display = getComputedStyle(d).display;
    if (!INLINE_DISPLAY.has(display) && !(display === 'inline-flex' && d.childElementCount === 0)) return null;
  }
  return cur;
}

/**
 * In Arabic mode, text that is still pure Latin (names, messages, file titles, times) gets `dir="ltr"`,
 * so punctuation, numbers and ellipses keep English reading order inside the RTL layout ("Yes." not
 * ".Yes", "06:11 PM" not "PM 06:11"). A fully English paragraph flips as one unit so its bold/code/link
 * fragments stay in order; otherwise only leaf elements flip — flipping a container would also mirror
 * its icons and children. An app-set `dir` is always respected.
 */
function syncDirection(el: Element | null) {
  if (!(el instanceof HTMLElement) || NO_DIR_TAGS.has(el.tagName) || el.isContentEditable) return;
  const block = textBlockOf(el);
  if (block && latinOnly(block.textContent ?? '')) {
    setLtr(block, true);
    if (block !== el) setLtr(el, false);
    return;
  }
  if (block && block !== el) setLtr(block, false);
  setLtr(el, el.childElementCount === 0 && latinOnly(el.textContent ?? ''));
}

function clearDirections(root: Element) {
  root.querySelectorAll(`[${LTR_MARK}]`).forEach((el) => {
    el.removeAttribute('dir');
    el.removeAttribute(LTR_MARK);
  });
}

export function useDomTranslator() {
  const locale = useI18n((s) => s.locale);
  const numerals = useI18n((s) => s.numerals);

  useEffect(() => {
    const root = document.body;
    if (!root) return;
    if (locale === 'en') clearDirections(root);

    let applying = false;

    const processTextNode = (node: Text) => {
      const current = node.nodeValue ?? '';
      if (!current.trim()) return;
      if (shouldSkipTextNode(node)) {
        // Never translated, but skipped Latin text (code, file formats) still needs LTR order in Arabic.
        if (locale === 'ar') syncDirection(node.parentElement);
        return;
      }

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
      syncDirection(node.parentElement);
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
            syncDirection(m.target as Element);
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
