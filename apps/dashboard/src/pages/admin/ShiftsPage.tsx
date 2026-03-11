import { useState, useEffect } from 'react';
import { useTableHeight } from '../../hooks/useTableHeight';
import { Typography, Table, Button, Drawer, Form, Input, TimePicker, Tag, App, Select, Popconfirm, DatePicker } from 'antd';
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
import { shiftsApi } from '@algreen/api-client';
import { useAuthStore } from '@algreen/auth';
import type { ShiftDto } from '@algreen/shared-types';
import { useTranslation } from '@algreen/i18n';
import dayjs from 'dayjs';

const { Title } = Typography;

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

export function ShiftsPage() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editShift, setEditShift] = useState<ShiftDto | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const { message } = App.useApp();
  const { t } = useTranslation('dashboard');

  const { ref: tableWrapperRef, height: tableBodyHeight } = useTableHeight();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [isActiveFilter, setIsActiveFilter] = useState<boolean | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState<dayjs.Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<dayjs.Dayjs | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => { setPage(1); }, [debouncedSearch, isActiveFilter, dateFrom, dateTo]);

  const { data: pagedResult, isLoading } = useQuery({
    queryKey: ['shifts', tenantId, debouncedSearch, isActiveFilter, dateFrom?.format('YYYY-MM-DD'), dateTo?.format('YYYY-MM-DD'), page, pageSize],
    queryFn: () => shiftsApi.getAll({
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

  const createMutation = useMutation({
    mutationFn: (values: { name: string; startTime: dayjs.Dayjs; endTime: dayjs.Dayjs }) =>
      shiftsApi.create({
        tenantId: tenantId!,
        name: values.name,
        startTime: values.startTime.format('HH:mm:ss'),
        endTime: values.endTime.format('HH:mm:ss'),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      setCreateOpen(false);
      createForm.resetFields();
      message.success(t('admin.shifts.created'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.shifts.createFailed'))),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: { name: string; startTime: dayjs.Dayjs; endTime: dayjs.Dayjs } }) =>
      shiftsApi.update(id, {
        name: values.name,
        startTime: values.startTime.format('HH:mm:ss'),
        endTime: values.endTime.format('HH:mm:ss'),
        isActive: editShift!.isActive,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      setEditShift(null);
      editForm.resetFields();
      message.success(t('admin.shifts.updated'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.shifts.updateFailed'))),
  });

  const deactivateMutation = useMutation({
    mutationFn: (shift: ShiftDto) =>
      shiftsApi.update(shift.id, {
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        isActive: false,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      setEditShift(null);
      editForm.resetFields();
      message.success(t('admin.shifts.deactivated'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.shifts.updateFailed'))),
  });

  const activateMutation = useMutation({
    mutationFn: (shift: ShiftDto) =>
      shiftsApi.update(shift.id, {
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        isActive: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      setEditShift(null);
      editForm.resetFields();
      message.success(t('admin.shifts.activated'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.shifts.updateFailed'))),
  });

  const openEdit = (shift: ShiftDto) => {
    setEditShift(shift);
    editForm.setFieldsValue({
      name: shift.name,
      startTime: dayjs(shift.startTime, 'HH:mm:ss'),
      endTime: dayjs(shift.endTime, 'HH:mm:ss'),
    });
  };

  const columns = [
    {
      title: t('common:labels.name'),
      dataIndex: 'name',
      sorter: (a: ShiftDto, b: ShiftDto) => a.name.localeCompare(b.name),
    },
    {
      title: t('admin.shifts.startTime'),
      dataIndex: 'startTime',
      width: 120,
      sorter: (a: ShiftDto, b: ShiftDto) => a.startTime.localeCompare(b.startTime),
      render: (time: string) => time.slice(0, 5),
    },
    {
      title: t('admin.shifts.endTime'),
      dataIndex: 'endTime',
      width: 120,
      sorter: (a: ShiftDto, b: ShiftDto) => a.endTime.localeCompare(b.endTime),
      render: (time: string) => time.slice(0, 5),
    },
    {
      title: t('common:labels.created'),
      dataIndex: 'createdAt',
      width: 150,
      render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY.') : '—',
      sorter: (a: ShiftDto, b: ShiftDto) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('admin.shifts.title')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          {t('admin.shifts.addShift')}
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
          onRow={(record) => ({
            onClick: () => openEdit(record),
            style: { cursor: 'pointer' },
          })}
        />
      </div>

      {/* Create Drawer */}
      <Drawer
        title={t('admin.shifts.createShift')}
        open={createOpen}
        onClose={() => { createForm.resetFields(); setCreateOpen(false); }}
        width={400}
        extra={
          <Button type="primary" onClick={() => createForm.submit()} loading={createMutation.isPending}>{t('common:actions.save')}</Button>
        }
      >
        <Form form={createForm} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="name" label={t('common:labels.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="startTime" label={t('admin.shifts.startTime')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="endTime" label={t('admin.shifts.endTime')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Drawer>

      {/* Edit Drawer */}
      <Drawer
        title={t('admin.shifts.editShift')}
        open={!!editShift}
        onClose={() => { editForm.resetFields(); setEditShift(null); }}
        width={400}
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            {editShift?.isActive ? (
              <Popconfirm
                title={t('admin.shifts.deactivateConfirm')}
                onConfirm={() => deactivateMutation.mutate(editShift)}
                okText={t('common:actions.confirm')}
                cancelText={t('common:actions.cancel')}
              >
                <Button danger loading={deactivateMutation.isPending}>{t('admin.shifts.deactivate')}</Button>
              </Popconfirm>
            ) : editShift && (
              <Popconfirm
                title={t('admin.shifts.activateConfirm')}
                onConfirm={() => activateMutation.mutate(editShift)}
                okText={t('common:actions.confirm')}
                cancelText={t('common:actions.cancel')}
              >
                <Button type="primary" ghost loading={activateMutation.isPending}>{t('admin.shifts.activate')}</Button>
              </Popconfirm>
            )}
            <Button type="primary" onClick={() => editForm.submit()} loading={updateMutation.isPending}>{t('common:actions.save')}</Button>
          </div>
        }
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(v) => updateMutation.mutate({ id: editShift!.id, values: v })}
        >
          <Form.Item name="name" label={t('common:labels.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="startTime" label={t('admin.shifts.startTime')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="endTime" label={t('admin.shifts.endTime')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
        {editShift?.updatedAt && (
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
            {t('common:labels.updated')}: {dayjs(editShift.updatedAt).format('DD.MM.YYYY.')}
          </Typography.Text>
        )}
      </Drawer>
    </div>
  );
}
