import { useState, useEffect } from 'react';
import {
  Typography, Table, Button, Drawer, Form, Input, InputNumber, Tag, App,
  Divider, ColorPicker, Popconfirm, Spin, Select, DatePicker,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantsApi } from '@algreen/api-client';
import type { TenantDto } from '@algreen/shared-types';
import { useTranslation } from '@algreen/i18n';
import dayjs from 'dayjs';

const { Title } = Typography;

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

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

function resolveColor(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toHexString' in value) return (value as { toHexString: () => string }).toHexString();
  return fallback;
}

export function TenantsPage() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<TenantDto | null>(null);
  const [form] = Form.useForm();
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

  useEffect(() => { setPage(1); }, [debouncedSearch, isActiveFilter, dateFrom, dateTo]);

  const isCreating = drawerOpen && !editTenant;

  const { data: pagedResult, isLoading } = useQuery({
    queryKey: ['tenants', debouncedSearch, isActiveFilter, dateFrom?.format('YYYY-MM-DD'), dateTo?.format('YYYY-MM-DD'), page, pageSize],
    queryFn: () => tenantsApi.getAll({
      search: debouncedSearch || undefined,
      isActive: isActiveFilter,
      createdFrom: dateFrom?.format('YYYY-MM-DD'),
      createdTo: dateTo?.format('YYYY-MM-DD'),
      page,
      pageSize,
    }).then((r) => r.data),
  });

  const data = pagedResult?.items;

  const currentDetail = editTenant ? data?.find((item) => item.id === editTenant.id) ?? editTenant : null;

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['tenant-settings', currentDetail?.id],
    queryFn: () => tenantsApi.getSettings(currentDetail!.id).then((r) => r.data),
    enabled: !!currentDetail,
  });

  // Populate form when settings load for edit
  useEffect(() => {
    if (settings && editTenant) {
      form.setFieldsValue({
        defaultWarningDays: settings.defaultWarningDays,
        defaultCriticalDays: settings.defaultCriticalDays,
        warningColor: settings.warningColor,
        criticalColor: settings.criticalColor,
      });
    }
  }, [settings, editTenant, form]);

  const createMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      tenantsApi.create({
        name: values.name as string,
        code: values.code as string,
        defaultWarningDays: values.defaultWarningDays as number,
        defaultCriticalDays: values.defaultCriticalDays as number,
        warningColor: resolveColor(values.warningColor, '#FFA500'),
        criticalColor: resolveColor(values.criticalColor, '#FF0000'),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      closeDrawer();
      message.success(t('admin.tenants.created'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.tenants.createFailed'))),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, unknown> }) =>
      tenantsApi.update(id, {
        name: values.name as string,
        isActive: currentDetail!.isActive,
        defaultWarningDays: values.defaultWarningDays as number,
        defaultCriticalDays: values.defaultCriticalDays as number,
        warningColor: resolveColor(values.warningColor, '#faad14'),
        criticalColor: resolveColor(values.criticalColor, '#cf1322'),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      message.success(t('admin.tenants.updated'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.tenants.updateFailed'))),
  });

  const deactivateMutation = useMutation({
    mutationFn: (tenant: TenantDto) =>
      tenantsApi.update(tenant.id, { name: tenant.name, isActive: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      closeDrawer();
      message.success(t('admin.tenants.deactivated'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.tenants.updateFailed'))),
  });

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      defaultWarningDays: 7,
      defaultCriticalDays: 3,
      warningColor: '#FFA500',
      criticalColor: '#FF0000',
    });
    setEditTenant(null);
    setDrawerOpen(true);
  };

  const openEdit = (tenant: TenantDto) => {
    setEditTenant(tenant);
    form.setFieldsValue({ name: tenant.name, code: tenant.code });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditTenant(null);
    form.resetFields();
  };

  const handleFinish = (values: Record<string, unknown>) => {
    if (isCreating) {
      createMutation.mutate(values);
    } else {
      updateMutation.mutate({ id: currentDetail!.id, values });
    }
  };

  const columns = [
    {
      title: t('common:labels.name'),
      dataIndex: 'name',
      sorter: (a: TenantDto, b: TenantDto) => a.name.localeCompare(b.name),
    },
    {
      title: t('common:labels.code'),
      dataIndex: 'code',
      sorter: (a: TenantDto, b: TenantDto) => a.code.localeCompare(b.code),
    },
    {
      title: t('common:labels.status'),
      dataIndex: 'isActive',
      width: 110,
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>{active ? t('common:status.active') : t('common:status.inactive')}</Tag>
      ),
    },
    {
      title: t('common:labels.created'),
      dataIndex: 'createdAt',
      width: 150,
      sorter: (a: TenantDto, b: TenantDto) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix(),
      render: (d: string) => dayjs(d).format('DD.MM.YYYY.'),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('admin.tenants.title')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t('admin.tenants.addTenant')}
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
          onClick: () => openEdit(record),
          style: { cursor: 'pointer' },
        })}
      />

      <Drawer
        title={isCreating ? t('admin.tenants.createTenant') : currentDetail?.name}
        open={drawerOpen}
        onClose={closeDrawer}
        width={Math.min(480, window.innerWidth)}
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            {!isCreating && currentDetail?.isActive && (
              <Popconfirm
                title={t('admin.tenants.deactivateConfirm')}
                onConfirm={() => deactivateMutation.mutate(currentDetail)}
                okText={t('common:actions.confirm')}
                cancelText={t('common:actions.cancel')}
              >
                <Button danger loading={deactivateMutation.isPending}>{t('admin.tenants.deactivate')}</Button>
              </Popconfirm>
            )}
            <Button
              type="primary"
              onClick={() => form.submit()}
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {t('common:actions.save')}
            </Button>
          </div>
        }
      >
        {!isCreating && settingsLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : (
          <Form form={form} layout="vertical" onFinish={handleFinish}>
            <Form.Item name="name" label={t('common:labels.name')} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="code" label={t('common:labels.code')} rules={[{ required: true }]}>
              <Input disabled={!isCreating} />
            </Form.Item>
            <Divider />
            <div style={{ display: 'flex', gap: 12 }}>
              <Form.Item name="defaultWarningDays" label={t('admin.tenants.defaultWarningDays')} rules={[{ required: true }]} style={{ flex: 1 }}>
                <InputNumber min={1} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="defaultCriticalDays" label={t('admin.tenants.defaultCriticalDays')} rules={[{ required: true }]} style={{ flex: 1 }}>
                <InputNumber min={1} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <Form.Item name="warningColor" label={t('admin.tenants.warningColor')}>
                <ColorPicker />
              </Form.Item>
              <Form.Item name="criticalColor" label={t('admin.tenants.criticalColor')}>
                <ColorPicker />
              </Form.Item>
            </div>
          </Form>
        )}
      </Drawer>
    </div>
  );
}
