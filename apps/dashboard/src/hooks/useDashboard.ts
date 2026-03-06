import { useQuery } from '@tanstack/react-query';
import { dashboardApi, changeRequestsApi } from '@algreen/api-client';
import { useAuthStore } from '@algreen/auth';
import { RequestStatus } from '@algreen/shared-types';

export function useDashboardWarnings() {
  const tenantId = useAuthStore((s) => s.tenantId);
  return useQuery({
    queryKey: ['dashboard', 'warnings', tenantId],
    queryFn: () => dashboardApi.getWarnings(tenantId!).then((r) => r.data),
    enabled: !!tenantId,
    refetchInterval: 300_000,
  });
}

export function useDashboardLiveView() {
  const tenantId = useAuthStore((s) => s.tenantId);
  return useQuery({
    queryKey: ['dashboard', 'live-view', tenantId],
    queryFn: () => dashboardApi.getLiveView(tenantId!).then((r) => r.data),
    enabled: !!tenantId,
    refetchInterval: 60_000,
  });
}

export function useDashboardWorkersStatus() {
  const tenantId = useAuthStore((s) => s.tenantId);
  return useQuery({
    queryKey: ['dashboard', 'workers-status', tenantId],
    queryFn: () => dashboardApi.getWorkersStatus(tenantId!).then((r) => r.data),
    enabled: !!tenantId,
    refetchInterval: 120_000,
  });
}

export function useDashboardPendingBlocks() {
  const tenantId = useAuthStore((s) => s.tenantId);
  return useQuery({
    queryKey: ['dashboard', 'pending-blocks', tenantId],
    queryFn: () => dashboardApi.getPendingBlocks(tenantId!).then((r) => r.data),
    enabled: !!tenantId,
    refetchInterval: 120_000,
  });
}

export function useDashboardStatistics() {
  const tenantId = useAuthStore((s) => s.tenantId);
  return useQuery({
    queryKey: ['dashboard', 'statistics', tenantId],
    queryFn: () => dashboardApi.getStatistics(tenantId!).then((r) => r.data),
    enabled: !!tenantId,
    refetchInterval: 300_000,
  });
}

export function usePendingChangeRequests() {
  const tenantId = useAuthStore((s) => s.tenantId);
  return useQuery({
    queryKey: ['dashboard', 'pending-change-requests', tenantId],
    queryFn: () =>
      changeRequestsApi
        .getAll({ tenantId: tenantId!, status: RequestStatus.Pending })
        .then((r) => r.data.items),
    enabled: !!tenantId,
    refetchInterval: 120_000,
  });
}
