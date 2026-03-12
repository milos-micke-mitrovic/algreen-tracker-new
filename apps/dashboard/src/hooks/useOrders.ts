import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '@algreen/api-client';
import type { OrdersQuery } from '@algreen/api-client';
import { useAuthStore } from '@algreen/auth';
import type { OrderStatus, CreateOrderRequest, UpdateOrderRequest, AddOrderItemRequest } from '@algreen/shared-types';

export function useOrders(filters?: { status?: OrderStatus; search?: string; page?: number; pageSize?: number }) {
  const tenantId = useAuthStore((s) => s.tenantId);
  const params: OrdersQuery = {
    tenantId: tenantId!,
    ...filters,
  };
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () => ordersApi.getAll(params).then((r) => r.data),
    enabled: !!tenantId,
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => ordersApi.getById(id!).then((r) => r.data),
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateOrderRequest & { attachments?: File[]; itemAttachments?: Map<number, File[]> }) => ordersApi.create(data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-master-view'] });
    },
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateOrderRequest }) =>
      ordersApi.update(id, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-master-view'] });
    },
  });
}

export function useAddOrderItem(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AddOrderItemRequest) =>
      ordersApi.addItem(orderId, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', orderId] });
    },
  });
}

export function useRemoveOrderItem(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => ordersApi.removeItem(orderId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', orderId] });
    },
  });
}

export function useActivateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ordersApi.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-master-view'] });
    },
  });
}

export function usePauseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ordersApi.pause(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-master-view'] });
    },
  });
}

export function useResumeOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ordersApi.resume(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-master-view'] });
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ordersApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-master-view'] });
    },
  });
}

export function useReopenOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ordersApi.reopen(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-master-view'] });
    },
  });
}
