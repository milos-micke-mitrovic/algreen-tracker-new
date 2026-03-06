import { useState, useEffect, useMemo } from 'react';
import { Typography, Table, Button, Drawer, Form, Input, Select, Tag, Space, App, Popconfirm, Divider, DatePicker } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { specialRequestTypesApi, processesApi } from '@algreen/api-client';
import { useAuthStore } from '@algreen/auth';
import type { SpecialRequestTypeDto, ProcessDto } from '@algreen/shared-types';
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

export function SpecialRequestTypesPage() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<SpecialRequestTypeDto | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const { message } = App.useApp();
  const { t } = useTranslation('dashboard');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [isActiveFilter, setIsActiveFilter] = useState<boolean | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState<dayjs.Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<dayjs.Dayjs | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => { setPage(1); }, [debouncedSearch, isActiveFilter, dateFrom, dateTo]);

  const { data: pagedResult, isLoading } = useQuery({
    queryKey: ['special-request-types', tenantId, debouncedSearch, isActiveFilter, dateFrom?.format('YYYY-MM-DD'), dateTo?.format('YYYY-MM-DD'), page, pageSize],
    queryFn: () => specialRequestTypesApi.getAll({
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

  const data = pagedResult?.items;

  const { data: processes } = useQuery({
    queryKey: ['processes', tenantId],
    queryFn: () => processesApi.getAll({ tenantId: tenantId!, pageSize: 100 }).then((r) => r.data.items),
    enabled: !!tenantId && (!!detailItem || createOpen),
  });

  const processMap = useMemo(() => {
    const map = new Map<string, ProcessDto>();
    (processes ?? []).forEach((p) => map.set(p.id, p));
    return map;
  }, [processes]);

  const processOptions = (processes ?? []).map((p) => ({ label: `${p.code} — ${p.name}`, value: p.id }));

  // Refresh detail from list data
  const currentDetail = detailItem ? data?.find((item) => item.id === detailItem.id) ?? detailItem : null;

  const createMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      specialRequestTypesApi.create({
        tenantId: tenantId!,
        code: values.code as string,
        name: values.name as string,
        description: values.description as string | undefined,
        addsProcesses: values.addsProcesses as string[] | undefined,
        removesProcesses: values.removesProcesses as string[] | undefined,
        onlyProcesses: values.onlyProcesses as string[] | undefined,
      }),
    onSuccess: (resp) => {
      queryClient.invalidateQueries({ queryKey: ['special-request-types'] });
      setCreateOpen(false);
      createForm.resetFields();
      message.success(t('admin.specialRequestTypes.created'));
      // Open detail drawer for the newly created item
      const newItem = resp.data as SpecialRequestTypeDto;
      if (newItem?.id) setDetailItem(newItem);
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.specialRequestTypes.createFailed'))),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, unknown> }) =>
      specialRequestTypesApi.update(id, {
        name: values.name as string,
        description: values.description as string | undefined,
        addsProcesses: values.addsProcesses as string[] | undefined,
        removesProcesses: values.removesProcesses as string[] | undefined,
        onlyProcesses: values.onlyProcesses as string[] | undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['special-request-types'] });
      message.success(t('admin.specialRequestTypes.updated'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.specialRequestTypes.updateFailed'))),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => specialRequestTypesApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['special-request-types'] });
      setDetailItem(null);
      message.success(t('admin.specialRequestTypes.deactivated'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.specialRequestTypes.deactivateFailed'))),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => specialRequestTypesApi.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['special-request-types'] });
      setDetailItem(null);
      message.success(t('admin.specialRequestTypes.activated'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.specialRequestTypes.activateFailed'))),
  });

  const openDetail = (item: SpecialRequestTypeDto) => {
    setDetailItem(item);
  };

  // Auto-populate edit form when detail loads
  useEffect(() => {
    if (currentDetail) {
      editForm.setFieldsValue({
        name: currentDetail.name,
        description: currentDetail.description,
        addsProcesses: currentDetail.addsProcesses,
        removesProcesses: currentDetail.removesProcesses,
        onlyProcesses: currentDetail.onlyProcesses,
      });
    }
  }, [currentDetail, editForm]);

  const renderProcessTags = (ids: string[]) => {
    if (!ids || ids.length === 0) return <Text type="secondary">—</Text>;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {ids.map((id) => {
          const proc = processMap.get(id);
          return <Tag key={id} color="blue">{proc ? `${proc.code} — ${proc.name}` : id.slice(0, 8)}</Tag>;
        })}
      </div>
    );
  };

  const columns = [
    {
      title: t('common:labels.code'),
      dataIndex: 'code',
      sorter: (a: SpecialRequestTypeDto, b: SpecialRequestTypeDto) => a.code.localeCompare(b.code),
    },
    {
      title: t('common:labels.name'),
      dataIndex: 'name',
      sorter: (a: SpecialRequestTypeDto, b: SpecialRequestTypeDto) => a.name.localeCompare(b.name),
    },
    { title: t('common:labels.description'), dataIndex: 'description', ellipsis: true },
    {
      title: t('common:labels.created'),
      dataIndex: 'createdAt',
      width: 150,
      render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY.') : '—',
      sorter: (a: SpecialRequestTypeDto, b: SpecialRequestTypeDto) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
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

  // Process rules form items (reused in create & edit)
  const processRuleFields = (
    <>
      <Form.Item name="addsProcesses" label={t('admin.specialRequestTypes.addsProcesses')}>
        <Select mode="multiple" options={processOptions} allowClear placeholder={t('admin.specialRequestTypes.selectProcesses')} />
      </Form.Item>
      <Form.Item name="removesProcesses" label={t('admin.specialRequestTypes.removesProcesses')}>
        <Select mode="multiple" options={processOptions} allowClear placeholder={t('admin.specialRequestTypes.selectProcesses')} />
      </Form.Item>
      <Form.Item name="onlyProcesses" label={t('admin.specialRequestTypes.onlyProcesses')}>
        <Select mode="multiple" options={processOptions} allowClear placeholder={t('admin.specialRequestTypes.selectProcesses')} />
      </Form.Item>
    </>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('admin.specialRequestTypes.title')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          {t('admin.specialRequestTypes.addType')}
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

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
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

      {/* Create Drawer */}
      <Drawer
        title={t('admin.specialRequestTypes.createType')}
        open={createOpen}
        onClose={() => { createForm.resetFields(); setCreateOpen(false); }}
        width={Math.min(480, window.innerWidth)}
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
          <Form.Item name="description" label={t('common:labels.description')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          {processRuleFields}
        </Form>
      </Drawer>

      {/* Detail / Edit Drawer */}
      <Drawer
        title={currentDetail ? `${currentDetail.code} — ${currentDetail.name}` : ''}
        open={!!detailItem}
        onClose={() => { setDetailItem(null); editForm.resetFields(); }}
        width={Math.min(480, window.innerWidth)}
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            {currentDetail?.isActive ? (
              <Popconfirm
                title={t('admin.specialRequestTypes.deactivateConfirm')}
                okText={t('common:actions.confirm')}
                cancelText={t('common:actions.no')}
                onConfirm={() => deactivateMutation.mutate(currentDetail!.id)}
              >
                <Button danger loading={deactivateMutation.isPending}>{t('admin.specialRequestTypes.deactivate')}</Button>
              </Popconfirm>
            ) : currentDetail && (
              <Popconfirm
                title={t('admin.specialRequestTypes.activateConfirm')}
                okText={t('common:actions.confirm')}
                cancelText={t('common:actions.no')}
                onConfirm={() => activateMutation.mutate(currentDetail.id)}
              >
                <Button type="primary" ghost loading={activateMutation.isPending}>{t('admin.specialRequestTypes.activate')}</Button>
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
              <Form.Item name="description" label={t('common:labels.description')}>
                <Input.TextArea rows={2} />
              </Form.Item>
              <Divider style={{ margin: '12px 0' }} />
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>{t('admin.specialRequestTypes.processRules')}</Text>
              {processRuleFields}
            </Form>
            {currentDetail.updatedAt && (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
                {t('common:labels.updated')}: {dayjs(currentDetail.updatedAt).format('DD.MM.YYYY.')}
              </Text>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
