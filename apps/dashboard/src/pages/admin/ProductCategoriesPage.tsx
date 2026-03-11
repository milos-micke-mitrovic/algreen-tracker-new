import { useState, useEffect, useCallback } from 'react';
import { useTableHeight } from '../../hooks/useTableHeight';
import {
  Typography, Table, Button, Drawer, Form, Input, Tag, App,
  Select, InputNumber, Divider, Popconfirm, DatePicker,
} from 'antd';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
import { PlusOutlined, DeleteOutlined, HolderOutlined } from '@ant-design/icons';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productCategoriesApi, processesApi } from '@algreen/api-client';
import { useAuthStore } from '@algreen/auth';
import type {
  ProductCategoryDto,
  ProductCategoryProcessDto,
  ProductCategoryDependencyDto,
} from '@algreen/shared-types';
import { ComplexityType } from '@algreen/shared-types';
import { useTranslation } from '@algreen/i18n';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

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

const DragHandleContext = React.createContext<ReturnType<typeof useSortable>['listeners']>(undefined);

interface SortableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  'data-row-key'?: string;
}

function SortableRow(props: SortableRowProps) {
  const id = props['data-row-key'] ?? '';
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 99 } : {}),
  };

  return (
    <DragHandleContext.Provider value={listeners}>
      <tr {...props} ref={setNodeRef} style={style} {...attributes} />
    </DragHandleContext.Provider>
  );
}

function DragHandle() {
  const listeners = React.useContext(DragHandleContext);
  return (
    <HolderOutlined
      style={{ color: '#999', cursor: 'grab' }}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

interface LocalProcess { processId: string; sequenceOrder: number; defaultComplexity?: ComplexityType }
interface LocalDep { processId: string; dependsOnProcessId: string }

export function ProductCategoriesPage() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const { t } = useTranslation('dashboard');

  const { ref: tableWrapperRef, height: tableBodyHeight } = useTableHeight();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ─── Filter & Pagination State ──────────────────────────
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [isActiveFilter, setIsActiveFilter] = useState<boolean | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState<dayjs.Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<dayjs.Dayjs | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => { setPage(1); }, [debouncedSearch, isActiveFilter, dateFrom, dateTo]);

  // ─── Local state for processes & dependencies ─────────────
  const [localProcesses, setLocalProcesses] = useState<LocalProcess[]>([]);
  const [localDeps, setLocalDeps] = useState<LocalDep[]>([]);

  // ─── Inline add state ─────────────────────────────────────
  const [addProcId, setAddProcId] = useState<string | undefined>(undefined);
  const [addProcOrder, setAddProcOrder] = useState<number | undefined>(undefined);
  const [addProcComplexity, setAddProcComplexity] = useState<ComplexityType | undefined>(undefined);
  const [addDepProcId, setAddDepProcId] = useState<string | undefined>(undefined);
  const [addDepDependsOn, setAddDepDependsOn] = useState<string | undefined>(undefined);

  const resetAddProcess = useCallback(() => {
    setAddProcId(undefined);
    setAddProcOrder(undefined);
    setAddProcComplexity(undefined);
  }, []);

  const resetAddDep = useCallback(() => {
    setAddDepProcId(undefined);
    setAddDepDependsOn(undefined);
  }, []);

  const clearLocal = useCallback(() => {
    setLocalProcesses([]);
    setLocalDeps([]);
    resetAddProcess();
    resetAddDep();
  }, [resetAddProcess, resetAddDep]);

  // ─── Queries ──────────────────────────────────────────
  const { data: pagedResult, isLoading } = useQuery({
    queryKey: ['product-categories', tenantId, debouncedSearch, isActiveFilter, dateFrom?.format('YYYY-MM-DD'), dateTo?.format('YYYY-MM-DD'), page, pageSize],
    queryFn: () => productCategoriesApi.getAll({
      tenantId: tenantId!,
      search: debouncedSearch || undefined,
      isActive: isActiveFilter,
      createdFrom: dateFrom?.format('YYYY-MM-DD'),
      createdTo: dateTo?.format('YYYY-MM-DD'),
      page,
      pageSize,
    }).then((r) => r.data),
    enabled: !!tenantId,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['product-categories', detailId],
    queryFn: () => productCategoriesApi.getById(detailId!).then((r) => r.data),
    enabled: !!detailId,
  });

  const { data: processes } = useQuery({
    queryKey: ['processes', tenantId],
    queryFn: () => processesApi.getAll({ tenantId: tenantId!, pageSize: 100 }).then((r) => r.data.items),
    enabled: !!tenantId,
  });

  const processLookup = new Map((processes ?? []).map((p) => [p.id, p]));

  // ─── Seed local state from detail when editing ─────────────
  useEffect(() => {
    if (detail) {
      form.setFieldsValue({ name: detail.name, description: detail.description, defaultWarningDays: detail.defaultWarningDays, defaultCriticalDays: detail.defaultCriticalDays });
      setLocalProcesses(
        [...detail.processes]
          .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
          .map((p) => ({
            processId: p.processId,
            sequenceOrder: p.sequenceOrder,
            defaultComplexity: p.defaultComplexity ?? undefined,
          }))
      );
      setLocalDeps(detail.dependencies.map((d) => ({
        processId: d.processId,
        dependsOnProcessId: d.dependsOnProcessId,
      })));
    }
  }, [detail, form]);

  // ─── Mutations ────────────────────────────────────────
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['product-categories'] });
  };

  const createMutation = useMutation({
    mutationFn: (values: { name: string; description?: string; defaultWarningDays?: number; defaultCriticalDays?: number }) =>
      productCategoriesApi.create({
        tenantId: tenantId!,
        name: values.name,
        description: values.description,
        defaultWarningDays: values.defaultWarningDays,
        defaultCriticalDays: values.defaultCriticalDays,
        processes: localProcesses,
        dependencies: localDeps,
      }),
    onSuccess: (resp) => {
      invalidate();
      setIsCreating(false);
      form.resetFields();
      clearLocal();
      message.success(t('admin.productCategories.created'));
      if (resp.data?.id) setDetailId(resp.data.id);
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.productCategories.createFailed'))),
  });

  const updateMutation = useMutation({
    mutationFn: (values: { name: string; description?: string; defaultWarningDays?: number; defaultCriticalDays?: number }) =>
      productCategoriesApi.update(detailId!, {
        name: values.name,
        description: values.description,
        defaultWarningDays: values.defaultWarningDays,
        defaultCriticalDays: values.defaultCriticalDays,
        processes: localProcesses,
        dependencies: localDeps,
      }),
    onSuccess: () => {
      invalidate();
      message.success(t('admin.productCategories.updated'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.productCategories.updateFailed'))),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => productCategoriesApi.deactivate(detailId!),
    onSuccess: () => {
      invalidate();
      setDetailId(null);
      message.success(t('admin.productCategories.deactivated'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.productCategories.deactivateFailed'))),
  });

  const activateMutation = useMutation({
    mutationFn: () => productCategoriesApi.activate(detailId!),
    onSuccess: () => {
      invalidate();
      setDetailId(null);
      message.success(t('admin.productCategories.activated'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.productCategories.activateFailed'))),
  });

  // ─── Derived data ──────────────────────────────────────
  const assignedProcessIds = new Set(localProcesses.map((p) => p.processId));
  const availableProcesses = (processes ?? []).filter((p) => !assignedProcessIds.has(p.id) && p.isActive);

  const categoryProcessOptions = localProcesses.map((p) => {
    const proc = processLookup.get(p.processId);
    return { value: p.processId, label: proc ? `${proc.code} — ${proc.name}` : p.processId };
  });

  const displayProcesses: ProductCategoryProcessDto[] = localProcesses.map((p, i) => {
    const proc = processLookup.get(p.processId);
    return {
      id: `local-${i}`,
      processId: p.processId,
      processCode: proc?.code ?? '?',
      processName: proc?.name ?? '?',
      sequenceOrder: p.sequenceOrder,
      defaultComplexity: p.defaultComplexity ?? null,
    } as ProductCategoryProcessDto;
  });

  const displayDeps: ProductCategoryDependencyDto[] = localDeps.map((d, i) => {
    const proc = processLookup.get(d.processId);
    const dep = processLookup.get(d.dependsOnProcessId);
    return {
      id: `local-dep-${i}`,
      processId: d.processId,
      processCode: proc?.code ?? '?',
      dependsOnProcessId: d.dependsOnProcessId,
      dependsOnProcessCode: dep?.code ?? '?',
    } as ProductCategoryDependencyDto;
  });

  // ─── Inline add/remove handlers ────────────────────────────
  const nextProcOrder = localProcesses.length > 0 ? Math.max(...localProcesses.map((p) => p.sequenceOrder)) + 1 : 1;

  const handleAddProcess = () => {
    if (!addProcId) return;
    const order = addProcOrder ?? nextProcOrder;
    setLocalProcesses((prev) => [...prev, { processId: addProcId, sequenceOrder: order, defaultComplexity: addProcComplexity }]);
    resetAddProcess();
  };

  const handleProcessDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalProcesses((prev) => {
      const oldIndex = prev.findIndex((p) => p.processId === active.id);
      const newIndex = prev.findIndex((p) => p.processId === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const reordered = arrayMove(prev, oldIndex, newIndex);
      return reordered.map((p, i) => ({ ...p, sequenceOrder: i + 1 }));
    });
  };

  const handleRemoveProcess = (processId: string) => {
    setLocalProcesses((prev) => prev.filter((p) => p.processId !== processId));
    setLocalDeps((prev) => prev.filter((d) => d.processId !== processId && d.dependsOnProcessId !== processId));
  };

  const handleAddDep = () => {
    if (!addDepProcId || !addDepDependsOn || addDepProcId === addDepDependsOn) return;
    setLocalDeps((prev) => [...prev, { processId: addDepProcId, dependsOnProcessId: addDepDependsOn }]);
    resetAddDep();
  };

  const handleRemoveDep = (index: number) => {
    setLocalDeps((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── List columns ─────────────────────────────────────
  const columns = [
    {
      title: t('common:labels.name'),
      dataIndex: 'name',
      sorter: (a: ProductCategoryDto, b: ProductCategoryDto) => a.name.localeCompare(b.name),
    },
    { title: t('common:labels.description'), dataIndex: 'description', ellipsis: true },
    {
      title: t('common:labels.created'),
      dataIndex: 'createdAt',
      width: 150,
      render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY.') : '—',
      sorter: (a: ProductCategoryDto, b: ProductCategoryDto) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
    },
    {
      title: t('common:labels.status'),
      dataIndex: 'isActive',
      width: 100,
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>
          {active ? t('common:status.active') : t('common:status.inactive')}
        </Tag>
      ),
    },
  ];

  // ─── Drawer ─────────────────────────────────────────────
  const drawerOpen = isCreating || !!detailId;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const closeDrawer = () => {
    form.resetFields();
    clearLocal();
    if (isCreating) setIsCreating(false);
    else setDetailId(null);
  };

  const processesSection = (
    <>
      <Divider />
      <Title level={5} style={{ marginBottom: 12 }}>
        {t('admin.productCategories.processes', { count: displayProcesses.length })}
      </Title>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleProcessDragEnd}>
        <SortableContext items={displayProcesses.map((p) => p.processId)} strategy={verticalListSortingStrategy}>
          <Table<ProductCategoryProcessDto>
            dataSource={displayProcesses}
            rowKey="processId"
            size="small"
            pagination={false}
            components={{ body: { row: SortableRow } }}
            columns={[
              {
                title: '', dataIndex: 'dragHandle', width: 40,
                render: () => <DragHandle />,
              },
              { title: t('common:labels.process'), render: (_, r) => `${r.processCode} — ${r.processName}` },
              { title: t('common:labels.order'), dataIndex: 'sequenceOrder', width: 80, align: 'center' },
              {
                title: t('admin.productCategories.defaultComplexity'),
                dataIndex: 'defaultComplexity',
                width: 120,
                render: (v: ComplexityType | null) => v ? <Tag>{t(`common:enums.ComplexityType.${v}`)}</Tag> : '—',
              },
              {
                title: '', width: 50,
                render: (_, r) => (
                  <Button type="text" danger icon={<DeleteOutlined />} size="small" onClick={() => handleRemoveProcess(r.processId)} />
                ),
              },
            ]}
          />
        </SortableContext>
      </DndContext>
      {availableProcesses.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Select
            placeholder={t('admin.productCategories.selectProcess')}
            value={addProcId}
            onChange={setAddProcId}
            style={{ minWidth: 200 }}
            options={availableProcesses.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
          />
          <InputNumber
            min={1} precision={0}
            placeholder={String(nextProcOrder)}
            value={addProcOrder}
            onChange={(v) => setAddProcOrder(v ?? undefined)}
            style={{ width: 80 }}
          />
          <Select
            placeholder={t('common:labels.complexity')}
            allowClear
            value={addProcComplexity}
            onChange={setAddProcComplexity}
            style={{ width: 110 }}
            options={Object.values(ComplexityType).map((c) => ({ value: c, label: t(`common:enums.ComplexityType.${c}`) }))}
          />
          <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddProcess} disabled={!addProcId}>
            {t('common:actions.add')}
          </Button>
        </div>
      )}
    </>
  );

  const dependenciesSection = (
    <>
      <Divider />
      <Title level={5} style={{ marginBottom: 12 }}>
        {t('admin.productCategories.dependencies', { count: displayDeps.length })}
      </Title>
      <Table<ProductCategoryDependencyDto>
        dataSource={displayDeps}
        rowKey="id"
        size="small"
        pagination={false}
        columns={[
          { title: t('common:labels.process'), dataIndex: 'processCode', width: 120 },
          { title: t('admin.productCategories.dependsOn'), dataIndex: 'dependsOnProcessCode' },
          {
            title: '', width: 50,
            render: (_, _r, index) => (
              <Button type="text" danger icon={<DeleteOutlined />} size="small" onClick={() => handleRemoveDep(index)} />
            ),
          },
        ]}
      />
      {categoryProcessOptions.length >= 2 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Select
            placeholder={t('common:labels.process')}
            value={addDepProcId}
            onChange={(v) => { setAddDepProcId(v); if (v === addDepDependsOn) setAddDepDependsOn(undefined); }}
            style={{ minWidth: 180 }}
            options={categoryProcessOptions}
          />
          <Select
            placeholder={t('admin.productCategories.dependsOn')}
            value={addDepDependsOn}
            onChange={setAddDepDependsOn}
            style={{ minWidth: 180 }}
            options={categoryProcessOptions.filter((o) => o.value !== addDepProcId)}
          />
          <Button
            type="dashed" icon={<PlusOutlined />} onClick={handleAddDep}
            disabled={!addDepProcId || !addDepDependsOn || addDepProcId === addDepDependsOn}
          >
            {t('common:actions.add')}
          </Button>
        </div>
      )}
    </>
  );

  // ─── Render ───────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('admin.productCategories.title')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); clearLocal(); setIsCreating(true); }}>
          {t('admin.productCategories.addCategory')}
        </Button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Input.Search
          placeholder={t('common:actions.search')}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260 }}
        />
        <Select
          placeholder={t('common:labels.status')}
          allowClear
          value={isActiveFilter}
          onChange={(v) => setIsActiveFilter(v)}
          style={{ width: 150 }}
          options={[
            { label: t('common:status.active'), value: true },
            { label: t('common:status.inactive'), value: false },
          ]}
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
        <Table
          columns={columns}
          dataSource={pagedResult?.items}
          rowKey="id"
          loading={isLoading}
          scroll={{ x: 'max-content', y: tableBodyHeight }}
          pagination={{
            current: page,
            pageSize,
            total: pagedResult?.totalCount,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
            showSizeChanger: true,
          }}
          onRow={(record) => ({ onClick: () => setDetailId(record.id), style: { cursor: 'pointer' } })}
        />
      </div>

      <Drawer
        title={isCreating ? t('admin.productCategories.createCategory') : (detail?.name ?? '')}
        open={drawerOpen}
        onClose={closeDrawer}
        afterOpenChange={(open) => { if (!open) form.resetFields(); }}
        width={640}
        loading={!isCreating && detailLoading}
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            {!isCreating && detail?.isActive && (
              <Popconfirm
                title={t('admin.productCategories.deactivateConfirm')}
                onConfirm={() => deactivateMutation.mutate()}
                okText={t('common:actions.confirm')}
                cancelText={t('common:actions.no')}
              >
                <Button danger loading={deactivateMutation.isPending}>
                  {t('admin.productCategories.deactivate')}
                </Button>
              </Popconfirm>
            )}
            {!isCreating && detail && !detail.isActive && (
              <Popconfirm
                title={t('admin.productCategories.activateConfirm')}
                onConfirm={() => activateMutation.mutate()}
                okText={t('common:actions.confirm')}
                cancelText={t('common:actions.no')}
              >
                <Button type="primary" ghost loading={activateMutation.isPending}>
                  {t('admin.productCategories.activate')}
                </Button>
              </Popconfirm>
            )}
            <Button type="primary" onClick={() => form.submit()} loading={isSaving}>
              {t('common:actions.save')}
            </Button>
          </div>
        }
      >
        {(isCreating || detail) && (
          <>
            <Form
              form={form}
              layout="vertical"
              onFinish={(v) => isCreating ? createMutation.mutate(v) : updateMutation.mutate(v)}
            >
              <Form.Item name="name" label={t('common:labels.name')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="description" label={t('common:labels.description')}>
                <Input.TextArea rows={2} />
              </Form.Item>
              <div style={{ display: 'flex', gap: 16 }}>
                <Form.Item name="defaultWarningDays" label={t('admin.productCategories.warningDays')} style={{ flex: 1 }}>
                  <InputNumber min={1} precision={0} style={{ width: '100%' }} placeholder="5" />
                </Form.Item>
                <Form.Item name="defaultCriticalDays" label={t('admin.productCategories.criticalDays')} style={{ flex: 1 }}>
                  <InputNumber min={1} precision={0} style={{ width: '100%' }} placeholder="3" />
                </Form.Item>
              </div>
            </Form>
            {processesSection}
            {dependenciesSection}
            {!isCreating && detail?.updatedAt && (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
                {t('common:labels.updated')}: {dayjs(detail.updatedAt).format('DD.MM.YYYY.')}
              </Text>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
