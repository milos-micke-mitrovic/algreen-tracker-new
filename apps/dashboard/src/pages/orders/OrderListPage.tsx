import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Typography, Table, Button, Space, Select, Tag, Drawer, Form, Input,
  InputNumber, DatePicker, App, Row, Col, Spin, Popconfirm, Divider,
  Tooltip, Progress, Statistic, Upload, List,
} from 'antd';
import { PlusOutlined, DeleteOutlined, CheckOutlined, PaperClipOutlined, UndoOutlined, UploadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAuthStore } from '@algreen/auth';
import { OrderStatus, OrderType, ProcessStatus, ComplexityType, UserRole } from '@algreen/shared-types';
import type { OrderMasterViewDto, OrderDetailDto, OrderItemDto, ProcessDto, ProductCategoryDto, SpecialRequestTypeDto, AddOrderItemRequest } from '@algreen/shared-types';
import {
  useCreateOrder, useOrder, useActivateOrder,
  useUpdateOrder, useCancelOrder, usePauseOrder, useResumeOrder, useReopenOrder,
} from '../../hooks/useOrders';
import { productCategoriesApi, processesApi, ordersApi, specialRequestTypesApi } from '@algreen/api-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StatusBadge } from '../../components/StatusBadge';
import { OrderAttachments } from '../../components/OrderAttachments';
import { compressFile } from '../../utils/compressImage';
import { useTableHeight } from '../../hooks/useTableHeight';
import { useTranslation, useEnumTranslation } from '@algreen/i18n';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

// ─── Process status color mapping (matching Excel conditional formatting) ────

const processStatusColors: Record<ProcessStatus, string> = {
  [ProcessStatus.Completed]: '#92D050',   // Green - done
  [ProcessStatus.InProgress]: '#1890ff',  // Blue - in progress
  [ProcessStatus.Blocked]: '#FF0000',     // Red - blocked
  [ProcessStatus.Stopped]: '#FFAA00',     // Orange - stopped
  [ProcessStatus.Pending]: '#D9D9D9',     // Light gray - pending
  [ProcessStatus.Withdrawn]: '#F0F0F0',   // Very light gray - withdrawn
};

const orderTypeColors: Record<OrderType, string> = {
  [OrderType.Standard]: 'blue',
  [OrderType.Repair]: 'orange',
  [OrderType.Complaint]: 'red',
  [OrderType.Rework]: 'purple',
};

const orderTypeTextColors: Record<OrderType, string> = {
  [OrderType.Standard]: '#1677ff',
  [OrderType.Repair]: '#d46b08',
  [OrderType.Complaint]: '#cf1322',
  [OrderType.Rework]: '#531dab',
};

const orderStatusTextColors: Record<OrderStatus, string> = {
  [OrderStatus.Draft]: '#8c8c8c',
  [OrderStatus.Active]: '#389e0d',
  [OrderStatus.Paused]: '#d46b08',
  [OrderStatus.Cancelled]: '#cf1322',
  [OrderStatus.Completed]: '#08979c',
};

// ─── Helpers ─────────────────────────────────────────────

function getApiErrorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
}

function getTranslatedError(error: unknown, t: (key: string, opts?: Record<string, string>) => string, fallback: string): string {
  const resp = (error as { response?: { data?: { error?: { code?: string; message?: string } } } })?.response?.data?.error;
  if (resp?.code) {
    const translated = t(`common:errors.${resp.code}`, { defaultValue: '' });
    if (translated) return translated;
  }
  return resp?.message || fallback;
}

/** Aggregate process status across all items in an order for a given processId (used in detail drawer) */
function getAggregateProcessStatus(
  order: OrderDetailDto,
  processId: string,
): ProcessStatus | null {
  const statuses: ProcessStatus[] = [];
  for (const item of order.items) {
    const proc = item.processes.find((p) => p.processId === processId);
    if (proc) statuses.push(proc.status);
  }
  if (statuses.length === 0) return null;
  if (statuses.includes(ProcessStatus.Blocked)) return ProcessStatus.Blocked;
  if (statuses.includes(ProcessStatus.Stopped)) return ProcessStatus.Stopped;
  if (statuses.includes(ProcessStatus.InProgress)) return ProcessStatus.InProgress;
  if (statuses.includes(ProcessStatus.Pending)) return ProcessStatus.Pending;
  if (statuses.every((s) => s === ProcessStatus.Completed)) return ProcessStatus.Completed;
  if (statuses.every((s) => s === ProcessStatus.Withdrawn)) return ProcessStatus.Withdrawn;
  return ProcessStatus.Completed;
}

/** Count completed vs total processes across all items (used in detail drawer) */
function getCompletionInfo(order: OrderDetailDto): { completed: number; total: number } {
  let completed = 0;
  let total = 0;
  for (const item of order.items) {
    for (const proc of item.processes) {
      if (proc.status !== ProcessStatus.Withdrawn) {
        total++;
        if (proc.status === ProcessStatus.Completed) completed++;
      }
    }
  }
  return { completed, total };
}

/** Get deadline urgency level based on delivery date */
function getDeadlineLevel(
  deliveryDate: string,
  customWarningDays: number | null,
  customCriticalDays: number | null,
): 'critical' | 'warning' | 'normal' {
  const daysRemaining = dayjs(deliveryDate).diff(dayjs(), 'day');
  const criticalDays = customCriticalDays ?? 3;
  const warningDays = customWarningDays ?? 7;
  if (daysRemaining <= criticalDays) return 'critical';
  if (daysRemaining <= warningDays) return 'warning';
  return 'normal';
}

// ─── Process Status Cell (master table) ──────────────────

function ProcessCell({
  status,
  processName,
  tEnum,
}: {
  status: ProcessStatus | null;
  processName: string;
  tEnum: (enumName: string, value: string) => string;
}) {
  if (status === null) {
    return (
      <div style={{
        width: 24,
        height: 24,
        borderRadius: 4,
        border: '1px dashed #E0E0E0',
      }} />
    );
  }

  const color = processStatusColors[status];
  const label = tEnum('ProcessStatus', status);

  return (
    <Tooltip title={`${processName}: ${label}`}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 4,
          backgroundColor: color,
          border: '1px solid rgba(0,0,0,0.1)',
          cursor: 'default',
        }}
      />
    </Tooltip>
  );
}

// ─── Status as plain colored text (drawer header) ────────

function StatusText({ status }: { status: OrderStatus }) {
  const { tEnum } = useEnumTranslation();
  return (
    <Text style={{ color: orderStatusTextColors[status], fontWeight: 500 }}>
      #{tEnum('OrderStatus', status)}
    </Text>
  );
}

// ─── Process Timeline (drawer) ───────────────────────────

function ProcessTimeline({
  order,
  processes,
  tEnum,
}: {
  order: OrderDetailDto;
  processes: ProcessDto[];
  tEnum: (enumName: string, value: string) => string;
}) {
  const { t } = useTranslation('dashboard');
  const STEP = 48; // px per process step
  const CIRCLE = 24;
  const totalWidth = processes.length * STEP;

  // Pre-compute statuses
  const statuses = processes.map((proc) => getAggregateProcessStatus(order, proc.id));

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ position: 'relative', width: totalWidth, height: 44, marginLeft: 4, marginRight: 4 }}>
        {/* Connector lines layer */}
        {processes.map((proc, i) => {
          if (i === 0) return null;
          const prevCompleted = statuses[i - 1] === ProcessStatus.Completed;
          // Line goes from center of previous circle to center of current circle
          const x1 = (i - 1) * STEP + STEP / 2;
          const x2 = i * STEP + STEP / 2;
          return (
            <div
              key={`line-${proc.id}`}
              style={{
                position: 'absolute',
                left: x1,
                top: CIRCLE / 2 - 1,
                width: x2 - x1,
                height: 2,
                backgroundColor: prevCompleted ? '#92D050' : '#D9D9D9',
              }}
            />
          );
        })}
        {/* Circles + labels layer */}
        {processes.map((proc, i) => {
          const status = statuses[i];
          const color = status ? processStatusColors[status] : '#F0F0F0';
          const isCompleted = status === ProcessStatus.Completed;
          const x = i * STEP;

          return (
            <Tooltip key={proc.id} title={`${proc.name}: ${status ? tEnum('ProcessStatus', status) : t('orders.processNotApplicable')}`}>
              <div style={{ position: 'absolute', left: x, top: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', width: STEP }}>
                <div style={{
                  width: CIRCLE,
                  height: CIRCLE,
                  borderRadius: '50%',
                  backgroundColor: color,
                  border: '2px solid ' + (status ? color : '#D9D9D9'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'default',
                  position: 'relative',
                  zIndex: 1,
                }}>
                  {isCompleted && <CheckOutlined style={{ fontSize: 12, color: '#fff' }} />}
                </div>
                <Text style={{
                  fontSize: 10,
                  marginTop: 2,
                  color: '#888',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: STEP - 4,
                  textAlign: 'center',
                  display: 'block',
                }}>{proc.code}</Text>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

// ─── Item Process Rectangles (drawer item cards) ─────────

function ItemProcessBar({
  item,
  processMap,
  tEnum,
}: {
  item: OrderItemDto;
  processMap: Map<string, ProcessDto>;
  tEnum: (enumName: string, value: string) => string;
}) {
  const sorted = [...item.processes]
    .filter((p) => p.status !== ProcessStatus.Withdrawn)
    .sort((a, b) => {
      const pa = processMap.get(a.processId);
      const pb = processMap.get(b.processId);
      return (pa?.sequenceOrder ?? 0) - (pb?.sequenceOrder ?? 0);
    });

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {sorted.map((proc) => {
        const process = processMap.get(proc.processId);
        const color = processStatusColors[proc.status];
        const statusLabel = tEnum('ProcessStatus', proc.status);
        return (
          <Tooltip
            key={proc.id}
            title={
              <div>
                <div><b>{process?.name ?? proc.processId}</b></div>
                <div>{statusLabel}</div>
                {(proc.complexity || proc.totalDurationMinutes > 0) && (
                  <div>{proc.complexity ?? ''}{proc.totalDurationMinutes > 0 ? `${proc.complexity ? ' · ' : ''}${proc.totalDurationMinutes} min` : ''}</div>
                )}
              </div>
            }
          >
            <div style={{
              padding: '2px 6px',
              borderRadius: 4,
              backgroundColor: color,
              border: '1px solid rgba(0,0,0,0.1)',
              fontSize: 11,
              fontWeight: 500,
              color: proc.status === ProcessStatus.Pending || proc.status === ProcessStatus.Withdrawn ? '#666' : '#fff',
              cursor: 'default',
              lineHeight: '16px',
            }}>
              {process?.code ?? '?'}{proc.complexity ? <span style={{ opacity: 0.85 }}> {proc.complexity}</span> : null}
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────

export function OrderListPage() {
  const user = useAuthStore((s) => s.user);
  const tenantId = useAuthStore((s) => s.tenantId);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | undefined>(undefined);
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderType | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState<dayjs.Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<dayjs.Dayjs | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem('orders-pageSize');
    return saved ? Number(saved) : 20;
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, orderTypeFilter, dateFrom, dateTo]);

  const { data: masterResult, isLoading } = useQuery({
    queryKey: ['orders-master-view', tenantId, statusFilter, orderTypeFilter, debouncedSearch, dateFrom?.format('YYYY-MM-DD'), dateTo?.format('YYYY-MM-DD'), page, pageSize],
    queryFn: () => ordersApi.getMasterView({
      tenantId: tenantId!,
      status: statusFilter,
      orderType: orderTypeFilter,
      search: debouncedSearch || undefined,
      dateFrom: dateFrom?.format('YYYY-MM-DD'),
      dateTo: dateTo?.format('YYYY-MM-DD'),
      page,
      pageSize,
    }).then((r) => r.data),
    enabled: !!tenantId,
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreating, setIsCreating] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(() => searchParams.get('detail'));

  // Clear detail param from URL after reading it
  useEffect(() => {
    if (searchParams.has('detail')) {
      searchParams.delete('detail');
      setSearchParams(searchParams, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [addingItem, setAddingItem] = useState(false);
  const [createPendingItems, setCreatePendingItems] = useState<AddOrderItemRequest[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const { ref: tableWrapperRef, height: tableBodyHeight } = useTableHeight();

  const [localPriority, setLocalPriority] = useState<number | null>(null);
  const priorityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [itemForm] = Form.useForm();
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const cancelOrder = useCancelOrder();
  const reopenOrder = useReopenOrder();
  const pauseOrder = usePauseOrder();
  const resumeOrder = useResumeOrder();
  const { data: detailOrder, isLoading: detailLoading } = useOrder(detailOrderId ?? undefined);
  const activateMutation = useActivateOrder();
  const { data: categories } = useQuery({
    queryKey: ['product-categories', tenantId],
    queryFn: () => productCategoriesApi.getAll({ tenantId: tenantId!, pageSize: 100 }).then((r) => r.data.items),
    enabled: !!tenantId,
  });
  const { data: specialRequestTypes } = useQuery({
    queryKey: ['special-request-types', tenantId],
    queryFn: () => specialRequestTypesApi.getAll({ tenantId: tenantId!, pageSize: 100 }).then((r) => r.data.items),
    enabled: !!tenantId && !!detailOrderId,
  });
  const srtMap = useMemo(() => {
    const map = new Map<string, SpecialRequestTypeDto>();
    (specialRequestTypes ?? []).forEach((s) => map.set(s.id, s));
    return map;
  }, [specialRequestTypes]);
  const { message, modal } = App.useApp();
  const { t } = useTranslation('dashboard');
  const { tEnum } = useEnumTranslation();

  // Fetch all processes for master view columns
  const { data: processes } = useQuery({
    queryKey: ['processes', tenantId],
    queryFn: () => processesApi.getAll({ tenantId: tenantId!, pageSize: 100 }).then((r) =>
      [...r.data.items].sort((a, b) => a.sequenceOrder - b.sequenceOrder)
    ),
    enabled: !!tenantId,
  });

  // Process lookup map
  const processMap = useMemo(() => {
    const map = new Map<string, ProcessDto>();
    (processes ?? []).forEach((p) => map.set(p.id, p));
    return map;
  }, [processes]);

  const queryClient = useQueryClient();

  // ─── Pending state for unified form ──────────────────────
  const [pendingItems, setPendingItems] = useState<AddOrderItemRequest[]>([]);
  const [pendingItemRemovals, setPendingItemRemovals] = useState<string[]>([]);
  const [pendingComplexity, setPendingComplexity] = useState<Map<string, ComplexityType>>(new Map());
  const [pendingSpecialRequestAdds, setPendingSpecialRequestAdds] = useState<{ itemId: string; specialRequestTypeId: string }[]>([]);
  const [pendingSpecialRequestRemovals, setPendingSpecialRequestRemovals] = useState<{ itemId: string; specialRequestId: string }[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const clearPendingState = useCallback(() => {
    setPendingItems([]);
    setPendingItemRemovals([]);
    setPendingComplexity(new Map());
    setPendingSpecialRequestAdds([]);
    setPendingSpecialRequestRemovals([]);
    setAddingItem(false);
  }, []);

  const hasPendingChanges = pendingItems.length > 0 || pendingItemRemovals.length > 0 || pendingComplexity.size > 0 || pendingSpecialRequestAdds.length > 0 || pendingSpecialRequestRemovals.length > 0;

  const changePriorityMutation = useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: number }) => ordersApi.changePriority(id, priority),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['orders-master-view'] }); },
  });

  const withdrawMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { targetProcessId: string; reason: string; userId: string } }) =>
      ordersApi.withdraw(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders-master-view'] });
      queryClient.invalidateQueries({ queryKey: ['orders', detailOrderId] });
    },
  });

  useEffect(() => {
    if (detailOrder) {
      if (detailOrder.status === OrderStatus.Draft) {
        editForm.setFieldsValue({
          notes: detailOrder.notes,
          customWarningDays: detailOrder.customWarningDays,
          customCriticalDays: detailOrder.customCriticalDays,
        });
      }
      setLocalPriority(detailOrder.priority);
    }
  }, [detailOrder, editForm]);

  // Clear pending state when order changes
  useEffect(() => {
    clearPendingState();
  }, [detailOrderId, clearPendingState]);

  const debouncedPriorityChange = useCallback((orderId: string, val: number) => {
    if (priorityTimerRef.current) clearTimeout(priorityTimerRef.current);
    priorityTimerRef.current = setTimeout(() => {
      changePriorityMutation.mutate(
        { id: orderId, priority: val },
        {
          onSuccess: () => message.success(t('orders.priorityChanged')),
          onError: (err) => message.error(getTranslatedError(err, t, t('orders.priorityChangeFailed'))),
        },
      );
    }, 600);
  }, [changePriorityMutation, message, t]);

  const canCreate =
    user?.role === UserRole.SalesManager ||
    user?.role === UserRole.Manager ||
    user?.role === UserRole.Admin;

  const onCreateFinish = async (values: Record<string, unknown>) => {
    try {
      // Compress image files before upload
      const compressedFiles = await Promise.all(pendingFiles.map((f) => compressFile(f)));
      await createOrder.mutateAsync({
        tenantId: tenantId!,
        orderNumber: values.orderNumber as string,
        deliveryDate: dayjs(values.deliveryDate as string).format('YYYY-MM-DD') + 'T12:00:00Z',
        priority: values.priority as number,
        orderType: values.orderType as OrderType,
        notes: values.notes as string | undefined,
        customWarningDays: values.customWarningDays as number | undefined,
        customCriticalDays: values.customCriticalDays as number | undefined,
        items: createPendingItems.length > 0 ? createPendingItems : undefined,
        attachments: compressedFiles.length > 0 ? compressedFiles : undefined,
      });
      message.success(t('orders.createdSuccess'));
      form.resetFields();
      setCreatePendingItems([]);
      setPendingFiles([]);
      setAddingItem(false);
      setIsCreating(false);
    } catch (err) {
      message.error(getTranslatedError(err, t, t('orders.createFailed')));
    }
  };

  // ─── Master table columns ──────────────────────────────

  const masterColumns: ColumnsType<OrderMasterViewDto> = useMemo(() => {
    const base: ColumnsType<OrderMasterViewDto> = [
      {
        title: t('common:labels.priority'),
        dataIndex: 'priority',
        width: 70,
        sorter: (a, b) => a.priority - b.priority,
        defaultSortOrder: 'ascend',
      },
      {
        title: t('orders.orderNumber'),
        dataIndex: 'orderNumber',
        width: 160,
        sorter: (a, b) => a.orderNumber.localeCompare(b.orderNumber),
        render: (text: string, record: OrderMasterViewDto) => (
          <Space size={4}>
            <span style={{ fontWeight: 500 }}>{text}</span>
            {record.attachmentCount > 0 && (
              <Tooltip title={`${record.attachmentCount} ${record.attachmentCount === 1 ? 'dokument' : 'dokumenata'}`}>
                <PaperClipOutlined style={{ color: '#1677ff', fontSize: 13 }} />
              </Tooltip>
            )}
          </Space>
        ),
      },
      {
        title: t('orders.orderType'),
        dataIndex: 'orderType',
        width: 90,
        sorter: (a, b) => a.orderType.localeCompare(b.orderType),
        render: (type: OrderType) => (
          <Tag color={orderTypeColors[type]}>{tEnum('OrderType', type)}</Tag>
        ),
      },
      {
        title: t('common:labels.status'),
        dataIndex: 'status',
        width: 110,
        sorter: (a, b) => {
          const order: Record<string, number> = { [OrderStatus.Active]: 0, [OrderStatus.Paused]: 1, [OrderStatus.Draft]: 2, [OrderStatus.Cancelled]: 3, [OrderStatus.Completed]: 4 };
          return (order[a.status] ?? 5) - (order[b.status] ?? 5);
        },
        render: (status) => <StatusBadge status={status} />,
      },
      {
        title: t('common:labels.created'),
        dataIndex: 'createdAt',
        width: 150,
        render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY.') : '—',
        sorter: (a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
      },
      {
        title: t('common:labels.deliveryDate'),
        dataIndex: 'deliveryDate',
        width: 110,
        sorter: (a, b) => dayjs(a.deliveryDate).unix() - dayjs(b.deliveryDate).unix(),
        render: (date: string, record: OrderMasterViewDto) => {
          const level = getDeadlineLevel(date, record.customWarningDays, record.customCriticalDays);
          const isCompleted = record.status === OrderStatus.Completed;
          const color = isCompleted ? undefined :
            level === 'critical' ? '#FF0000' :
            level === 'warning' ? '#FAAD14' : undefined;
          return (
            <span style={{ color, fontWeight: color ? 600 : undefined }}>
              {dayjs(date).format('DD.MM.YYYY.')}
            </span>
          );
        },
      },
    ];

    // Add one column per process
    const processColDefs: ColumnsType<OrderMasterViewDto> = (processes ?? []).map((proc) => ({
      title: (
        <Tooltip title={`${proc.code} — ${proc.name}`}>
          <span style={{ fontSize: 11, cursor: 'default' }}>{proc.name}</span>
        </Tooltip>
      ),
      key: proc.id,
      width: 44,
      align: 'center' as const,
      render: (_: unknown, record: OrderMasterViewDto) => {
        const statusStr = record.processStatuses[proc.id];
        const status = statusStr ? (statusStr as ProcessStatus) : null;
        return <ProcessCell status={status} processName={proc.name} tEnum={tEnum} />;
      },
    }));

    // Completion column
    const completionCol: ColumnsType<OrderMasterViewDto> = [
      {
        title: t('orders.completion'),
        key: 'completion',
        width: 120,
        render: (_: unknown, record: OrderMasterViewDto) => {
          const { completedProcesses, totalProcesses } = record;
          const percent = totalProcesses > 0 ? Math.round((completedProcesses / totalProcesses) * 100) : 0;
          return (
            <Tooltip title={t('orders.completedOf', { completed: String(completedProcesses), total: String(totalProcesses) })}>
              <Progress
                percent={percent}
                size="small"
                strokeColor={percent === 100 ? '#92D050' : undefined}
                style={{ marginBottom: 0, minWidth: 80 }}
              />
            </Tooltip>
          );
        },
      },
    ];

    return [...base, ...completionCol, ...processColDefs];
  }, [processes, statusFilter, t, tEnum]);

  // ─── Drawer detail helpers ─────────────────────────────

  const detailCompletion = useMemo(() => {
    if (!detailOrder) return { completed: 0, total: 0, percent: 0 };
    const info = getCompletionInfo(detailOrder);
    return { ...info, percent: info.total > 0 ? Math.round((info.completed / info.total) * 100) : 0 };
  }, [detailOrder]);

  const detailDeadlineLevel = useMemo(() => {
    if (!detailOrder) return 'normal' as const;
    return getDeadlineLevel(detailOrder.deliveryDate, detailOrder.customWarningDays, detailOrder.customCriticalDays);
  }, [detailOrder]);

  const deliveryDateColor = detailOrder?.status === OrderStatus.Completed ? undefined :
    detailDeadlineLevel === 'critical' ? '#FF0000' :
    detailDeadlineLevel === 'warning' ? '#FAAD14' : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          {t('orders.title')}
        </Title>
        {canCreate && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              setCreatePendingItems([]);
              setPendingFiles([]);
              setAddingItem(true);
              const maxPriority = (masterResult?.items ?? []).reduce((max, o) => Math.max(max, o.priority), 0);
              form.setFieldValue('priority', maxPriority + 10);
              setIsCreating(true);
            }}
          >
            {t('orders.createOrder')}
          </Button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Input.Search
          placeholder={t('common:actions.search')}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 220 }}
        />
        <Select
          placeholder={t('orders.filterByStatus')}
          allowClear
          value={statusFilter}
          onChange={(v) => setStatusFilter(v)}
          style={{ width: 160 }}
          options={Object.values(OrderStatus).map((s) => ({ label: tEnum('OrderStatus', s), value: s }))}
        />
        <Select
          placeholder={t('orders.orderType')}
          allowClear
          value={orderTypeFilter}
          onChange={(v) => setOrderTypeFilter(v)}
          style={{ width: 160 }}
          options={Object.values(OrderType).map((ot) => ({ label: tEnum('OrderType', ot), value: ot }))}
        />
        <DatePicker
          value={dateFrom}
          onChange={setDateFrom}
          format="DD.MM.YYYY"
          allowClear
          placeholder={t('common:labels.dateFrom')}
        />
        <DatePicker
          value={dateTo}
          onChange={setDateTo}
          format="DD.MM.YYYY"
          allowClear
          placeholder={t('common:labels.dateTo')}
        />
      </div>

      <div ref={tableWrapperRef} style={{ flex: 1, minHeight: 0 }}>
        <Table<OrderMasterViewDto>
          className="master-table"
          columns={masterColumns}
          dataSource={masterResult?.items}
          rowKey="id"
          loading={isLoading}
          pagination={{
            current: page,
            pageSize,
            total: masterResult?.totalCount ?? 0,
            showSizeChanger: true,
          }}
          scroll={{ x: 'max-content', y: tableBodyHeight }}
          size="small"
          bordered
          onRow={(record) => ({
            onClick: () => setDetailOrderId(record.id),
            style: { cursor: 'pointer' },
          })}
          onChange={(pagination) => {
            if (pagination.current !== page) setPage(pagination.current ?? 1);
            if (pagination.pageSize !== pageSize) {
              const newSize = pagination.pageSize ?? 20;
              setPageSize(newSize);
              localStorage.setItem('orders-pageSize', String(newSize));
              setPage(1);
            }
          }}
          rowClassName={(record) => {
            if (record.status === OrderStatus.Completed) return 'master-row-completed';
            if (record.status === OrderStatus.Cancelled) return 'master-row-cancelled';
            return '';
          }}
        />
      </div>

      <style>{`
        .master-table .master-row-completed td {
          background-color: rgba(146, 208, 80, 0.1) !important;
        }
        .master-table .master-row-cancelled td {
          opacity: 0.5;
        }
      `}</style>

      {/* Unified Order Drawer — handles both create and edit/detail */}
      <Drawer
        title={isCreating ? t('orders.createOrder') : detailOrder ? t('orders.order', { number: detailOrder.orderNumber }) : ''}
        open={isCreating || !!detailOrderId}
        onClose={() => {
          if (isCreating) { form.resetFields(); setCreatePendingItems([]); setPendingFiles([]); setAddingItem(false); setIsCreating(false); }
          else { setDetailOrderId(null); clearPendingState(); setAddingItem(false); }
        }}
        width={Math.min(640, window.innerWidth)}
        extra={
          isCreating ? (
            <Button type="primary" onClick={() => form.submit()} loading={createOrder.isPending}>
              {t('common:actions.save')}
            </Button>
          ) : detailOrder && detailOrder.status === OrderStatus.Draft && user?.role !== UserRole.SalesManager ? (
            <Button type="primary" loading={isSaving} onClick={async () => {
              try {
                const values = await editForm.validateFields();
                setIsSaving(true);
                try {
                  const complexityOverrides = Array.from(pendingComplexity.entries()).map(([key, complexity]) => {
                    const [itemId, processId] = key.split(':');
                    return { itemId, processId, complexity };
                  });
                  await updateOrder.mutateAsync({
                    id: detailOrder.id,
                    data: {
                      notes: values.notes,
                      customWarningDays: values.customWarningDays,
                      customCriticalDays: values.customCriticalDays,
                      addItems: pendingItems.length > 0 ? pendingItems : undefined,
                      removeItemIds: pendingItemRemovals.length > 0 ? pendingItemRemovals : undefined,
                      complexityOverrides: complexityOverrides.length > 0 ? complexityOverrides : undefined,
                      addSpecialRequests: pendingSpecialRequestAdds.length > 0 ? pendingSpecialRequestAdds : undefined,
                      removeSpecialRequests: pendingSpecialRequestRemovals.length > 0 ? pendingSpecialRequestRemovals : undefined,
                    },
                  });
                  queryClient.invalidateQueries({ queryKey: ['orders', detailOrder.id] });
                  queryClient.invalidateQueries({ queryKey: ['orders-master-view'] });
                  clearPendingState();
                  message.success(t('orders.updatedSuccess'));
                } catch (err) {
                  message.error(getTranslatedError(err, t, t('orders.updateFailed')));
                }
              } catch {
                // validation failed
              } finally {
                setIsSaving(false);
              }
            }}>
              {t('common:actions.save')}
            </Button>
          ) : undefined
        }
      >
        {isCreating ? (
          <>
            {/* ── CREATE MODE ── */}
            <Form form={form} layout="vertical" onFinish={onCreateFinish}>
              <Row gutter={12}>
                <Col span={14}>
                  <Form.Item
                    name="orderNumber"
                    label={t('orders.orderNumberLabel')}
                    rules={[{ required: true }, { whitespace: true, message: t('common:errors.INVALID_ORDER_NUMBER') }]}
                  >
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item
                    name="orderType"
                    label={t('orders.orderType')}
                    rules={[{ required: true }]}
                  >
                    <Select options={Object.values(OrderType).map((ot) => ({ label: tEnum('OrderType', ot), value: ot }))} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="priority" label={t('common:labels.priority')} rules={[{ required: true }, { type: 'number', min: 1, message: t('common:errors.INVALID_PRIORITY') }]}>
                    <InputNumber min={1} max={100000} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={16}>
                  <Form.Item
                    name="deliveryDate"
                    label={t('common:labels.deliveryDate')}
                    rules={[
                      { required: true },
                      {
                        validator: (_, value) => {
                          if (!value) return Promise.resolve();
                          const selected = new Date(value.format ? value.format('YYYY-MM-DD') : value).getTime();
                          const tomorrow = new Date(dayjs().add(1, 'day').format('YYYY-MM-DD')).getTime();
                          if (selected < tomorrow) return Promise.reject(t('common:errors.INVALID_DATE'));
                          return Promise.resolve();
                        },
                      },
                    ]}
                  >
                    <DatePicker style={{ width: '100%' }} disabledDate={(d) => d && d.format('YYYY-MM-DD') <= dayjs().format('YYYY-MM-DD')} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="notes" label={t('common:labels.notes')}>
                <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} />
              </Form.Item>

              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="customWarningDays" label={t('orders.warningDays')}>
                    <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="customCriticalDays" label={t('orders.criticalDays')}>
                    <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </Form>

            <Divider style={{ margin: '12px 0' }} />

            {/* Items section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Title level={5} style={{ margin: 0 }}>
                {t('orders.items', { count: createPendingItems.length })}
              </Title>
              {!addingItem && (
                <Button size="small" icon={<PlusOutlined />} onClick={() => setAddingItem(true)}>
                  {t('orders.addItem')}
                </Button>
              )}
            </div>

            {/* Add Item form — component={false} prevents nested <form> tag */}
            {addingItem && (
              <>
                <Form form={itemForm} component={false} onFinish={(values) => {
                  setCreatePendingItems((prev) => [...prev, values as AddOrderItemRequest]);
                  itemForm.resetFields();
                  itemForm.setFieldsValue({ quantity: 1 });
                }}>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="productCategoryId" label={t('orders.productCategory')} rules={[{ required: true }]}>
                        <Select options={(categories ?? []).map((c: ProductCategoryDto) => ({ label: c.name, value: c.id }))} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="productName" label={t('orders.productName')} rules={[{ required: true }, { whitespace: true, message: t('common:errors.INVALID_PRODUCT_NAME') }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={12}>
                    <Col span={8}>
                      <Form.Item name="quantity" label={t('orders.quantity')} rules={[{ required: true }, { type: 'number', min: 1, message: t('common:errors.INVALID_QUANTITY') }]} initialValue={1}>
                        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={16}>
                      <Form.Item name="notes" label={t('common:labels.notes')}>
                        <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Space style={{ marginBottom: 12 }}>
                    <Button type="primary" onClick={() => itemForm.submit()}>{t('orders.addItem')}</Button>
                    {createPendingItems.length > 0 && (
                      <Button onClick={() => { setAddingItem(false); itemForm.resetFields(); }}>{t('common:actions.done')}</Button>
                    )}
                  </Space>
                </Form>
                <Divider style={{ margin: '8px 0' }} />
              </>
            )}

            {/* Item cards */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {createPendingItems.map((item, i) => {
                const cat = (categories ?? []).find((c: ProductCategoryDto) => c.id === item.productCategoryId);
                return (
                  <div key={i} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Space>
                        <Text strong>{item.productName}</Text>
                        <Tag>{t('orders.qty', { count: item.quantity })}</Tag>
                        {cat && <Tag color="blue">{cat.name}</Tag>}
                      </Space>
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => setCreatePendingItems((prev) => prev.filter((_, idx) => idx !== i))} />
                    </div>
                    {item.notes && (
                      <Text type="secondary" style={{ fontSize: 12 }}>{item.notes}</Text>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Attachments section (staged locally until order is created) */}
            <Divider style={{ margin: '12px 0' }} />
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              {t('attachments.title')} ({pendingFiles.length}/10)
            </Text>
            <Upload
              beforeUpload={(file) => {
                if (file.size > 10 * 1024 * 1024) {
                  message.error(t('attachments.fileTooLarge'));
                  return false;
                }
                setPendingFiles((prev) => [...prev, file]);
                return false;
              }}
              showUploadList={false}
              accept=".jpg,.jpeg,.png,.pdf"
              multiple
              disabled={pendingFiles.length >= 10}
            >
              <Button
                icon={<UploadOutlined />}
                disabled={pendingFiles.length >= 10}
                size="small"
                style={{ marginBottom: 8 }}
              >
                {t('attachments.upload')}
              </Button>
            </Upload>
            <List
              size="small"
              dataSource={pendingFiles}
              locale={{ emptyText: t('attachments.noAttachments') }}
              renderItem={(file: File, index: number) => (
                <List.Item
                  style={{ padding: '4px 0' }}
                  actions={[
                    <Button
                      key="delete"
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
                    />,
                  ]}
                >
                  <Space size={8}>
                    <PaperClipOutlined style={{ fontSize: 16, color: '#8c8c8c' }} />
                    <div>
                      <Text ellipsis style={{ maxWidth: 200 }}>{file.name}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {file.size < 1024 ? `${file.size} B` : file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                      </Text>
                    </div>
                  </Space>
                </List.Item>
              )}
            />
          </>
        ) : detailLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
        ) : detailOrder ? (
          <>
            {/* ── DETAIL/EDIT MODE ── */}

            {/* Header: tags + action buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 8 }}>
              <Space size={4} wrap>
                <Text style={{ color: orderTypeTextColors[detailOrder.orderType], fontWeight: 500 }}>
                  #{tEnum('OrderType', detailOrder.orderType)}
                </Text>
                <StatusText status={detailOrder.status} />
              </Space>
              {user?.role !== UserRole.SalesManager && (
                <Space size="small" wrap style={{ justifyContent: 'flex-end' }}>
                  {detailOrder.status === OrderStatus.Draft && (
                    <Button type="primary" size="small" loading={activateMutation.isPending}
                      onClick={() => {
                        if (detailOrder.items.length === 0) {
                          message.error(t('common:errors.NO_ITEMS'));
                          return;
                        }
                        activateMutation.mutate(detailOrder.id, {
                          onSuccess: () => message.success(t('orders.activatedSuccess')),
                          onError: (err) => message.error(getTranslatedError(err, t, t('orders.activateFailed'))),
                        });
                      }}
                    >{t('orders.activateOrder')}</Button>
                  )}
                  {detailOrder.status === OrderStatus.Active && (
                    <Button size="small" onClick={() => {
                      pauseOrder.mutate(detailOrder.id, {
                        onSuccess: () => message.success(t('orders.pausedSuccess')),
                        onError: (err) => message.error(getTranslatedError(err, t, t('orders.pauseFailed'))),
                      });
                    }} loading={pauseOrder.isPending}>{t('orders.pauseOrder')}</Button>
                  )}
                  {detailOrder.status === OrderStatus.Paused && (
                    <Button size="small" onClick={() => {
                      resumeOrder.mutate(detailOrder.id, {
                        onSuccess: () => message.success(t('orders.resumedSuccess')),
                        onError: (err) => message.error(getTranslatedError(err, t, t('orders.resumeFailed'))),
                      });
                    }} loading={resumeOrder.isPending}>{t('orders.resumeOrder')}</Button>
                  )}
                  {detailOrder.status === OrderStatus.Active && (
                    <Button size="small" onClick={() => {
                      const withdrawForm = modal.confirm({
                        title: t('orders.withdrawTitle'),
                        icon: null,
                        content: (
                          <Form
                            id="withdraw-form"
                            layout="vertical"
                            style={{ marginTop: 12 }}
                            onFinish={(vals) => {
                              withdrawMutation.mutate(
                                { id: detailOrder.id, data: { targetProcessId: vals.targetProcessId, reason: vals.reason, userId: user!.id } },
                                {
                                  onSuccess: () => { message.success(t('orders.withdrawSuccess')); withdrawForm.destroy(); },
                                  onError: (err) => message.error(getTranslatedError(err, t, t('orders.withdrawFailed'))),
                                },
                              );
                            }}
                          >
                            <Form.Item name="targetProcessId" label={t('orders.withdrawToProcess')} rules={[{ required: true }]}>
                              <Select options={(processes ?? []).map((p) => ({ label: `${p.code} — ${p.name}`, value: p.id }))} />
                            </Form.Item>
                            <Form.Item name="reason" label={t('orders.withdrawReason')} rules={[{ required: true }]}>
                              <Input.TextArea rows={2} />
                            </Form.Item>
                          </Form>
                        ),
                        okButtonProps: { htmlType: 'submit', form: 'withdraw-form' },
                        okText: t('common:actions.confirm'),
                        cancelText: t('common:actions.cancel'),
                      });
                    }}>{t('orders.withdraw')}</Button>
                  )}
                  {detailOrder.status !== OrderStatus.Cancelled && detailOrder.status !== OrderStatus.Completed && (
                    <Popconfirm
                      title={t('orders.cancelConfirm')}
                      okText={t('common:actions.confirm')}
                      cancelText={t('common:actions.no')}
                      onConfirm={() => {
                        cancelOrder.mutate(detailOrder.id, {
                          onSuccess: () => message.success(t('orders.cancelledSuccess')),
                          onError: (err) => message.error(getTranslatedError(err, t, t('orders.cancelFailed'))),
                        });
                      }}
                    >
                      <Button size="small" danger loading={cancelOrder.isPending}>{t('orders.cancelOrder')}</Button>
                    </Popconfirm>
                  )}
                  {detailOrder.status === OrderStatus.Cancelled && (
                    <Popconfirm
                      title={t('orders.reopenConfirm')}
                      okText={t('common:actions.confirm')}
                      cancelText={t('common:actions.no')}
                      onConfirm={() => {
                        reopenOrder.mutate(detailOrder.id, {
                          onSuccess: () => message.success(t('orders.reopenedSuccess')),
                          onError: (err) => message.error(getTranslatedError(err, t, t('orders.reopenFailed'))),
                        });
                      }}
                    >
                      <Button size="small" type="primary" loading={reopenOrder.isPending} icon={<UndoOutlined />}>{t('orders.reopenOrder')}</Button>
                    </Popconfirm>
                  )}
                </Space>
              )}
            </div>

            {/* A) Stats Row */}
            <Row gutter={16} style={{ marginBottom: 20 }}>
              <Col span={8}>
                <div>
                  <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t('common:labels.priority')}</Text>
                  <Space size={4}>
                    <InputNumber
                      min={1}
                      max={100000}
                      precision={0}
                      value={localPriority}
                      style={{ width: 80 }}
                      disabled={detailOrder.status === OrderStatus.Cancelled || detailOrder.status === OrderStatus.Completed}
                      onChange={(val) => {
                        if (val != null) {
                          setLocalPriority(val);
                          if (val !== detailOrder.priority) {
                            debouncedPriorityChange(detailOrder.id, val);
                          }
                        }
                      }}
                    />
                  </Space>
                </div>
              </Col>
              <Col span={8}>
                <Statistic
                  title={t('common:labels.deliveryDate')}
                  value={dayjs(detailOrder.deliveryDate).format('DD.MM.YYYY.')}
                  valueStyle={{ color: deliveryDateColor, fontSize: 20 }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title={t('orders.completion')}
                  value={detailCompletion.percent}
                  suffix="%"
                  valueStyle={{ color: detailCompletion.percent === 100 ? '#92D050' : undefined, fontSize: 20 }}
                />
              </Col>
            </Row>

            {/* B) Process Timeline */}
            {processes && processes.length > 0 && detailOrder.items.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
                  {t('orders.processFlow')}
                </Text>
                <ProcessTimeline order={detailOrder} processes={processes} tEnum={tEnum} />
              </div>
            )}

            <Divider style={{ margin: '12px 0' }} />

            {/* C) Item Cards */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Title level={5} style={{ margin: 0 }}>
                {t('orders.items', { count: detailOrder.items.length })}
              </Title>
              {detailOrder.status === OrderStatus.Draft && !addingItem && (
                <Button size="small" icon={<PlusOutlined />} onClick={() => setAddingItem(true)}>
                  {t('orders.addItem')}
                </Button>
              )}
            </div>

            {/* Add Item form — component={false} prevents nested <form> tag */}
            {addingItem && (
              <>
                <Form form={itemForm} component={false} onFinish={(values) => {
                  setPendingItems((prev) => [...prev, values as AddOrderItemRequest]);
                  itemForm.resetFields();
                  itemForm.setFieldsValue({ quantity: 1 });
                  setAddingItem(false);
                }}>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="productCategoryId" label={t('orders.productCategory')} rules={[{ required: true }]}>
                        <Select
                          options={(categories ?? []).map((c: ProductCategoryDto) => ({ label: c.name, value: c.id }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="productName" label={t('orders.productName')} rules={[{ required: true }, { whitespace: true, message: t('common:errors.INVALID_PRODUCT_NAME') }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={12}>
                    <Col span={8}>
                      <Form.Item name="quantity" label={t('orders.quantity')} rules={[{ required: true }, { type: 'number', min: 1, message: t('common:errors.INVALID_QUANTITY') }]} initialValue={1}>
                        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={16}>
                      <Form.Item name="notes" label={t('common:labels.notes')}>
                        <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Space style={{ marginBottom: 12 }}>
                    <Button type="primary" onClick={() => itemForm.submit()}>{t('orders.addItem')}</Button>
                    <Button onClick={() => setAddingItem(false)}>{t('common:actions.cancel')}</Button>
                  </Space>
                </Form>
                <Divider style={{ margin: '8px 0' }} />
              </>
            )}

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {detailOrder.items.map((item: OrderItemDto) => {
                const isRemoved = pendingItemRemovals.includes(item.id);
                const isDraft = detailOrder.status === OrderStatus.Draft;
                return (
                  <div key={item.id} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid #f0f0f0', ...(isRemoved ? { opacity: 0.4 } : {}) }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Space>
                        <Text strong style={isRemoved ? { textDecoration: 'line-through' } : undefined}>{item.productName}</Text>
                        <Tag>{t('orders.qty', { count: item.quantity })}</Tag>
                      </Space>
                      {isDraft && (
                        isRemoved ? (
                          <Button type="text" size="small" icon={<UndoOutlined />} onClick={() => setPendingItemRemovals((prev) => prev.filter((id) => id !== item.id))} />
                        ) : (
                          <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => setPendingItemRemovals((prev) => [...prev, item.id])} />
                        )
                      )}
                    </div>

                    <ItemProcessBar item={item} processMap={processMap} tEnum={tEnum} />

                    {/* Special Requests */}
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>{t('orders.specialRequests')}: </Text>
                      {item.specialRequests.length > 0 ? (
                        item.specialRequests.map((sr) => {
                          const srt = srtMap.get(sr.specialRequestTypeId);
                          const isPendingRemoval = pendingSpecialRequestRemovals.some((r) => r.specialRequestId === sr.id);
                          return (
                            <Tag
                              key={sr.id}
                              color={isPendingRemoval ? undefined : 'purple'}
                              closable={isDraft && !isPendingRemoval}
                              onClose={(e) => {
                                e.preventDefault();
                                setPendingSpecialRequestRemovals((prev) => [...prev, { itemId: item.id, specialRequestId: sr.id }]);
                              }}
                              style={{ marginBottom: 2, textDecoration: isPendingRemoval ? 'line-through' : undefined, opacity: isPendingRemoval ? 0.5 : undefined }}
                            >
                              {srt ? srt.name : sr.specialRequestTypeId.slice(0, 8)}
                            </Tag>
                          );
                        })
                      ) : pendingSpecialRequestAdds.filter((a) => a.itemId === item.id).length === 0 ? (
                        <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
                      ) : null}
                      {pendingSpecialRequestAdds.filter((a) => a.itemId === item.id).map((a, i) => {
                        const srt = srtMap.get(a.specialRequestTypeId);
                        return (
                          <Tag
                            key={`pending-sr-${i}`}
                            color="purple"
                            closable
                            onClose={(e) => {
                              e.preventDefault();
                              setPendingSpecialRequestAdds((prev) => prev.filter((p) => !(p.itemId === a.itemId && p.specialRequestTypeId === a.specialRequestTypeId)));
                            }}
                            style={{ marginBottom: 2, borderStyle: 'dashed' }}
                          >
                            {srt ? srt.name : a.specialRequestTypeId.slice(0, 8)}
                          </Tag>
                        );
                      })}
                      {isDraft && (
                        <Select
                          size="small"
                          placeholder={`+ ${t('common:actions.add')}`}
                          style={{ width: 140, marginLeft: 4 }}
                          value={undefined}
                          options={(specialRequestTypes ?? [])
                            .filter((srt) => srt.isActive
                              && !item.specialRequests.some((sr) => sr.specialRequestTypeId === srt.id && !pendingSpecialRequestRemovals.some((r) => r.specialRequestId === sr.id))
                              && !pendingSpecialRequestAdds.some((a) => a.itemId === item.id && a.specialRequestTypeId === srt.id))
                            .map((srt) => ({ label: srt.name, value: srt.id }))}
                          onChange={(val) => {
                            if (val) {
                              setPendingSpecialRequestAdds((prev) => [...prev, { itemId: item.id, specialRequestTypeId: val }]);
                            }
                          }}
                        />
                      )}
                    </div>

                    {/* Complexity overrides */}
                    {detailOrder.status !== OrderStatus.Cancelled && item.processes.filter((p) => p.status !== ProcessStatus.Withdrawn).length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>{t('orders.complexityOverrides')}:</Text>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {[...item.processes]
                            .filter((p) => p.status !== ProcessStatus.Withdrawn)
                            .sort((a, b) => {
                              const pa = processMap.get(a.processId);
                              const pb = processMap.get(b.processId);
                              return (pa?.sequenceOrder ?? 0) - (pb?.sequenceOrder ?? 0);
                            })
                            .map((proc) => {
                              const process = processMap.get(proc.processId);
                              const pendingKey = `${item.id}:${proc.id}`;
                              const pendingVal = pendingComplexity.get(pendingKey);
                              const displayVal = pendingVal ?? proc.complexity;
                              return (
                                <Tooltip key={proc.id} title={process?.name ?? proc.processId}>
                                  <Select
                                    size="small"
                                    value={displayVal}
                                    placeholder={process?.code ?? '?'}
                                    allowClear
                                    disabled={!isDraft}
                                    style={{ width: 100, ...(pendingVal ? { borderColor: '#1677ff' } : {}) }}
                                    popupMatchSelectWidth={false}
                                    options={Object.values(ComplexityType).map((c) => ({
                                      label: `${process?.code ?? '?'} ${tEnum('ComplexityType', c)}`,
                                      value: c,
                                    }))}
                                    onChange={(val) => {
                                      if (val) {
                                        setPendingComplexity((prev) => {
                                          const next = new Map(prev);
                                          if (val === proc.complexity) {
                                            next.delete(pendingKey);
                                          } else {
                                            next.set(pendingKey, val);
                                          }
                                          return next;
                                        });
                                      }
                                    }}
                                  />
                                </Tooltip>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {item.notes && (
                      <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
                        {item.notes}
                      </Text>
                    )}
                    <OrderAttachments orderId={detailOrder.id} orderItemId={item.id} />
                  </div>
                );
              })}

              {/* Pending new items */}
              {pendingItems.map((item, i) => {
                const cat = (categories ?? []).find((c: ProductCategoryDto) => c.id === item.productCategoryId);
                return (
                  <div key={`pending-${i}`} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '2px dashed #1677ff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Space>
                        <Text strong>{item.productName}</Text>
                        <Tag>{t('orders.qty', { count: item.quantity })}</Tag>
                        {cat && <Tag color="blue">{cat.name}</Tag>}
                      </Space>
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => setPendingItems((prev) => prev.filter((_, idx) => idx !== i))} />
                    </div>
                    {item.notes && (
                      <Text type="secondary" style={{ fontSize: 12 }}>{item.notes}</Text>
                    )}
                  </div>
                );
              })}
            </div>

            {/* D) Notes & Settings */}
            {detailOrder.status === OrderStatus.Draft ? (
              <Form form={editForm} layout="vertical" style={{ marginTop: 20 }}>
                <Form.Item name="notes" label={t('common:labels.notes')} style={{ marginBottom: 12 }}>
                  <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} />
                </Form.Item>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item name="customWarningDays" label={t('orders.warningDays')} style={{ marginBottom: 0 }}>
                      <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="customCriticalDays" label={t('orders.criticalDays')} style={{ marginBottom: 0 }}>
                      <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
            ) : detailOrder.notes ? (
              <div style={{ marginTop: 20 }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  {t('common:labels.notes')}
                </Text>
                <Text>{detailOrder.notes}</Text>
              </div>
            ) : null}

            {/* E) Attachments — inline, same pattern as create mode */}
            <OrderAttachments orderId={detailOrder.id} />
          </>
        ) : (
          <Typography.Text>{t('orders.orderNotFound')}</Typography.Text>
        )}
      </Drawer>
    </div>
  );
}
