import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Typography, Table, Alert, Statistic, List, Tag, Badge, Tooltip, Button, Drawer } from 'antd';
import {
  WarningOutlined,
  ClockCircleOutlined,
  StopOutlined,
  BarChartOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import type {
  DashboardStatisticsDto,
  DeadlineWarningDto,
  LiveViewProcessDto,
  LiveViewOrderDto,
  WorkerStatusDto,
  PendingBlockRequestDto,
  ChangeRequestDto,
} from '@algreen/shared-types';
import {
  useDashboardWarnings,
  useDashboardLiveView,
  useDashboardWorkersStatus,
  useDashboardPendingBlocks,
  useDashboardStatistics,
  usePendingChangeRequests,
} from '../../hooks/useDashboard';
import { useTranslation, useEnumTranslation } from '@algreen/i18n';

const { Title, Text } = Typography;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}.`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function CoordinatorDashboard() {
  const navigate = useNavigate();
  const [activeOrdersProcess, setActiveOrdersProcess] = useState<LiveViewProcessDto | null>(null);
  const warnings = useDashboardWarnings();
  const liveView = useDashboardLiveView();
  const workers = useDashboardWorkersStatus();
  const pendingBlocks = useDashboardPendingBlocks();
  const statistics = useDashboardStatistics();
  const changeRequests = usePendingChangeRequests();
  const { t } = useTranslation('dashboard');
  const { tEnum } = useEnumTranslation();

  return (
    <div>
      <Title level={4}>{t('coordinator.title')}</Title>

      <Row gutter={[16, 16]}>
        {/* Statistics */}
        <Col xs={24} lg={12}>
          <Card title={<><BarChartOutlined /> {t('coordinator.statistics')}</>} loading={statistics.isLoading}>
            {statistics.data ? (() => {
              const s = statistics.data as DashboardStatisticsDto;
              const items: { title: string; value: number; suffix?: string; color?: string }[] = [
                { title: t('coordinator.stats.ordersActive'), value: s.today?.ordersActive ?? 0 },
                { title: t('coordinator.stats.ordersCompleted'), value: s.today?.ordersCompleted ?? 0 },
                { title: t('coordinator.stats.processesCompleted'), value: s.today?.processesCompleted ?? 0 },
                { title: t('coordinator.stats.avgProcessTime'), value: s.today?.averageProcessTimeMinutes ?? 0, suffix: t('coordinator.stats.min') },
                { title: t('coordinator.stats.criticalWarnings'), value: s.warnings?.criticalCount ?? 0, color: s.warnings?.criticalCount ? '#cf1322' : undefined },
                { title: t('coordinator.stats.warnings'), value: s.warnings?.warningCount ?? 0, color: s.warnings?.warningCount ? '#faad14' : undefined },
                { title: t('coordinator.stats.pendingBlockRequests'), value: s.pendingBlockRequests ?? 0 },
              ];
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px 16px' }}>
                  {items.map((item) => (
                    <div key={item.title} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 64 }}>
                      <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', lineHeight: 1.3, marginBottom: 4 }}>{item.title}</div>
                      <Statistic
                        value={item.value}
                        suffix={item.suffix}
                        valueStyle={{ fontSize: 24, ...(item.color ? { color: item.color } : {}) }}
                      />
                    </div>
                  ))}
                </div>
              );
            })() : (
              !statistics.isLoading && <Alert message={t('coordinator.noStatistics')} type="info" />
            )}
          </Card>
        </Col>

        {/* Deadline Warnings */}
        <Col xs={24} lg={12}>
          <Card
            title={<><WarningOutlined /> {t('coordinator.deadlineWarnings')}</>}
            loading={warnings.isLoading}
          >
            {Array.isArray(warnings.data) && warnings.data.length > 0 ? (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              <List
                size="small"
                dataSource={warnings.data as DeadlineWarningDto[]}
                renderItem={(item: DeadlineWarningDto) => {
                  const isOverdue = item.daysRemaining < 0;
                  const daysText = isOverdue
                    ? t('coordinator.daysOverdue', { count: Math.abs(item.daysRemaining) })
                    : t('coordinator.daysRemaining', { count: item.daysRemaining });
                  return (
                  <List.Item>
                    <List.Item.Meta
                      title={item.orderNumber}
                      description={
                        <>
                          <span style={isOverdue ? { color: '#cf1322', fontWeight: 500 } : undefined}>
                            {daysText}
                          </span>
                          {' · '}
                          {t('coordinator.deliveryDate')}: {formatDate(item.deliveryDate)}
                          {item.currentProcess && (
                            <> · {t('coordinator.currentProcess')}: {item.currentProcess}</>
                          )}
                        </>
                      }
                    />
                    <Tag color={item.level === 'Critical' ? 'red' : 'orange'}>
                      {item.level === 'Critical' ? t('coordinator.levelCritical') : t('coordinator.levelWarning')}
                    </Tag>
                  </List.Item>
                  );
                }}
              />
              </div>
            ) : (
              !warnings.isLoading && <Alert message={t('coordinator.noWarnings')} type="success" />
            )}
          </Card>
        </Col>

        {/* Live View */}
        <Col xs={24}>
          <Card title={<><ClockCircleOutlined /> {t('coordinator.liveView')}</>} loading={liveView.isLoading || workers.isLoading}>
            {Array.isArray(liveView.data) && liveView.data.length > 0 ? (
              <Table<LiveViewProcessDto>
                size="small"
                dataSource={liveView.data}
                rowKey={(r) => r.processId}
                pagination={false}
                scroll={{ x: 'max-content' }}
                onRow={(record) => ({
                  onClick: () => setActiveOrdersProcess(record),
                  style: { cursor: 'pointer' },
                })}
                columns={[
                  {
                    title: t('coordinator.liveProcess'),
                    key: 'process',
                    render: (_, r) => (
                      <>{r.processCode} — {r.processName}</>
                    ),
                  },
                  {
                    title: t('coordinator.liveWorkers'),
                    key: 'workers',
                    width: 180,
                    render: (_, r) => {
                      const workersList = Array.isArray(workers.data) ? workers.data as WorkerStatusDto[] : [];
                      const match = workersList.find((w) => w.processId === r.processId);
                      const isOnline = !!match?.isWorkerCheckedIn;
                      const worker = match?.worker;
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', backgroundColor: isOnline ? '#52c41a' : '#ff4d4f', flexShrink: 0 }} />
                          {isOnline && worker ? (
                            <Text style={{ fontSize: 13 }}>
                              {worker.name}
                              {worker.checkInTime && (
                                <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
                                  ({formatTime(worker.checkInTime)})
                                </Text>
                              )}
                            </Text>
                          ) : (
                            <Text type="secondary" style={{ fontSize: 13 }}>{t('coordinator.workerOffline')}</Text>
                          )}
                        </div>
                      );
                    },
                  },
                  {
                    title: t('coordinator.liveQueue'),
                    dataIndex: 'queueCount',
                    key: 'queueCount',
                    width: 90,
                    align: 'center' as const,
                    render: (v: number) => <Badge count={v} showZero color={v > 0 ? 'blue' : 'default'} />,
                  },
                  {
                    title: t('coordinator.liveInProgress'),
                    dataIndex: 'inProgressCount',
                    key: 'inProgressCount',
                    width: 100,
                    align: 'center' as const,
                    render: (v: number) => <Badge count={v} showZero color={v > 0 ? 'green' : 'default'} />,
                  },
                ]}
              />
            ) : (
              !liveView.isLoading && <Alert message={t('coordinator.noLiveData')} type="info" />
            )}
          </Card>
        </Col>

        {/* Pending Blocks */}
        <Col xs={24} lg={12}>
          <Card title={<><StopOutlined /> {t('coordinator.pendingBlocks')}</>} loading={pendingBlocks.isLoading}>
            {Array.isArray(pendingBlocks.data) && pendingBlocks.data.length > 0 ? (
              <List
                size="small"
                dataSource={pendingBlocks.data as PendingBlockRequestDto[]}
                renderItem={(item: PendingBlockRequestDto) => (
                  <List.Item
                    extra={
                      <div style={{ textAlign: 'right', fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                        <div>{item.requestedBy}</div>
                        <div>{formatDateTime(item.requestedAt)}</div>
                      </div>
                    }
                  >
                    <List.Item.Meta
                      title={<>{item.orderNumber} — {item.processName}</>}
                      description={
                        <>
                          {item.productName}
                          {item.requestNote && <> · {item.requestNote}</>}
                        </>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              !pendingBlocks.isLoading && <Alert message={t('coordinator.noPendingBlocks')} type="success" />
            )}
          </Card>
        </Col>

        {/* Pending Change Requests */}
        <Col xs={24} lg={12}>
          <Card
            title={<><SwapOutlined /> {t('coordinator.pendingChangeRequests')}</>}
            loading={changeRequests.isLoading}
            extra={
              Array.isArray(changeRequests.data) && changeRequests.data.length > 0
                ? <Button type="link" size="small" onClick={() => navigate('/change-requests')}>{t('coordinator.viewAll')}</Button>
                : undefined
            }
          >
            {Array.isArray(changeRequests.data) && changeRequests.data.length > 0 ? (
              <List
                size="small"
                dataSource={(changeRequests.data as ChangeRequestDto[]).slice(0, 5)}
                renderItem={(item: ChangeRequestDto) => (
                  <List.Item
                    extra={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {formatDateTime(item.createdAt)}
                      </Text>
                    }
                  >
                    <List.Item.Meta
                      title={<Tag color="blue">{tEnum('ChangeRequestType', item.requestType)}</Tag>}
                      description={item.description}
                    />
                  </List.Item>
                )}
              />
            ) : (
              !changeRequests.isLoading && <Alert message={t('coordinator.noPendingChangeRequests')} type="success" />
            )}
          </Card>
        </Col>
      </Row>

      {/* Active Orders Drawer */}
      <Drawer
        title={activeOrdersProcess ? `${activeOrdersProcess.processCode} — ${activeOrdersProcess.processName}` : ''}
        open={!!activeOrdersProcess}
        onClose={() => setActiveOrdersProcess(null)}
        width={480}
      >
        {activeOrdersProcess && Array.isArray(activeOrdersProcess.activeOrders) && (
          <List
            size="small"
            dataSource={activeOrdersProcess.activeOrders as LiveViewOrderDto[]}
            renderItem={(o: LiveViewOrderDto, idx: number) => (
              <List.Item key={o.orderItemId ?? idx}>
                <List.Item.Meta
                  title={
                    <>{o.orderNumber} · {o.productName}</>
                  }
                  description={
                    <>
                      <Tag color={o.status === 'InProgress' ? 'green' : o.status === 'Pending' ? 'default' : 'blue'}>
                        {tEnum('ProcessStatus', o.status)}
                      </Tag>
                      {o.isBlocked && (
                        <Tag color="red" icon={<StopOutlined />} style={{ borderStyle: 'dashed' }}>
                          {t('coordinator.blocked')}{o.blockReason ? `: ${o.blockReason}` : ''}
                        </Tag>
                      )}
                    </>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </div>
  );
}
