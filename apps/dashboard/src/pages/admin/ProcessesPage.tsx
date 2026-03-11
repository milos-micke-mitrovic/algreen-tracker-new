import { useState, useEffect, useMemo } from 'react';
import { useTableHeight } from '../../hooks/useTableHeight';
import {
  Typography, Table, Button, Drawer, Form, Input, InputNumber, Tag, App,
  Popconfirm, Divider, Select, DatePicker,
} from 'antd';
import { PlusOutlined, DeleteOutlined, HolderOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { processesApi } from '@algreen/api-client';
import { useAuthStore } from '@algreen/auth';
import type { ProcessDto, SubProcessDto } from '@algreen/shared-types';
import { useTranslation } from '@algreen/i18n';
import dayjs from 'dayjs';
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

const { Title, Text } = Typography;

function getTranslatedError(error: unknown, t: (key: string, opts?: Record<string, string>) => string, fallback: string): string {
  const resp = (error as { response?: { data?: { error?: { code?: string; message?: string } } } })?.response?.data?.error;
  if (resp?.code) {
    const translated = t(`common:errors.${resp.code}`, { defaultValue: '' });
    if (translated) return translated;
  }
  return resp?.message || fallback;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ─── Sortable table row ──────────────────────────────────────

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

export function ProcessesPage() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailProcess, setDetailProcess] = useState<ProcessDto | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [subProcessForm] = Form.useForm();
  const { message } = App.useApp();
  const { t } = useTranslation('dashboard');

  // ─── Filter & Pagination State ──────────────────────────
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [isActiveFilter, setIsActiveFilter] = useState<boolean | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState<dayjs.Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<dayjs.Dayjs | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { ref: tableWrapperRef, height: tableBodyHeight } = useTableHeight();

  useEffect(() => { setPage(1); }, [debouncedSearch, isActiveFilter, dateFrom, dateTo]);

  // ─── Pending sub-processes for create drawer (controlled state) ────
  const [pendingSubProcesses, setPendingSubProcesses] = useState<{ key: number; name: string; sequenceOrder: number }[]>([]);
  const [nextSubKey, setNextSubKey] = useState(0);
  const [addSubName, setAddSubName] = useState('');
  const [addSubOrder, setAddSubOrder] = useState<number | undefined>(1);

  const { data: pagedResult, isLoading } = useQuery({
    queryKey: ['processes', tenantId, debouncedSearch, isActiveFilter, dateFrom?.format('YYYY-MM-DD'), dateTo?.format('YYYY-MM-DD'), page, pageSize],
    queryFn: () => processesApi.getAll({
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

  // Auto sequence order for new process
  const nextSequenceOrder = useMemo(() => {
    if (!pagedResult?.items?.length) return 1;
    return Math.max(...pagedResult.items.map((p) => p.sequenceOrder)) + 1;
  }, [pagedResult]);

  // Refresh detail from list data
  const currentDetail = detailProcess
    ? pagedResult?.items.find((p) => p.id === detailProcess.id) ?? detailProcess
    : null;

  useEffect(() => {
    if (currentDetail) {
      editForm.setFieldsValue({ name: currentDetail.name, sequenceOrder: currentDetail.sequenceOrder });
    }
  }, [currentDetail, editForm]);

  const createMutation = useMutation({
    mutationFn: (values: { code: string; name: string; sequenceOrder: number }) =>
      processesApi.create({
        tenantId: tenantId!,
        ...values,
        subProcesses: pendingSubProcesses.length > 0
          ? pendingSubProcesses.map(({ name, sequenceOrder }) => ({ name, sequenceOrder }))
          : undefined,
      }),
    onSuccess: (resp) => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      setCreateOpen(false);
      createForm.resetFields();
      setPendingSubProcesses([]);
      setAddSubName('');
      setAddSubOrder(1);
      message.success(t('admin.processes.created'));
      const newProcess = resp.data as ProcessDto;
      if (newProcess?.id) setDetailProcess(newProcess);
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.processes.createFailed'))),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: { name: string; sequenceOrder: number } }) =>
      processesApi.update(id, {
        ...values,
        addSubProcesses: pendingSubAdds.length > 0
          ? pendingSubAdds.map(({ name, sequenceOrder }) => ({ name, sequenceOrder }))
          : undefined,
        deactivateSubProcessIds: pendingSubRemovals.size > 0
          ? [...pendingSubRemovals]
          : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      setPendingSubAdds([]);
      setPendingSubRemovals(new Set());
      subProcessForm.resetFields();
      message.success(t('admin.processes.updated'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.processes.updateFailed'))),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => processesApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      setDetailProcess(null);
      message.success(t('admin.processes.deactivated'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.processes.deactivateFailed'))),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => processesApi.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      setDetailProcess(null);
      message.success(t('admin.processes.activated'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.processes.activateFailed'))),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; sequenceOrder: number }[]) => processesApi.reorder(items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.processes.updateFailed'))),
  });

  // ─── Pending sub-process changes for edit drawer ────────
  const [pendingSubAdds, setPendingSubAdds] = useState<{ key: number; name: string; sequenceOrder: number }[]>([]);
  const [pendingSubRemovals, setPendingSubRemovals] = useState<Set<string>>(new Set());
  const [nextEditSubKey, setNextEditSubKey] = useState(0);

  const openDetail = (process: ProcessDto) => {
    setDetailProcess(process);
    setPendingSubAdds([]);
    setPendingSubRemovals(new Set());
    setNextEditSubKey(0);
  };

  const handleAddPendingSub = () => {
    if (!addSubName.trim() || !addSubOrder) return;
    setPendingSubProcesses((prev) => [...prev, { name: addSubName.trim(), sequenceOrder: addSubOrder, key: nextSubKey }]);
    setNextSubKey((k) => k + 1);
    setAddSubName('');
    setAddSubOrder(addSubOrder + 1);
  };

  // ─── Drag-and-drop ────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !pagedResult?.items) return;

    const items = [...pagedResult.items];
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    const updates = reordered.map((item, idx) => ({ id: item.id, sequenceOrder: idx + 1 }));

    // Optimistic update
    queryClient.setQueryData(
      ['processes', tenantId, debouncedSearch, isActiveFilter, dateFrom?.format('YYYY-MM-DD'), dateTo?.format('YYYY-MM-DD'), page, pageSize],
      { ...pagedResult, items: reordered.map((item, idx) => ({ ...item, sequenceOrder: idx + 1 })) },
    );

    reorderMutation.mutate(updates);
  };

  const columns = [
    {
      title: '',
      dataIndex: 'dragHandle',
      width: 40,
      render: () => <DragHandle />,
    },
    {
      title: t('common:labels.code'),
      dataIndex: 'code',
      sorter: (a: ProcessDto, b: ProcessDto) => a.code.localeCompare(b.code),
    },
    {
      title: t('common:labels.name'),
      dataIndex: 'name',
      sorter: (a: ProcessDto, b: ProcessDto) => a.name.localeCompare(b.name),
    },
    {
      title: t('admin.processes.sequenceOrder'),
      dataIndex: 'sequenceOrder',
      width: 100,
      sorter: (a: ProcessDto, b: ProcessDto) => a.sequenceOrder - b.sequenceOrder,
      defaultSortOrder: 'ascend' as const,
    },
    {
      title: t('admin.processes.subProcesses'),
      dataIndex: 'subProcesses',
      width: 120,
      render: (subs: SubProcessDto[]) => subs.filter((s) => s.isActive).length,
    },
    {
      title: t('common:labels.created'),
      dataIndex: 'createdAt',
      width: 150,
      render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY.') : '—',
      sorter: (a: ProcessDto, b: ProcessDto) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
    },
    {
      title: t('common:labels.status'),
      dataIndex: 'isActive',
      width: 110,
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>{active ? t('common:status.active') : t('common:status.inactive')}</Tag>
      ),
    },
  ];

  const existingSubs = (currentDetail?.subProcesses ?? [])
    .filter((s) => s.isActive && !pendingSubRemovals.has(s.id))
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const activeSubs = existingSubs;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('admin.processes.title')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { createForm.resetFields(); createForm.setFieldValue('sequenceOrder', nextSequenceOrder); setPendingSubProcesses([]); setAddSubName(''); setAddSubOrder(1); setCreateOpen(true); }}>
          {t('admin.processes.addProcess')}
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={pagedResult?.items?.map((i) => i.id) ?? []} strategy={verticalListSortingStrategy}>
            <Table
              columns={columns}
              dataSource={pagedResult?.items}
              rowKey="id"
              loading={isLoading}
              scroll={{ x: 'max-content', y: tableBodyHeight }}
              components={{ body: { row: SortableRow } }}
              pagination={{
                current: page,
                pageSize,
                total: pagedResult?.totalCount,
                onChange: (p, ps) => { setPage(p); setPageSize(ps); },
                showSizeChanger: true,
              }}
              onRow={(record) => ({
                onClick: () => openDetail(record),
                style: { cursor: 'pointer' },
              })}
            />
          </SortableContext>
        </DndContext>
      </div>

      {/* Create Process Drawer */}
      <Drawer
        title={t('admin.processes.createProcess')}
        open={createOpen}
        onClose={() => { createForm.resetFields(); setPendingSubProcesses([]); setAddSubName(''); setAddSubOrder(1); setCreateOpen(false); }}
        width={Math.min(520, window.innerWidth)}
        extra={
          <Button type="primary" onClick={() => createForm.submit()} loading={createMutation.isPending}>{t('common:actions.save')}</Button>
        }
      >
        <Form form={createForm} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="code" label={t('common:labels.code')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label={t('common:labels.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="sequenceOrder" label={t('admin.processes.sequenceOrder')} rules={[{ required: true }]}>
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>

        <Divider style={{ margin: '12px 0' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Title level={5} style={{ margin: 0 }}>
            {t('admin.processes.subProcesses')} ({pendingSubProcesses.length})
          </Title>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-start' }}>
          <Input
            placeholder={t('common:labels.name')}
            value={addSubName}
            onChange={(e) => setAddSubName(e.target.value)}
            style={{ minWidth: 180 }}
            onPressEnter={handleAddPendingSub}
          />
          <InputNumber
            min={1}
            precision={0}
            placeholder={t('admin.processes.sequenceOrder')}
            value={addSubOrder}
            onChange={(v) => setAddSubOrder(v ?? undefined)}
            style={{ width: 80 }}
          />
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={handleAddPendingSub}
            disabled={!addSubName.trim() || !addSubOrder}
          >
            {t('common:actions.add')}
          </Button>
        </div>

        {pendingSubProcesses.length > 0 ? (
          <Table
            dataSource={pendingSubProcesses}
            rowKey="key"
            size="small"
            pagination={false}
            columns={[
              { title: t('common:labels.name'), dataIndex: 'name' },
              { title: t('admin.processes.sequenceOrder'), dataIndex: 'sequenceOrder', width: 100 },
              {
                title: '',
                width: 40,
                render: (_: unknown, record: { key: number }) => (
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => setPendingSubProcesses((prev) => prev.filter((s) => s.key !== record.key))}
                  />
                ),
              },
            ]}
          />
        ) : (
          <Text type="secondary">{t('admin.processes.noSubProcesses')}</Text>
        )}
      </Drawer>

      {/* Detail / Edit Drawer */}
      <Drawer
        title={currentDetail ? `${currentDetail.code} — ${currentDetail.name}` : ''}
        open={!!detailProcess}
        onClose={() => { setDetailProcess(null); setPendingSubAdds([]); setPendingSubRemovals(new Set()); editForm.resetFields(); subProcessForm.resetFields(); }}
        width={Math.min(520, window.innerWidth)}
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            {currentDetail?.isActive ? (
              <Popconfirm
                title={t('admin.processes.deactivateConfirm')}
                okText={t('common:actions.confirm')}
                cancelText={t('common:actions.no')}
                onConfirm={() => deactivateMutation.mutate(currentDetail!.id)}
              >
                <Button danger loading={deactivateMutation.isPending}>{t('admin.processes.deactivate')}</Button>
              </Popconfirm>
            ) : currentDetail && (
              <Popconfirm
                title={t('admin.processes.activateConfirm')}
                okText={t('common:actions.confirm')}
                cancelText={t('common:actions.no')}
                onConfirm={() => activateMutation.mutate(currentDetail.id)}
              >
                <Button type="primary" ghost loading={activateMutation.isPending}>{t('admin.processes.activate')}</Button>
              </Popconfirm>
            )}
            <Button type="primary" onClick={() => editForm.submit()} loading={updateMutation.isPending}>{t('common:actions.save')}</Button>
          </div>
        }
      >
        {currentDetail && (
          <>
            <Form
              form={editForm}
              layout="vertical"
              onFinish={(v) => updateMutation.mutate({ id: currentDetail.id, values: v })}
            >
              <Form.Item name="name" label={t('common:labels.name')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="sequenceOrder" label={t('admin.processes.sequenceOrder')} rules={[{ required: true }]}>
                <InputNumber min={1} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </Form>
            {currentDetail.updatedAt && (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                {t('common:labels.updated')}: {dayjs(currentDetail.updatedAt).format('DD.MM.YYYY.')}
              </Text>
            )}

            <Divider style={{ margin: '12px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Title level={5} style={{ margin: 0 }}>
                {t('admin.processes.subProcesses')} ({activeSubs.length + pendingSubAdds.length})
              </Title>
            </div>

            {currentDetail.isActive && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-start' }}>
                <Form
                  form={subProcessForm}
                  layout="inline"
                  onFinish={(v) => {
                    setPendingSubAdds((prev) => [...prev, { key: nextEditSubKey, name: v.name, sequenceOrder: v.sequenceOrder }]);
                    setNextEditSubKey((k) => k + 1);
                    subProcessForm.resetFields();
                    subProcessForm.setFieldValue('sequenceOrder', activeSubs.length + pendingSubAdds.length + 2);
                  }}
                >
                  <Form.Item name="name" rules={[{ required: true, message: t('common:validation.required') }]} style={{ minWidth: 180 }}>
                    <Input placeholder={t('common:labels.name')} />
                  </Form.Item>
                  <Form.Item name="sequenceOrder" rules={[{ required: true, message: t('common:validation.required') }]} initialValue={activeSubs.length + pendingSubAdds.length + 1}>
                    <InputNumber min={1} precision={0} placeholder={t('admin.processes.sequenceOrder')} style={{ width: 80 }} />
                  </Form.Item>
                  <Form.Item>
                    <Button type="dashed" icon={<PlusOutlined />} htmlType="submit">
                      {t('common:actions.add')}
                    </Button>
                  </Form.Item>
                </Form>
              </div>
            )}

            {(activeSubs.length > 0 || pendingSubAdds.length > 0) ? (
              <Table<{ key: string; name: string; sequenceOrder: number; isNew: boolean; id: string }>
                dataSource={[
                  ...activeSubs.map((s) => ({ key: s.id, name: s.name, sequenceOrder: s.sequenceOrder, isNew: false, id: s.id })),
                  ...pendingSubAdds.map((s) => ({ key: `new-${s.key}`, name: s.name, sequenceOrder: s.sequenceOrder, isNew: true, id: `new-${s.key}` })),
                ]}
                rowKey="key"
                size="small"
                pagination={false}
                columns={[
                  {
                    title: t('common:labels.name'),
                    dataIndex: 'name',
                    render: (name, record) => (
                      record.isNew ? <Text type="success">{name}</Text> : name
                    ),
                  },
                  {
                    title: t('admin.processes.sequenceOrder'),
                    dataIndex: 'sequenceOrder',
                    width: 100,
                  },
                  {
                    title: '',
                    width: 40,
                    render: (_, record) => (
                      record.isNew ? (
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => {
                            const numKey = Number(record.key.replace('new-', ''));
                            setPendingSubAdds((prev) => prev.filter((s) => s.key !== numKey));
                          }}
                        />
                      ) : (
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => setPendingSubRemovals((prev) => new Set([...prev, record.id]))}
                        />
                      )
                    ),
                  },
                ]}
              />
            ) : (
              <Text type="secondary">{t('admin.processes.noSubProcesses')}</Text>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
