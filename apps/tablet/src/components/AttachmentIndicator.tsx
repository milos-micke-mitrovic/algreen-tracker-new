import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@algreen/api-client';

export function AttachmentIndicator({ orderId, orderItemId }: { orderId: string; orderItemId?: string }) {
  const { data: allAttachments } = useQuery({
    queryKey: ['order-attachments', orderId],
    queryFn: () => ordersApi.getAttachments(orderId).then((r) => r.data),
    enabled: !!orderId,
    staleTime: 5 * 60_000,
  });

  const attachments = orderItemId
    ? allAttachments?.filter((a) => a.orderItemId === null || a.orderItemId === orderItemId)
    : allAttachments;

  if (!attachments?.length) return null;

  return (
    <span className="inline-flex items-center gap-0.5 text-gray-400 text-tablet-xs">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
      </svg>
      <span>{attachments.length}</span>
    </span>
  );
}
