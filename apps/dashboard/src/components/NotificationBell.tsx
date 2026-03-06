import { Badge, Button, Popover, List, Typography, Space, Empty, Tooltip } from 'antd';
import { BellOutlined, CheckOutlined, DeleteOutlined, ClearOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@algreen/api-client';
import { useAuthStore } from '@algreen/auth';
import { useTranslation } from '@algreen/i18n';
import type { NotificationDto } from '@algreen/shared-types';
import { useState, useCallback } from 'react';

const { Text } = Typography;
const PAGE_SIZE = 15;

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function NotificationBell() {
  const userId = useAuthStore((s) => s.user?.id);
  const { t } = useTranslation('dashboard');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data: count } = useQuery({
    queryKey: ['notifications', 'unread-count', userId],
    queryFn: () => notificationsApi.getUnreadCount(userId!).then((r) => r.data),
    enabled: !!userId,
    refetchInterval: 120_000,
  });

  const { data: pagedResult, isLoading } = useQuery({
    queryKey: ['notifications', 'list', userId, page],
    queryFn: () => notificationsApi.getAll({ userId: userId!, page, pageSize: PAGE_SIZE }).then((r) => r.data),
    enabled: !!userId && open,
  });

  const notifications = pagedResult?.items ?? [];
  const hasMore = pagedResult ? page * PAGE_SIZE < pagedResult.totalCount : false;

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [queryClient]);

  const markAsRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markAsRead(id),
    onSuccess: invalidateAll,
  });

  const markAsUnread = useMutation({
    mutationFn: (id: string) => notificationsApi.markAsUnread(id),
    onSuccess: invalidateAll,
  });

  const markAllAsRead = useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(userId!),
    onSuccess: invalidateAll,
  });

  const deleteOne = useMutation({
    mutationFn: (id: string) => notificationsApi.delete(id),
    onSuccess: invalidateAll,
  });

  const deleteAll = useMutation({
    mutationFn: () => notificationsApi.deleteAll(userId!),
    onSuccess: () => {
      setPage(1);
      invalidateAll();
    },
  });

  const handleOpenChange = (visible: boolean) => {
    setOpen(visible);
    if (visible) setPage(1);
  };

  const content = (
    <div style={{ width: 360 }}>
      <div style={{ marginBottom: 8 }}>
        <Text strong style={{ fontSize: 15 }}>{t('notifications.title')}</Text>
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {(count ?? 0) > 0 && (
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => markAllAsRead.mutate()}
              loading={markAllAsRead.isPending}
            >
              {t('notifications.markAllRead')}
            </Button>
          )}
          {notifications.length > 0 && (
            <Button
              type="link"
              size="small"
              danger
              icon={<ClearOutlined />}
              onClick={() => deleteAll.mutate()}
              loading={deleteAll.isPending}
            >
              {t('notifications.clearAll')}
            </Button>
          )}
        </div>
      </div>
      <List
        loading={isLoading}
        dataSource={notifications}
        locale={{ emptyText: <Empty description={t('notifications.noNotifications')} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        size="small"
        style={{ maxHeight: 400, overflowY: 'auto' }}
        loadMore={hasMore ? (
          <div style={{ textAlign: 'center', margin: '8px 0' }}>
            <Button size="small" onClick={() => setPage((p) => p + 1)}>
              {t('notifications.loadMore')}
            </Button>
          </div>
        ) : null}
        renderItem={(item: NotificationDto) => (
          <List.Item
            style={{
              background: item.isRead ? undefined : '#f6ffed',
              padding: '8px 12px',
            }}
            actions={[
              item.isRead ? (
                <Tooltip key="unread" title={t('notifications.markUnread')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<EyeInvisibleOutlined />}
                    onClick={() => markAsUnread.mutate(item.id)}
                  />
                </Tooltip>
              ) : (
                <Tooltip key="read" title={t('notifications.markAllRead')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<CheckOutlined />}
                    onClick={() => markAsRead.mutate(item.id)}
                  />
                </Tooltip>
              ),
              <Tooltip key="delete" title={t('notifications.delete')}>
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => deleteOne.mutate(item.id)}
                />
              </Tooltip>,
            ]}
          >
            <List.Item.Meta
              title={<Text strong={!item.isRead} style={{ fontSize: 13 }}>{item.title}</Text>}
              description={
                <Space direction="vertical" size={0}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{item.message}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {t('notifications.timeAgo', { time: formatTimeAgo(item.createdAt) })}
                  </Text>
                </Space>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={handleOpenChange}
      placement="bottomRight"
      arrow={false}
    >
      <Badge count={count ?? 0} size="small">
        <Button icon={<BellOutlined />} shape="circle" />
      </Badge>
    </Popover>
  );
}
