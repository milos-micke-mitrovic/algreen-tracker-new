import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { tabletApi, processesApi } from '@algreen/api-client';
import { useAuthStore } from '@algreen/auth';
import type { TabletIncomingDto } from '@algreen/shared-types';
import { useTranslation, useEnumTranslation } from '@algreen/i18n';
import { AttachmentIndicator } from '../../components/AttachmentIndicator';
import { AttachmentViewer } from '../../components/AttachmentViewer';
import { useWorkSessionStore } from '../../stores/work-session-store';

export function IncomingOrdersPage() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const processId = useWorkSessionStore((s) => s.processId);
  const { t } = useTranslation('tablet');
  const { tEnum } = useEnumTranslation();
  const location = useLocation();
  const highlightId = (location.state as { highlightId?: string } | null)?.highlightId;
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);

  const { data: incoming, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['tablet-incoming', processId, tenantId],
    queryFn: () => tabletApi.getIncoming(processId!, tenantId!).then((r) => r.data),
    enabled: !!tenantId && !!processId,
    refetchInterval: 60_000,
  });

  // Auto-expand and highlight item from notification
  useEffect(() => {
    if (highlightId && incoming) {
      const match = incoming.find(
        (i) => i.orderId === highlightId || i.orderItemProcessId === highlightId,
      );
      if (match) {
        setExpandedItemId(match.orderItemProcessId);
        setHighlightedId(match.orderItemProcessId);
        const timer = setTimeout(() => setHighlightedId(null), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [highlightId, incoming]);

  const { data: processes } = useQuery({
    queryKey: ['processes', tenantId],
    queryFn: () => processesApi.getAll({ tenantId: tenantId!, pageSize: 100 }).then((r) => r.data.items),
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
  });

  const processNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (processes) {
      for (const p of processes) {
        map.set(p.id, p.name);
      }
    }
    return map;
  }, [processes]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <span className="inline-block w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
        <span className="text-tablet-sm text-gray-400">{t('common:messages.loading')}</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <p className="text-tablet-base text-red-600">{t('incoming.loadFailed')}</p>
        <button
          onClick={() => refetch()}
          className="bg-primary-500 text-white px-6 py-3 rounded-xl text-tablet-sm font-semibold"
        >
          {t('incoming.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-tablet-xl font-bold">{t('incoming.title')}</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-2 rounded-lg text-gray-500 active:bg-gray-100 disabled:opacity-50"
        >
          <svg
            width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={isFetching ? 'animate-spin' : ''}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>
      <p className="text-gray-500 text-tablet-sm">
        {t('incoming.subtitle')}
      </p>

      {!incoming?.length ? (
        <div className="text-center text-gray-400 py-12 text-tablet-base">
          {t('incoming.noOrders')}
        </div>
      ) : (
        <div className="space-y-3">
          {incoming.slice(0, visibleCount).map((item) => (
            <IncomingCard
              key={item.orderItemProcessId}
              item={item}
              isExpanded={expandedItemId === item.orderItemProcessId}
              isHighlighted={highlightedId === item.orderItemProcessId}
              onToggle={() =>
                setExpandedItemId(
                  expandedItemId === item.orderItemProcessId ? null : item.orderItemProcessId,
                )
              }
              processNameMap={processNameMap}
              t={t}
              tEnum={tEnum}
            />
          ))}
          {incoming.length > visibleCount && (
            <button
              onClick={() => setVisibleCount((c) => c + 10)}
              className="w-full py-3 text-center text-tablet-sm font-semibold text-primary-500 bg-white rounded-xl border border-gray-200 active:bg-gray-50"
            >
              {t('tablet:common.loadMore', { remaining: incoming.length - visibleCount })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function IncomingCard({
  item,
  isExpanded,
  isHighlighted,
  onToggle,
  processNameMap,
  t,
  tEnum,
}: {
  item: TabletIncomingDto;
  isExpanded: boolean;
  isHighlighted: boolean;
  onToggle: () => void;
  processNameMap: Map<string, string>;
  t: (key: string, opts?: Record<string, unknown>) => string;
  tEnum: (enumName: string, value: string) => string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const daysUntilDelivery = Math.ceil(
    (new Date(item.deliveryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  const borderColor =
    daysUntilDelivery <= 3
      ? 'border-red-300'
      : daysUntilDelivery <= 5
        ? 'border-yellow-300'
        : 'border-gray-200';

  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted]);

  return (
    <div
      ref={cardRef}
      className={`card border-2 ${borderColor} ${isExpanded ? 'ring-2 ring-primary-300' : ''} ${isHighlighted ? 'animate-highlight-glow' : ''}`}
    >
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-tablet-lg font-bold">{item.orderNumber}</span>
            <span className="bg-primary-500 text-white px-2 py-0.5 rounded-full text-tablet-xs font-medium">
              P{item.priority}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-tablet-sm font-medium">
              {t('incoming.incoming')}
            </span>
            <svg
              width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        <div className="flex items-center justify-between text-tablet-sm text-gray-600 mb-2">
          <span>{item.productName}</span>
          <span>{t('queue.qty', { count: item.quantity })}</span>
          <span className={daysUntilDelivery <= 3 ? 'text-red-600 font-bold' : ''}>
            {t('incoming.daysLeft', { count: daysUntilDelivery })}
          </span>
        </div>

        <div className="flex items-center justify-between text-tablet-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">
              {t('queue.progress', { completed: item.completedProcessCount, total: item.totalProcessCount })}
            </span>
            <AttachmentIndicator orderId={item.orderId} />
          </div>
          {item.specialRequestNames.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.specialRequestNames.map((name) => (
                <span key={name} className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-tablet-xs">
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200 mt-3 pt-3 space-y-3">
          {/* Expanded details */}
          <div className="grid grid-cols-2 gap-2 text-tablet-xs">
            <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
              <span className="text-gray-500">{t('work.priority')}</span>
              <span className="font-semibold">P{item.priority}</span>
            </div>
            <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
              <span className="text-gray-500">{t('work.quantity')}</span>
              <span className="font-semibold">{item.quantity}</span>
            </div>
            <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
              <span className="text-gray-500">{t('work.deliveryDate')}</span>
              <span className={`font-semibold ${daysUntilDelivery <= 3 ? 'text-red-600' : ''}`}>
                {`${daysUntilDelivery}d`}
              </span>
            </div>
            {item.complexity && (
              <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
                <span className="text-gray-500">{t('work.complexity')}</span>
                <span className="font-semibold">{tEnum('ComplexityType', item.complexity)}</span>
              </div>
            )}
            <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5 col-span-2">
              <span className="text-gray-500">{t('work.progress')}</span>
              <span className="font-semibold">
                {item.completedProcessCount}/{item.totalProcessCount}
              </span>
            </div>
          </div>

          {/* Blocking processes */}
          {item.blockingProcesses.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2">
              <span className="text-tablet-sm text-orange-700 font-semibold">{t('incoming.blockedBy')}</span>
              {item.blockingProcesses.map((bp) => (
                <div key={bp.orderItemProcessId} className="flex items-center justify-between text-tablet-xs">
                  <span className="text-gray-700 font-medium">{processNameMap.get(bp.processId) ?? bp.processId}</span>
                  <span className="text-gray-500">{tEnum('ProcessStatus', bp.status)}</span>
                </div>
              ))}
            </div>
          )}

          <AttachmentViewer orderId={item.orderId} />
        </div>
      )}
    </div>
  );
}
