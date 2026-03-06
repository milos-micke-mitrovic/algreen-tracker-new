import { useState, useEffect } from 'react';
import { Typography, Table, Space, Button, App, Popconfirm, Tag, Input, Select, DatePicker } from 'antd';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { changeRequestsApi } from '@algreen/api-client';
import { useAuthStore } from '@algreen/auth';
import { RequestStatus, ChangeRequestType } from '@algreen/shared-types';
import type { ChangeRequestDto } from '@algreen/shared-types';
import { StatusBadge } from '../../components/StatusBadge';
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

export function ChangeRequestsPage() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const userId = useAuthStore((s) => s.user?.id);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | undefined>(undefined);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [dateFrom, setDateFrom] = useState<dayjs.Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<dayjs.Dayjs | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { t } = useTranslation('dashboard');
  const { tEnum } = useEnumTranslation();

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, dateFrom, dateTo]);

  const { data: pagedResult, isLoading } = useQuery({
    queryKey: ['change-requests', tenantId, statusFilter, debouncedSearch, dateFrom?.format('YYYY-MM-DD'), dateTo?.format('YYYY-MM-DD'), page, pageSize],
    queryFn: () => changeRequestsApi.getAll({
      tenantId: tenantId!,
      status: statusFilter,
      search: debouncedSearch || undefined,
      createdFrom: dateFrom?.format('YYYY-MM-DD'),
      createdTo: dateTo?.format('YYYY-MM-DD'),
      page,
      pageSize,
    }).then((r) => r.data),
    enabled: !!tenantId,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      changeRequestsApi.approve(id, { handledByUserId: userId! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['change-requests'] });
      message.success(t('changeRequests.approved'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('changeRequests.approveFailed'))),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      changeRequestsApi.reject(id, { handledByUserId: userId! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['change-requests'] });
      message.success(t('changeRequests.rejected'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('changeRequests.rejectFailed'))),
  });

  const columns = [
    {
      title: t('common:labels.status'),
      dataIndex: 'status',
      width: 110,
      render: (s: RequestStatus) => <StatusBadge status={s} />,
    },
    {
      title: t('common:labels.type'),
      dataIndex: 'requestType',
      width: 140,
      render: (rt: string) => <Tag color="blue">{tEnum('ChangeRequestType', rt)}</Tag>,
    },
    {
      title: t('common:labels.description'),
      dataIndex: 'description',
      ellipsis: true,
      sorter: (a: ChangeRequestDto, b: ChangeRequestDto) => (a.description ?? '').localeCompare(b.description ?? ''),
    },
    {
      title: t('changeRequests.responseNote'),
      dataIndex: 'responseNote',
      ellipsis: true,
      render: (note: string | null, record: ChangeRequestDto) => {
        if (!note) return '—';
        const color = record.status === RequestStatus.Approved ? 'success' : record.status === RequestStatus.Rejected ? 'danger' : undefined;
        return <Typography.Text type={color}>{note}</Typography.Text>;
      },
    },
    {
      title: t('common:labels.created'),
      dataIndex: 'createdAt',
      width: 150,
      sorter: (a: ChangeRequestDto, b: ChangeRequestDto) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix(),
      defaultSortOrder: 'descend' as const,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY.'),
    },
    {
      title: t('common:labels.handledAt'),
      dataIndex: 'updatedAt',
      width: 150,
      render: (d: string | null) => d ? dayjs(d).format('DD.MM.YYYY.') : '—',
      sorter: (a: ChangeRequestDto, b: ChangeRequestDto) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''),
    },
    {
      title: t('common:labels.actions'),
      width: 180,
      render: (_: unknown, record: ChangeRequestDto) => {
        if (record.status === RequestStatus.Pending) {
          return (
            <Space>
              <Popconfirm
                title={t('changeRequests.approveConfirm')}
                okText={t('common:actions.confirm')}
                cancelText={t('common:actions.no')}
                onConfirm={() => approveMutation.mutate(record.id)}
              >
                <Button
                  type="primary"
                  size="small"
                  loading={approveMutation.isPending}
                >
                  {t('common:actions.approve')}
                </Button>
              </Popconfirm>
              <Popconfirm
                title={t('changeRequests.rejectConfirm')}
                okText={t('common:actions.confirm')}
                cancelText={t('common:actions.no')}
                onConfirm={() => rejectMutation.mutate(record.id)}
              >
                <Button
                  danger
                  size="small"
                  loading={rejectMutation.isPending}
                >
                  {t('common:actions.reject')}
                </Button>
              </Popconfirm>
            </Space>
          );
        }
        return null;
      },
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>{t('changeRequests.title')}</Title>

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
          value={statusFilter}
          onChange={(v) => setStatusFilter(v)}
          style={{ width: 160 }}
          options={Object.values(RequestStatus).map((s) => ({ label: tEnum('RequestStatus', s), value: s }))}
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
        dataSource={pagedResult?.items}
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
      />
    </div>
  );
}
