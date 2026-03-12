import type { OrderItemProcessDto } from '@algreen/shared-types';
import type {
  StartProcessWorkRequest,
  StopProcessWorkRequest,
  ResumeProcessWorkRequest,
  BlockProcessRequest,
  UnblockProcessRequest,
  WithdrawProcessRequest,
} from '@algreen/shared-types';
import { apiClient } from '../axios-instance';

export const processWorkflowApi = {
  start(id: string, data: StartProcessWorkRequest) {
    return apiClient.post<OrderItemProcessDto>(`/order-item-processes/${id}/start`, data);
  },

  stop(id: string, data: StopProcessWorkRequest) {
    return apiClient.post(`/order-item-processes/${id}/stop`, data);
  },

  resume(id: string, data: ResumeProcessWorkRequest) {
    return apiClient.post(`/order-item-processes/${id}/resume`, data);
  },

  complete(id: string) {
    return apiClient.post(`/order-item-processes/${id}/complete`);
  },

  block(id: string, data: BlockProcessRequest) {
    return apiClient.post(`/order-item-processes/${id}/block`, data);
  },

  unblock(id: string, data: UnblockProcessRequest) {
    return apiClient.post(`/order-item-processes/${id}/unblock`, data);
  },

  withdraw(id: string, data: WithdrawProcessRequest) {
    return apiClient.post(`/order-item-processes/${id}/withdraw`, data);
  },

  pauseStation(data: { processId: string; tenantId: string; userId: string }) {
    return apiClient.post('/order-item-processes/pause-station', data);
  },

  resumeStation(data: { processId: string; tenantId: string; userId: string }) {
    return apiClient.post('/order-item-processes/resume-station', data);
  },
};
