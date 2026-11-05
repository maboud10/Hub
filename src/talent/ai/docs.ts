/**
 * Client-side document text extraction for job descriptions and LinkedIn
 * "Save to PDF" profiles. Heavy parsers are lazy-loaded on first use:
 *   PDF  → pdf.js (worker)       DOCX → fflate unzip + WordprocessingML
 *   TXT / MD / RTF → read directly
 * Nothing leaves the browser.
 */

export interface ExtractedDoc {
  text: string;
  kind: 'pdf' | 'docx' | 'text';
  fileName: string;
  bytes: number;
  pages?: number;
}

export const ACCEPTED_DOC_TYPES =
  '.pdf,.docx,.txt,.md,.rtf,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

const decodeXml = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** WordprocessingML → plain text, keeping list items as "- " bullets so section parsing works. */
export function docxXmlToText(xml: string): string {
  return xml
    .split(/<\/w:p>/)
    .map((p) => {
      const isList = /<w:numPr>/.test(p);
      const t = decodeXml(
        p
          .replace(/<w:tab\/>/g, '\t')
          .replace(/<w:br[^>]*\/>/g, '\n')
          .replace(/<[^>]+>/g, ''),
      ).trim();
      return t ? (isList ? `- ${t}` : t) : '';
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\{\\\*[^{}]*\}/g, '')
    .replace(/\\'[0-9a-f]{2}/gi, '')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdf(file: File): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let line = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = '';
      }
    }
    if (line) lines.push(line);
    pages.push(lines.join('\n'));
  }
  const numPages = doc.numPages;
  await doc.destroy();
  return { text: pages.join('\n\n').replace(/[ \t]+\n/g, '\n').trim(), pages: numPages };
}

async function extractDocx(file: File): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => f.name === 'word/document.xml' });
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('This .docx has no readable document body.');
  return docxXmlToText(strFromU8(xml));
}

/** Extract readable text from an uploaded file. Throws a user-friendly Error on failure. */
export async function extractDocumentText(file: File): Promise<ExtractedDoc> {
  if (file.size > MAX_DOC_BYTES) throw new Error('That file is larger than 10 MB.');
  const name = file.name.toLowerCase();
  const base = { fileName: file.name, bytes: file.size };
  try {
    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      const { text, pages } = await extractPdf(file);
      if (!text.trim()) throw new Error('This PDF has no selectable text (it may be a scan). Paste the text instead.');
      return { ...base, kind: 'pdf', text, pages };
    }
    if (name.endsWith('.docx')) return { ...base, kind: 'docx', text: await extractDocx(file) };
    if (name.endsWith('.doc')) throw new Error('Legacy .doc files aren’t supported. Save as .docx or PDF.');
    const raw = await file.text();
    return { ...base, kind: 'text', text: name.endsWith('.rtf') ? stripRtf(raw) : raw.trim() };
  } catch (e) {
    throw e instanceof Error ? e : new Error('Couldn’t read that file.');
  }
}
