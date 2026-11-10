/**
 * Asset tag sticker — real QR code (deep link to the device), barcode stripes,
 * tag, model and "Property of Helix". Print uses print-only CSS so only the
 * sticker reaches the printer.
 */
import { useMemo } from 'react';
import { Printer, QrCode as QrIcon } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/store/toast';
import type { Device } from '@/helpdesk/types';
import { barcodeStripes, encodeQr } from '@/helpdesk/qr';
import { KIND_LABEL } from '@/helpdesk/meta';

export const deviceUrl = (tag: string) => `${typeof window !== 'undefined' ? window.location.origin : 'https://nexus.helix'}/helpdesk/fleet/${tag}`;

export function QrSvg({ text, size = 96, quiet = 2 }: { text: string; size?: number; quiet?: number }) {
  const qr = useMemo(() => encodeQr(text), [text]);
  const n = qr.size + quiet * 2;
  const d = useMemo(() => {
    let p = '';
    qr.modules.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) p += `M${x + quiet},${y + quiet}h1v1h-1z`;
      }),
    );
    return p;
  }, [qr, quiet]);
  return (
    <svg className="hd-qr" width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label={`QR code for ${text}`}>
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#0b1020" />
    </svg>
  );
}

function Barcode({ text, height = 26 }: { text: string; height?: number }) {
  const stripes = useMemo(() => barcodeStripes(text, 52), [text]);
  let x = 0;
  const bars: { x: number; w: number }[] = [];
  stripes.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return (
    <svg className="hd-barcode" viewBox={`0 0 ${x} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#0b1020" />
      ))}
    </svg>
  );
}

export function AssetSticker({ d }: { d: Device }) {
  return (
    <div className="hd-sticker" data-qa="sticker">
      <div className="hd-sticker__qr">
        <QrSvg text={deviceUrl(d.assetTag)} size={104} />
      </div>
      <div className="hd-sticker__body">
        <div className="hd-sticker__brand">
          <span className="hd-sticker__logo" aria-hidden="true" />
          Property of Helix
        </div>
        <div className="hd-sticker__tag">{d.assetTag}</div>
        <div className="hd-sticker__model">
          {d.model} · {KIND_LABEL[d.kind]}
        </div>
        <Barcode text={d.assetTag} />
        <div className="hd-sticker__foot">
          <span>SN {d.serial}</span>
          <span>it.helix · ext 4357</span>
        </div>
      </div>
    </div>
  );
}

export function StickerModal({ d, open, onClose }: { d: Device; open: boolean; onClose: () => void }) {
  const print = () => {
    const root = document.documentElement;
    const done = () => {
      root.classList.remove('hd-print-sticker');
      window.removeEventListener('afterprint', done);
    };
    root.classList.add('hd-print-sticker');
    window.addEventListener('afterprint', done);
    try {
      window.print();
    } catch {
      toast.error('Printing isn’t available here');
    }
    window.setTimeout(done, 1500);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={520}
      className="neo-portal hd-stickermodal"
      icon={
        <span className="hd-fixmodal__icon">
          <QrIcon />
        </span>
      }
      title="Asset tag sticker"
      subtitle="Scan the QR code to open this device in the Fleet console"
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Close
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={print} data-qa="sticker-print">
            <Printer /> Print sticker
          </button>
        </>
      }
    >
      <div className="hd-sticker-stage">
        <AssetSticker d={d} />
      </div>
      <p className="hd-sticker-hint">Prints at 62 × 29 mm on the Brother label printers in every IT bar. Only the sticker is printed.</p>
    </Modal>
  );
}
