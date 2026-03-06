import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { tabletApi, processWorkflowApi, subProcessWorkflowApi, processesApi, blockRequestsApi } from '@algreen/api-client';
import { useAuthStore } from '@algreen/auth';
import { ProcessStatus, SubProcessStatus } from '@algreen/shared-types';
import type { TabletQueueItemDto, TabletActiveWorkDto, TabletSubProcessDto } from '@algreen/shared-types';
import { BigButton } from '../../components/BigButton';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AttachmentViewer } from '../../components/AttachmentViewer';
import { AttachmentIndicator } from '../../components/AttachmentIndicator';
import { useTranslation, useEnumTranslation } from '@algreen/i18n';
import { useWorkSessionStore } from '../../stores/work-session-store';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  const d = Math.floor(minutes / 1440);
  const remainH = Math.floor((minutes % 1440) / 60);
  return remainH > 0 ? `${d}d ${remainH}h` : `${d}d`;
}

function getApiErrorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
}

function getTranslatedError(error: unknown, t: (key: string, opts?: Record<string, string>) => string, fallback: string): string {
  const code = getApiErrorCode(error);
  if (code) {
    const translated = t(`common:errors.${code}`, { defaultValue: '' });
    if (translated) return translated;
  }
  return fallback;
}

export function OrderQueuePage() {
  const userId = useAuthStore((s) => s.user?.id);
  const tenantId = useAuthStore((s) => s.tenantId);
  const processId = useWorkSessionStore((s) => s.processId);
  const { t } = useTranslation('tablet');
  const { tEnum } = useEnumTranslation();
  const location = useLocation();
  const highlightId = (location.state as { highlightId?: string } | null)?.highlightId;
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);

  const { data: queue, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['tablet-queue', processId, tenantId],
    queryFn: () => tabletApi.getQueue(processId!, tenantId!).then((r) => r.data),
    enabled: !!tenantId && !!processId,
    refetchInterval: 60_000,
  });

  const { data: activeWork } = useQuery({
    queryKey: ['tablet-active', processId, tenantId],
    queryFn: () => tabletApi.getActive(processId!, tenantId!).then((r) => r.data),
    enabled: !!processId && !!tenantId,
    refetchInterval: 120_000,
  });

  const { data: processDefinition } = useQuery({
    queryKey: ['process', processId],
    queryFn: () => processesApi.getById(processId!).then((r) => r.data),
    enabled: !!processId,
    staleTime: 5 * 60_000,
  });

  const subProcessNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (processDefinition?.subProcesses) {
      for (const sp of processDefinition.subProcesses) {
        map.set(sp.id, sp.name);
      }
    }
    return map;
  }, [processDefinition]);

  const activeWorkMap = useMemo(() => {
    const map = new Map<string, TabletActiveWorkDto>();
    if (activeWork) {
      for (const w of activeWork) {
        map.set(w.orderItemProcessId, w);
      }
    }
    return map;
  }, [activeWork]);

  // Merge: show queue items + any active work items not already in queue
  const mergedItems = useMemo(() => {
    const items: TabletQueueItemDto[] = [...(queue ?? [])];
    const queueIds = new Set(items.map((i) => i.orderItemProcessId));
    if (activeWork) {
      for (const w of activeWork) {
        if (!queueIds.has(w.orderItemProcessId)) {
          items.push({
            orderItemProcessId: w.orderItemProcessId,
            orderId: w.orderId,
            orderNumber: w.orderNumber,
            priority: w.priority,
            deliveryDate: w.deliveryDate,
            productName: w.productName,
            quantity: w.quantity,
            complexity: w.complexity,
            status: w.status,
            specialRequestNames: w.specialRequestNames,
            completedProcessCount: w.completedProcessCount,
            totalProcessCount: w.totalProcessCount,
          });
        }
      }
    }
    return items.sort((a, b) => a.priority - b.priority);
  }, [queue, activeWork]);

  // Auto-expand and highlight item from notification
  useEffect(() => {
    if (highlightId && mergedItems.length) {
      const match = mergedItems.find(
        (i) => i.orderId === highlightId || i.orderItemProcessId === highlightId,
      );
      if (match) {
        setExpandedItemId(match.orderItemProcessId);
        setHighlightedId(match.orderItemProcessId);
        const timer = setTimeout(() => setHighlightedId(null), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [highlightId, mergedItems]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <span className="inline-block w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
        <span className="text-tablet-sm text-gray-400">{t('queue.loadingQueue')}</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <p className="text-tablet-base text-red-600">{t('queue.loadFailed')}</p>
        <button
          onClick={() => refetch()}
          className="bg-primary-500 text-white px-6 py-3 rounded-xl text-tablet-sm font-semibold"
        >
          {t('queue.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-tablet-xl font-bold">{t('queue.title')}</h1>
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
        {mergedItems.length === 1
          ? t('queue.activeOrder', { count: mergedItems.length })
          : t('queue.activeOrders', { count: mergedItems.length })}
      </p>

      {mergedItems.length === 0 ? (
        <div className="text-center text-gray-400 py-12 text-tablet-base">
          {t('queue.noOrders')}
        </div>
      ) : (
        <div className="space-y-3">
          {mergedItems.slice(0, visibleCount).map((item) => (
            <QueueCard
              key={item.orderItemProcessId}
              item={item}
              isExpanded={expandedItemId === item.orderItemProcessId}
              isHighlighted={highlightedId === item.orderItemProcessId}
              onToggle={() =>
                setExpandedItemId(
                  expandedItemId === item.orderItemProcessId ? null : item.orderItemProcessId,
                )
              }
              activeWork={activeWorkMap.get(item.orderItemProcessId)}
              subProcessNameMap={subProcessNameMap}
              userId={userId!}
              tenantId={tenantId!}
              t={t}
              tEnum={tEnum}
            />
          ))}
          {mergedItems.length > visibleCount && (
            <button
              onClick={() => setVisibleCount((c) => c + 10)}
              className="w-full py-3 text-center text-tablet-sm font-semibold text-primary-500 bg-white rounded-xl border border-gray-200 active:bg-gray-50"
            >
              {t('tablet:common.loadMore', { remaining: mergedItems.length - visibleCount })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function QueueCard({
  item,
  isExpanded,
  isHighlighted,
  onToggle,
  activeWork,
  subProcessNameMap,
  userId,
  tenantId,
  t,
  tEnum,
}: {
  item: TabletQueueItemDto;
  isExpanded: boolean;
  isHighlighted: boolean;
  onToggle: () => void;
  activeWork?: TabletActiveWorkDto;
  subProcessNameMap: Map<string, string>;
  userId: string;
  tenantId: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  tEnum: (enumName: string, value: string) => string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const daysUntilDelivery = Math.ceil(
    (new Date(item.deliveryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  const isBlocked = item.status === ProcessStatus.Blocked;
  const isInProgress = item.status === ProcessStatus.InProgress;
  const isPaused = isInProgress && activeWork != null && !activeWork.isTimerRunning;

  // Color: urgency takes priority, then started vs non-started
  const urgencyColor =
    daysUntilDelivery <= 3
      ? 'bg-red-100 border-red-300'
      : daysUntilDelivery <= 5
        ? 'bg-yellow-50 border-yellow-300'
        : isInProgress
          ? 'bg-amber-50 border-l-4 border-amber-400'
          : 'bg-white border-gray-200';

  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted]);

  return (
    <div ref={cardRef} className={`card border-2 ${urgencyColor} ${isExpanded ? 'ring-2 ring-primary-300' : ''} ${isHighlighted ? 'animate-highlight-glow' : ''}`}>
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-tablet-lg font-bold">{item.orderNumber}</span>
            {isBlocked && (
              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-tablet-xs font-medium">
                {tEnum('ProcessStatus', ProcessStatus.Blocked)}
              </span>
            )}
            {isInProgress && activeWork?.isTimerRunning && (
              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-tablet-xs font-medium">
                {t('work.working')}
              </span>
            )}
            {isPaused && (
              <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-tablet-xs font-medium">
                {t('work.paused')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-primary-500 text-white px-3 py-1 rounded-full text-tablet-sm font-medium">
              P{item.priority}
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
        <div className="flex items-center justify-between text-tablet-sm text-gray-600">
          <span>{item.productName}</span>
          <span>{t('queue.qty', { count: item.quantity })}</span>
          {item.complexity && <span>{tEnum('ComplexityType', item.complexity)}</span>}
          <span className={daysUntilDelivery <= 3 ? 'text-red-600 font-bold' : ''}>
            {t('queue.daysLeft', { count: daysUntilDelivery })}
          </span>
        </div>
        <div className="flex items-center justify-between mt-2 text-tablet-xs">
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
        <>
          <WorkPanel
            orderItemProcessId={item.orderItemProcessId}
            activeWork={activeWork}
            subProcessNameMap={subProcessNameMap}
            userId={userId}
            tenantId={tenantId}
            t={t}
            tEnum={tEnum}
          />
          <AttachmentViewer orderId={item.orderId} />
        </>
      )}
    </div>
  );
}

function WorkPanel({
  orderItemProcessId,
  activeWork,
  subProcessNameMap,
  userId,
  tenantId,
  t,
  tEnum,
}: {
  orderItemProcessId: string;
  activeWork?: TabletActiveWorkDto;
  subProcessNameMap: Map<string, string>;
  userId: string;
  tenantId: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  tEnum: (enumName: string, value: string) => string;
}) {
  const queryClient = useQueryClient();
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [activeMutationId, setActiveMutationId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState(false);

  const isWorking = activeWork?.status === ProcessStatus.InProgress;
  const isTimerRunning = activeWork?.isTimerRunning ?? false;
  const isPaused = isWorking && !isTimerRunning;
  const hasSubProcesses = (activeWork?.subProcesses?.length ?? 0) > 0;

  // Check if all sub-processes are completed/withdrawn (ready for process completion)
  const allSubsDone = activeWork?.subProcesses?.every(
    (sp) => sp.status === SubProcessStatus.Completed || sp.isWithdrawn,
  ) ?? false;

  // Compute elapsed = accumulated sub-process duration + current session time
  const elapsed = useMemo(() => {
    if (!activeWork) return 0;
    const prior = (activeWork.totalDurationMinutes ?? 0) * 60;
    if (isTimerRunning && activeWork.currentLogStartedAt) {
      const sinceLogStart = Math.floor((Date.now() - new Date(activeWork.currentLogStartedAt).getTime()) / 1000);
      return prior + Math.max(sinceLogStart, 0);
    }
    return prior;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWork?.totalDurationMinutes, activeWork?.currentLogStartedAt, isTimerRunning, tick]);

  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const handleError = (err: unknown, fallbackKey: string) => {
    setError(getTranslatedError(err, t as (key: string, opts?: Record<string, string>) => string, t(fallbackKey)));
  };

  const invalidateAndWait = async (keys: string[]) => {
    setPendingAction(true);
    await Promise.all(
      keys.map((k) => queryClient.invalidateQueries({ queryKey: [k] })),
    );
    // Wait for refetch to complete
    await Promise.all(
      keys.map((k) => queryClient.refetchQueries({ queryKey: [k] })),
    );
    setPendingAction(false);
  };

  const startMutation = useMutation({
    mutationFn: () => processWorkflowApi.start(orderItemProcessId, { userId }),
    onSuccess: async () => {
      setError(null);
      await invalidateAndWait(['tablet-active']);
    },
    onError: (err) => handleError(err, 'work.startFailed'),
  });

  const pauseMutation = useMutation({
    mutationFn: () => processWorkflowApi.stop(orderItemProcessId, { userId }),
    onSuccess: async () => {
      setError(null);
      await invalidateAndWait(['tablet-active']);
    },
    onError: (err) => handleError(err, 'work.pauseFailed'),
  });

  const resumeMutation = useMutation({
    mutationFn: () => processWorkflowApi.resume(orderItemProcessId, { userId }),
    onSuccess: async () => {
      setError(null);
      await invalidateAndWait(['tablet-active']);
    },
    onError: (err) => handleError(err, 'work.resumeFailed'),
  });

  const completeMutation = useMutation({
    mutationFn: () => processWorkflowApi.complete(orderItemProcessId),
    onSuccess: async () => {
      setError(null);
      setShowCompleteConfirm(false);
      await invalidateAndWait(['tablet-active', 'tablet-queue']);
    },
    onError: (err) => {
      setShowCompleteConfirm(false);
      handleError(err, 'work.completeFailed');
    },
  });

  const startSubMutation = useMutation({
    mutationFn: (id: string) => subProcessWorkflowApi.start(id, { userId }),
    onSuccess: async () => { setError(null); setActiveMutationId(null); await invalidateAndWait(['tablet-active']); },
    onError: (err) => { setActiveMutationId(null); handleError(err, 'work.startFailed'); },
  });

  const completeSubMutation = useMutation({
    mutationFn: (id: string) => subProcessWorkflowApi.complete(id, { userId }),
    onSuccess: async () => { setError(null); setActiveMutationId(null); await invalidateAndWait(['tablet-active']); },
    onError: (err) => { setActiveMutationId(null); handleError(err, 'work.completeFailed'); },
  });

  const blockMutation = useMutation({
    mutationFn: () =>
      blockRequestsApi.create({
        tenantId,
        orderItemProcessId,
        requestedByUserId: userId,
        requestNote: blockReason,
      }),
    onSuccess: async () => {
      setError(null);
      setShowBlockModal(false);
      setBlockReason('');
      setSuccess(t('work.blockSent'));
      setTimeout(() => setSuccess(null), 4000);
      await invalidateAndWait(['tablet-active', 'tablet-queue']);
    },
    onError: (err) => {
      setShowBlockModal(false);
      handleError(err, 'work.blockFailed');
    },
  });

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const daysUntilDelivery = activeWork
    ? Math.ceil((new Date(activeWork.deliveryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="border-t border-gray-200 mt-3 pt-3 space-y-4">
      {/* Order details */}
      {activeWork && (
        <div className="grid grid-cols-2 gap-2 text-tablet-xs">
          <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
            <span className="text-gray-500">{t('work.priority')}</span>
            <span className="font-semibold">P{activeWork.priority}</span>
          </div>
          <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
            <span className="text-gray-500">{t('work.quantity')}</span>
            <span className="font-semibold">{activeWork.quantity}</span>
          </div>
          <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
            <span className="text-gray-500">{t('work.deliveryDate')}</span>
            <span className={`font-semibold ${daysUntilDelivery !== null && daysUntilDelivery <= 3 ? 'text-red-600' : ''}`}>
              {`${daysUntilDelivery}d`}
            </span>
          </div>
          {activeWork.complexity && (
            <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
              <span className="text-gray-500">{t('work.complexity')}</span>
              <span className="font-semibold">{tEnum('ComplexityType', activeWork.complexity)}</span>
            </div>
          )}
          {activeWork.startedAt && (
            <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5 col-span-2">
              <span className="text-gray-500">{t('work.startedAt')}</span>
              <span className="font-semibold">
                {new Date(activeWork.startedAt).toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
            </div>
          )}
          <div className="flex justify-between bg-gray-50 rounded px-3 py-1.5 col-span-2">
            <span className="text-gray-500">{t('work.progress')}</span>
            <span className="font-semibold">
              {activeWork.completedProcessCount}/{activeWork.totalProcessCount}
            </span>
          </div>
        </div>
      )}

      {/* Timer */}
      <div className="text-center py-4 bg-gray-50 rounded-xl">
        <div className="text-4xl font-mono font-bold text-primary-500">
          {formatTime(elapsed)}
        </div>
        <p className="text-gray-500 mt-1 text-tablet-xs">
          {isTimerRunning ? t('work.working') : isPaused ? t('work.paused') : t('work.readyToStart')}
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-tablet-sm">
          {error}
        </div>
      )}
      {/* Success message */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-tablet-sm">
          {success}
        </div>
      )}

      {/* Sub-processes */}
      {activeWork?.subProcesses && activeWork.subProcesses.length > 0 && (
        <div>
          <h3 className="text-tablet-sm font-semibold mb-2">{t('work.subProcesses')}</h3>
          <div className="space-y-2">
            {activeWork.subProcesses.map((sp) => {
              // Only allow starting the next pending sub-process (no in-progress one exists, and all before it are completed)
              const hasInProgress = activeWork.subProcesses.some(
                (s) => s.status === SubProcessStatus.InProgress,
              );
              const canStart = sp.status === SubProcessStatus.Pending && !hasInProgress;
              return (
                <SubProcessRow
                  key={sp.id}
                  subProcess={sp}
                  name={subProcessNameMap.get(sp.subProcessId)}
                  isLoading={activeMutationId === sp.id}
                  canStart={canStart}
                  onStart={() => { setActiveMutationId(sp.id); startSubMutation.mutate(sp.id); }}
                  onComplete={() => { setActiveMutationId(sp.id); completeSubMutation.mutate(sp.id); }}
                  tEnum={tEnum}
                  t={t}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        {!isWorking ? (
          <BigButton
            onClick={() => { setError(null); startMutation.mutate(); }}
            loading={startMutation.isPending || pendingAction}
          >
            {t('work.start')}
          </BigButton>
        ) : hasSubProcesses ? (
          <>
            {isTimerRunning ? (
              <BigButton
                variant="danger"
                onClick={() => { setError(null); pauseMutation.mutate(); }}
                loading={pauseMutation.isPending || pendingAction}
              >
                {t('work.pause')}
              </BigButton>
            ) : (
              <BigButton
                onClick={() => { setError(null); resumeMutation.mutate(); }}
                loading={resumeMutation.isPending || pendingAction}
              >
                {t('work.resume')}
              </BigButton>
            )}
            {allSubsDone && (
              <BigButton
                onClick={() => { setError(null); setShowCompleteConfirm(true); }}
                loading={completeMutation.isPending || pendingAction}
              >
                {t('work.complete')}
              </BigButton>
            )}
          </>
        ) : (
          <BigButton
            onClick={() => { setError(null); setShowCompleteConfirm(true); }}
            loading={completeMutation.isPending || pendingAction}
          >
            {t('work.complete')}
          </BigButton>
        )}

        <BigButton
          variant="secondary"
          onClick={() => setShowBlockModal(true)}
        >
          {t('work.reportIssue')}
        </BigButton>
      </div>

      {/* Complete confirmation dialog */}
      <ConfirmDialog
        open={showCompleteConfirm}
        title={t('work.confirmCompleteTitle')}
        message={t('work.confirmCompleteMessage')}
        confirmLabel={t('work.complete')}
        cancelLabel={t('common:actions.cancel')}
        variant="primary"
        loading={completeMutation.isPending}
        onConfirm={() => completeMutation.mutate()}
        onCancel={() => setShowCompleteConfirm(false)}
      />

      {/* Block request modal */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-tablet-lg font-bold text-center">{t('work.reportIssue')}</h2>
            <textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder={t('work.blockReasonPlaceholder')}
              className="w-full border border-gray-300 rounded-xl p-3 text-tablet-sm min-h-[120px] resize-none"
            />
            <div className="space-y-3">
              <button
                onClick={() => blockMutation.mutate()}
                disabled={!blockReason.trim() || blockMutation.isPending}
                className="w-full min-h-[48px] rounded-xl text-tablet-base font-semibold bg-red-600 text-white active:bg-red-700 disabled:opacity-50"
              >
                {blockMutation.isPending ? (
                  <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  t('work.submitBlock')
                )}
              </button>
              <button
                onClick={() => { setShowBlockModal(false); setBlockReason(''); }}
                disabled={blockMutation.isPending}
                className="w-full min-h-[48px] rounded-xl text-tablet-base font-semibold bg-gray-100 text-gray-700 active:bg-gray-200 disabled:opacity-50"
              >
                {t('common:actions.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubProcessRow({
  subProcess,
  name,
  isLoading,
  canStart,
  onStart,
  onComplete,
  tEnum,
  t,
}: {
  subProcess: TabletSubProcessDto;
  name?: string;
  isLoading: boolean;
  canStart: boolean;
  onStart: () => void;
  onComplete: () => void;
  tEnum: (enumName: string, value: string) => string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const isActive = subProcess.status === SubProcessStatus.InProgress;
  const isCompleted = subProcess.status === SubProcessStatus.Completed;
  const isWithdrawn = subProcess.isWithdrawn;

  if (isWithdrawn) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg border bg-gray-50 border-gray-200 opacity-60">
        <div>
          <span className="text-tablet-sm font-medium line-through">
            {name ?? tEnum('SubProcessStatus', subProcess.status)}
          </span>
          <span className="text-tablet-xs text-red-500 ml-2">{t('work.withdrawn')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${
      isCompleted ? 'bg-green-50 border-green-200' :
      isActive ? 'bg-blue-50 border-blue-200' :
      'bg-gray-50 border-gray-200'
    }`}>
      <div>
        <span className="text-tablet-sm font-medium">
          {name ?? tEnum('SubProcessStatus', subProcess.status)}
        </span>
        {name && (
          <span className="text-tablet-xs text-gray-500 ml-2">
            {tEnum('SubProcessStatus', subProcess.status)}
          </span>
        )}
        {subProcess.totalDurationMinutes > 0 && (
          <span className="text-tablet-xs text-gray-500 ml-2">
            {formatDuration(subProcess.totalDurationMinutes)}
          </span>
        )}
      </div>
      <div>
        {canStart && (
          <button
            onClick={onStart}
            disabled={isLoading}
            className="bg-primary-500 text-white px-4 py-1 rounded text-tablet-sm min-w-[70px] flex items-center justify-center"
          >
            {isLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              t('work.start')
            )}
          </button>
        )}
        {isActive && (
          <button
            onClick={onComplete}
            disabled={isLoading}
            className="bg-green-500 text-white px-4 py-1 rounded text-tablet-sm min-w-[70px] flex items-center justify-center"
          >
            {isLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              t('work.complete')
            )}
          </button>
        )}
        {isCompleted && (
          <span className="text-green-600 text-tablet-sm">{'\u2713'}</span>
        )}
      </div>
    </div>
  );
}
