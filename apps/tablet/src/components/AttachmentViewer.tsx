import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@algreen/api-client';
import type { OrderAttachmentDto } from '@algreen/shared-types';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(contentType: string): boolean {
  return contentType.startsWith('image/');
}

function isPdf(contentType: string): boolean {
  return contentType === 'application/pdf';
}

interface AttachmentViewerProps {
  orderId: string;
}

export function AttachmentViewer({ orderId }: AttachmentViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<OrderAttachmentDto | null>(null);
  const [viewingPdf, setViewingPdf] = useState<OrderAttachmentDto | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ['order-attachments', orderId],
    queryFn: () => ordersApi.getAttachments(orderId).then((r) => r.data),
    enabled: !!orderId,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="mt-3 text-center text-gray-400 text-tablet-xs">
        Učitavanje...
      </div>
    );
  }

  if (attachments.length === 0) return null;

  const getUrl = (a: OrderAttachmentDto) =>
    ordersApi.getAttachmentDownloadUrl(orderId, a.id);

  const handleOpen = async (a: OrderAttachmentDto) => {
    if (isPdf(a.contentType)) {
      setViewingPdf(a);
      setPdfLoading(true);
      try {
        const resp = await fetch(getUrl(a));
        const blob = await resp.blob();
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        setPdfBlobUrl(url + '#toolbar=0&navpanes=0');
      } catch {
        setPdfBlobUrl(null);
      } finally {
        setPdfLoading(false);
      }
    } else {
      setViewingAttachment(a);
    }
  };

  const closePdf = () => {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl.split('#')[0]);
    setPdfBlobUrl(null);
    setViewingPdf(null);
  };

  return (
    <div className="mt-3">
      {/* Toggle button — large touch target */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-tablet-base font-semibold text-gray-700 py-3 px-2 rounded-lg active:bg-gray-100"
      >
        <span>
          📎 Dokumenti ({attachments.length})
        </span>
        <svg
          width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="grid grid-cols-2 gap-3 mt-2">
          {attachments.map((a) => (
            <button
              key={a.id}
              onClick={() => handleOpen(a)}
              className="block border-2 border-gray-200 rounded-xl overflow-hidden text-left w-full bg-white active:border-primary-400 active:bg-primary-50 transition-colors"
            >
              {isImage(a.contentType) ? (
                <img
                  src={getUrl(a)}
                  alt={a.originalFileName}
                  className="w-full h-32 object-cover"
                />
              ) : (
                <div className="w-full h-32 flex flex-col items-center justify-center bg-red-50">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <span className="text-tablet-sm text-red-500 mt-1 font-bold">PDF</span>
                </div>
              )}
              <div className="px-3 py-2">
                <div className="text-tablet-sm text-gray-700 truncate font-medium">{a.originalFileName}</div>
                <div className="text-tablet-xs text-gray-400">{formatFileSize(a.fileSizeBytes)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen image viewer — tap anywhere to close */}
      {viewingAttachment && isImage(viewingAttachment.contentType) && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col"
          onClick={() => setViewingAttachment(null)}
        >
          <div className="flex justify-between items-center p-3 bg-black/80">
            <span className="text-white text-tablet-sm truncate max-w-[70%]">
              {viewingAttachment.originalFileName}
            </span>
            <button
              onClick={() => setViewingAttachment(null)}
              className="text-white bg-red-600 rounded-xl px-5 py-3 text-tablet-base font-bold active:bg-red-700 min-w-[80px]"
            >
              Zatvori
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center overflow-auto p-2">
            <img
              src={getUrl(viewingAttachment)}
              alt={viewingAttachment.originalFileName}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div className="p-3 text-center bg-black/80">
            <span className="text-gray-400 text-tablet-sm">
              Dodirnite bilo gde za zatvaranje
            </span>
          </div>
        </div>
      )}

      {/* Fullscreen PDF viewer */}
      {viewingPdf && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex justify-between items-center p-3 bg-black/80">
            <span className="text-white text-tablet-sm truncate max-w-[70%]">
              {viewingPdf.originalFileName}
            </span>
            <button
              onClick={closePdf}
              className="text-white bg-red-600 rounded-xl px-5 py-3 text-tablet-base font-bold active:bg-red-700 min-w-[80px]"
            >
              Zatvori
            </button>
          </div>

          <div className="flex-1 p-2">
            {pdfLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-white text-tablet-base">Učitavanje...</span>
              </div>
            ) : pdfBlobUrl ? (
              <iframe
                src={pdfBlobUrl}
                className="w-full h-full rounded-lg"
                style={{ border: 'none', backgroundColor: '#fff' }}
                title={viewingPdf.originalFileName}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-white text-tablet-base">Greška pri učitavanju</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
