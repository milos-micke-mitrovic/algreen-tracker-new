import { useState, useEffect, useMemo } from 'react';
import { Typography, Table, Button, Drawer, Form, Input, Select, Tag, App, Switch, DatePicker } from 'antd';
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
import { usersApi, processesApi } from '@algreen/api-client';
import { useAuthStore } from '@algreen/auth';
import { UserRole } from '@algreen/shared-types';
import type { UserDto, ProcessDto } from '@algreen/shared-types';
import { useTranslation, useEnumTranslation } from '@algreen/i18n';
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

export function UsersPage() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserDto | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const { message } = App.useApp();
  const { t } = useTranslation('dashboard');
  const { tEnum } = useEnumTranslation();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [roleFilter, setRoleFilter] = useState<string | undefined>(undefined);
  const [isActiveFilter, setIsActiveFilter] = useState<boolean | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState<dayjs.Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<dayjs.Dayjs | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => { setPage(1); }, [debouncedSearch, roleFilter, isActiveFilter, dateFrom, dateTo]);

  const { data: pagedResult, isLoading } = useQuery({
    queryKey: ['users', tenantId, debouncedSearch, roleFilter, isActiveFilter, dateFrom?.format('YYYY-MM-DD'), dateTo?.format('YYYY-MM-DD'), page, pageSize],
    queryFn: () => usersApi.getAll({
      tenantId: tenantId!,
      search: debouncedSearch || undefined,
      role: roleFilter,
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
    enabled: !!tenantId,
  });

  const processMap = useMemo(() => {
    const map = new Map<string, ProcessDto>();
    (processes ?? []).forEach((p) => map.set(p.id, p));
    return map;
  }, [processes]);

  const createMutation = useMutation({
    mutationFn: (values: Record<string, string>) =>
      usersApi.create({
        tenantId: tenantId!,
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
        role: values.role as UserRole,
        processId: values.role === UserRole.Department ? values.processId : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setCreateOpen(false);
      createForm.resetFields();
      message.success(t('admin.users.created'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.users.createFailed'))),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, unknown> }) =>
      usersApi.update(id, {
        firstName: values.firstName as string,
        lastName: values.lastName as string,
        role: values.role as UserRole,
        isActive: values.isActive as boolean,
        canIncludeWithdrawnInAnalysis: values.canIncludeWithdrawnInAnalysis as boolean,
        processId: values.role === UserRole.Department ? (values.processId as string) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditUser(null);
      editForm.resetFields();
      message.success(t('admin.users.updated'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('admin.users.updateFailed'))),
  });

  const openEdit = (user: UserDto) => {
    setEditUser(user);
    editForm.setFieldsValue({
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      processId: user.processId,
      isActive: user.isActive,
      canIncludeWithdrawnInAnalysis: user.canIncludeWithdrawnInAnalysis,
    });
  };

  const columns = [
    {
      title: t('common:labels.name'),
      dataIndex: 'fullName',
      sorter: (a: UserDto, b: UserDto) => a.fullName.localeCompare(b.fullName),
    },
    {
      title: t('common:labels.email'),
      dataIndex: 'email',
      sorter: (a: UserDto, b: UserDto) => a.email.localeCompare(b.email),
    },
    {
      title: t('common:labels.role'),
      dataIndex: 'role',
      render: (r: UserRole) => <Tag>{tEnum('UserRole', r)}</Tag>,
    },
    {
      title: t('admin.users.process'),
      key: 'process',
      render: (_: unknown, record: UserDto) => {
        if (!record.processId) return '—';
        const proc = processMap.get(record.processId);
        return proc ? <Tag color="blue">{proc.code} — {proc.name}</Tag> : '—';
      },
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
      sorter: (a: UserDto, b: UserDto) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix(),
      render: (d: string) => dayjs(d).format('DD.MM.YYYY.'),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('admin.users.title')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          {t('admin.users.addUser')}
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
          placeholder={t('common:labels.role')}
          allowClear
          value={roleFilter}
          onChange={(v) => setRoleFilter(v)}
          style={{ width: 160 }}
          options={Object.values(UserRole).map((r) => ({ label: tEnum('UserRole', r), value: r }))}
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

      {/* Create User Drawer */}
      <Drawer
        title={t('admin.users.createUser')}
        open={createOpen}
        onClose={() => { createForm.resetFields(); setCreateOpen(false); }}
        width={400}
        extra={
          <Button type="primary" onClick={() => createForm.submit()} loading={createMutation.isPending}>{t('common:actions.save')}</Button>
        }
      >
        <Form form={createForm} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="email" label={t('common:labels.email')} rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label={t('common:labels.password')} rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="firstName" label={t('common:labels.firstName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="lastName" label={t('common:labels.lastName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label={t('common:labels.role')} rules={[{ required: true }]}>
            <Select
              options={Object.values(UserRole).map((r) => ({ label: tEnum('UserRole', r), value: r }))}
              onChange={() => createForm.setFieldValue('processId', undefined)}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.role !== cur.role}>
            {({ getFieldValue }) =>
              getFieldValue('role') === UserRole.Department ? (
                <Form.Item name="processId" label={t('admin.users.process')} rules={[{ required: true }]}>
                  <Select
                    options={(processes ?? []).map((p) => ({ label: `${p.code} — ${p.name}`, value: p.id }))}
                    placeholder={t('admin.users.selectProcess')}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Drawer>

      {/* Edit User Drawer */}
      <Drawer
        title={t('admin.users.editUser')}
        open={!!editUser}
        onClose={() => { editForm.resetFields(); setEditUser(null); }}
        width={400}
        extra={
          <Button type="primary" onClick={() => editForm.submit()} loading={updateMutation.isPending}>{t('common:actions.save')}</Button>
        }
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(v) => updateMutation.mutate({ id: editUser!.id, values: v })}
        >
          <Form.Item name="firstName" label={t('common:labels.firstName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="lastName" label={t('common:labels.lastName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label={t('common:labels.role')} rules={[{ required: true }]}>
            <Select
              options={Object.values(UserRole).map((r) => ({ label: tEnum('UserRole', r), value: r }))}
              onChange={() => editForm.setFieldValue('processId', undefined)}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.role !== cur.role}>
            {({ getFieldValue }) =>
              getFieldValue('role') === UserRole.Department ? (
                <Form.Item name="processId" label={t('admin.users.process')} rules={[{ required: true }]}>
                  <Select
                    options={(processes ?? []).map((p) => ({ label: `${p.code} — ${p.name}`, value: p.id }))}
                    placeholder={t('admin.users.selectProcess')}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="isActive" label={t('common:labels.status')} valuePropName="checked">
            <Switch checkedChildren={t('common:status.active')} unCheckedChildren={t('common:status.inactive')} />
          </Form.Item>
          <Form.Item name="canIncludeWithdrawnInAnalysis" label={t('admin.users.canIncludeWithdrawn')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
        {editUser?.updatedAt && (
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
            {t('common:labels.updated')}: {dayjs(editUser.updatedAt).format('DD.MM.YYYY.')}
          </Typography.Text>
        )}
      </Drawer>
    </div>
  );
}
