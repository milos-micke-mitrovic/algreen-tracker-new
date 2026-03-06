import { useState } from 'react';
import {
  Typography, Row, Col, Card, Table, Tag, Button, Drawer, Form, Input, Select,
  DatePicker, InputNumber, App, Modal,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi, changeRequestsApi } from '@algreen/api-client';
import { useAuthStore } from '@algreen/auth';
import {
  OrderStatus, OrderType, RequestStatus, ChangeRequestType,
} from '@algreen/shared-types';
import type { OrderDto, ChangeRequestDto } from '@algreen/shared-types';
import { StatusBadge } from '../../components/StatusBadge';
import { useTranslation, useEnumTranslation } from '@algreen/i18n';
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

const orderTypeColors: Record<OrderType, string> = {
  [OrderType.Standard]: 'blue',
  [OrderType.Repair]: 'orange',
  [OrderType.Complaint]: 'red',
  [OrderType.Rework]: 'purple',
};

export function SalesDashboard() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { t } = useTranslation('dashboard');
  const { tEnum } = useEnumTranslation();

  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [createCROpen, setCreateCROpen] = useState(false);
  const [crTargetOrder, setCrTargetOrder] = useState<OrderDto | null>(null);
  const [orderForm] = Form.useForm();
  const [crForm] = Form.useForm();

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', tenantId],
    queryFn: () => ordersApi.getAll({ tenantId: tenantId! }).then((r) => r.data.items),
    enabled: !!tenantId,
  });

  const { data: changeRequests, isLoading: crLoading } = useQuery({
    queryKey: ['change-requests', 'my', userId],
    queryFn: () => changeRequestsApi.getMy({ tenantId: tenantId!, userId: userId! }).then((r) => r.data.items),
    enabled: !!tenantId && !!userId,
  });

  const createOrderMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      ordersApi.create({
        tenantId: tenantId!,
        orderNumber: values.orderNumber as string,
        deliveryDate: dayjs(values.deliveryDate as string).format('YYYY-MM-DD') + 'T12:00:00Z',
        priority: values.priority as number,
        orderType: values.orderType as OrderType,
        notes: values.notes as string | undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setCreateOrderOpen(false);
      orderForm.resetFields();
      message.success(t('orders.createdSuccess'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('orders.createFailed'))),
  });

  const createCRMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      changeRequestsApi.create({
        tenantId: tenantId!,
        orderId: values.orderId as string,
        requestedByUserId: userId!,
        requestType: values.requestType as ChangeRequestType,
        description: values.description as string,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['change-requests'] });
      setCreateCROpen(false);
      setCrTargetOrder(null);
      crForm.resetFields();
      message.success(t('sales.changeRequestCreated'));
    },
    onError: (err) => message.error(getTranslatedError(err, t, t('sales.changeRequestFailed'))),
  });

  const openCreateCR = (order?: OrderDto) => {
    setCrTargetOrder(order ?? null);
    crForm.resetFields();
    if (order) crForm.setFieldValue('orderId', order.id);
    setCreateCROpen(true);
  };

  const orderColumns = [
    {
      title: t('orders.orderNumber'),
      dataIndex: 'orderNumber',
      sorter: (a: OrderDto, b: OrderDto) => a.orderNumber.localeCompare(b.orderNumber),
    },
    {
      title: t('orders.orderType'),
      dataIndex: 'orderType',
      width: 110,
      filters: Object.values(OrderType).map((ot) => ({ text: tEnum('OrderType', ot), value: ot })),
      onFilter: (value: unknown, record: OrderDto) => record.orderType === value,
      render: (ot: OrderType) => <Tag color={orderTypeColors[ot]}>{tEnum('OrderType', ot)}</Tag>,
    },
    {
      title: t('common:labels.status'),
      dataIndex: 'status',
      width: 110,
      filters: Object.values(OrderStatus).map((s) => ({ text: tEnum('OrderStatus', s), value: s })),
      onFilter: (value: unknown, record: OrderDto) => record.status === value,
      render: (s: OrderStatus) => <StatusBadge status={s} />,
    },
    {
      title: t('sales.delivery'),
      dataIndex: 'deliveryDate',
      width: 120,
      sorter: (a: OrderDto, b: OrderDto) => dayjs(a.deliveryDate).unix() - dayjs(b.deliveryDate).unix(),
      render: (d: string) => dayjs(d).format('DD.MM.YYYY.'),
    },
    {
      title: t('common:labels.items'),
      dataIndex: 'itemCount',
      width: 80,
      align: 'center' as const,
    },
    {
      title: '',
      width: 140,
      render: (_: unknown, record: OrderDto) => {
        if (record.status === OrderStatus.Cancelled || record.status === OrderStatus.Completed) return null;
        return (
          <Button size="small" onClick={(e) => { e.stopPropagation(); openCreateCR(record); }}>
            {t('sales.requestChange')}
          </Button>
        );
      },
    },
  ];

  const crColumns = [
    {
      title: t('common:labels.type'),
      dataIndex: 'requestType',
      width: 140,
      filters: Object.values(ChangeRequestType).map((rt) => ({ text: tEnum('ChangeRequestType', rt), value: rt })),
      onFilter: (value: unknown, record: ChangeRequestDto) => record.requestType === value,
      render: (rt: ChangeRequestType) => <Tag color="blue">{tEnum('ChangeRequestType', rt)}</Tag>,
    },
    { title: t('common:labels.description'), dataIndex: 'description', ellipsis: true },
    {
      title: t('changeRequests.responseNote'),
      dataIndex: 'responseNote',
      ellipsis: true,
      render: (note: string | null, record: ChangeRequestDto) => {
        if (!note) return '—';
        const color = record.status === RequestStatus.Approved ? 'success' : record.status === RequestStatus.Rejected ? 'danger' : undefined;
        return <Text type={color}>{note}</Text>;
      },
    },
    {
      title: t('common:labels.status'),
      dataIndex: 'status',
      width: 110,
      filters: Object.values(RequestStatus).map((s) => ({ text: tEnum('RequestStatus', s), value: s })),
      onFilter: (value: unknown, record: ChangeRequestDto) => record.status === value,
      render: (s: RequestStatus) => <StatusBadge status={s} />,
    },
    {
      title: t('common:labels.created'),
      dataIndex: 'createdAt',
      width: 150,
      sorter: (a: ChangeRequestDto, b: ChangeRequestDto) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix(),
      defaultSortOrder: 'descend' as const,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY.'),
    },
  ];

  return (
    <div>
      <Title level={4}>{t('sales.title')}</Title>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card
            title={t('sales.myOrders')}
            loading={ordersLoading}
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOrderOpen(true)}>
                {t('orders.createOrder')}
              </Button>
            }
          >
            <Table
              dataSource={orders}
              rowKey="id"
              size="small"
              scroll={{ x: 'max-content' }}
              columns={orderColumns}
            />
          </Card>
        </Col>

        <Col span={24}>
          <Card
            title={t('sales.myChangeRequests')}
            loading={crLoading}
            extra={
              <Button icon={<PlusOutlined />} onClick={() => openCreateCR()}>
                {t('sales.createChangeRequest')}
              </Button>
            }
          >
            <Table
              dataSource={changeRequests}
              rowKey="id"
              size="small"
              scroll={{ x: 'max-content' }}
              columns={crColumns}
            />
          </Card>
        </Col>
      </Row>

      {/* Create Order Drawer */}
      <Drawer
        title={t('orders.createOrder')}
        open={createOrderOpen}
        onClose={() => { orderForm.resetFields(); setCreateOrderOpen(false); }}
        width={Math.min(480, window.innerWidth)}
        extra={
          <Button type="primary" onClick={() => orderForm.submit()} loading={createOrderMutation.isPending}>{t('common:actions.save')}</Button>
        }
      >
        <Form form={orderForm} layout="vertical" onFinish={(v) => createOrderMutation.mutate(v)}>
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="orderNumber" label={t('orders.orderNumberLabel')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="orderType" label={t('orders.orderType')} rules={[{ required: true }]}>
                <Select options={Object.values(OrderType).map((ot) => ({ label: tEnum('OrderType', ot), value: ot }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={14}>
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
            <Col span={10}>
              <Form.Item name="priority" label={t('common:labels.priority')} rules={[{ required: true }]} initialValue={1}>
                <InputNumber min={1} precision={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label={t('common:labels.notes')}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Create Change Request Modal */}
      <Modal
        title={t('sales.createChangeRequest')}
        open={createCROpen}
        onCancel={() => { crForm.resetFields(); setCreateCROpen(false); setCrTargetOrder(null); }}
        onOk={() => crForm.submit()}
        okText={t('common:actions.save')}
        cancelText={t('common:actions.cancel')}
        confirmLoading={createCRMutation.isPending}
      >
        <Form form={crForm} layout="vertical" onFinish={(v) => createCRMutation.mutate(v)} style={{ marginTop: 16 }}>
          {crTargetOrder ? (
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">{t('sales.forOrder')}:</Text>{' '}
              <Text strong>{crTargetOrder.orderNumber}</Text>
              <Form.Item name="orderId" hidden><Input /></Form.Item>
            </div>
          ) : (
            <Form.Item name="orderId" label={t('sales.selectOrder')} rules={[{ required: true }]}>
              <Select
                showSearch
                optionFilterProp="label"
                options={(orders ?? [])
                  .filter((o) => o.status !== OrderStatus.Cancelled && o.status !== OrderStatus.Completed)
                  .map((o) => ({ label: o.orderNumber, value: o.id }))}
              />
            </Form.Item>
          )}
          <Form.Item name="requestType" label={t('common:labels.type')} rules={[{ required: true }]}>
            <Select options={Object.values(ChangeRequestType).map((rt) => ({ label: tEnum('ChangeRequestType', rt), value: rt }))} />
          </Form.Item>
          <Form.Item name="description" label={t('common:labels.description')} rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
