interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'primary',
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const confirmColors =
    variant === 'danger'
      ? 'bg-red-600 text-white active:bg-red-700'
      : 'bg-primary-500 text-white active:bg-primary-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-tablet-lg font-bold text-center">{title}</h2>
        <p className="text-tablet-sm text-gray-600 text-center">{message}</p>
        <div className="space-y-3 pt-2">
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`w-full min-h-[48px] rounded-xl text-tablet-base font-semibold ${confirmColors} disabled:opacity-50`}
          >
            {loading ? (
              <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              confirmLabel
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="w-full min-h-[48px] rounded-xl text-tablet-base font-semibold bg-gray-100 text-gray-700 active:bg-gray-200 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
