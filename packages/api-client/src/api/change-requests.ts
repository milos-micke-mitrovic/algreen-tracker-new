import type { ChangeRequestDto, PagedResult, RequestStatus } from '@algreen/shared-types';
import type {
  CreateChangeRequestRequest,
  HandleChangeRequestRequest,
} from '@algreen/shared-types';
import { apiClient } from '../axios-instance';

export const changeRequestsApi = {
  getAll(params: { tenantId: string; status?: RequestStatus; requestType?: string; search?: string; page?: number; pageSize?: number; createdFrom?: string; createdTo?: string }) {
    return apiClient.get<PagedResult<ChangeRequestDto>>('/change-requests', { params });
  },

  getMy(params: { tenantId: string; userId: string; status?: RequestStatus; search?: string; page?: number; pageSize?: number }) {
    return apiClient.get<PagedResult<ChangeRequestDto>>('/change-requests/my', { params });
  },

  create(data: CreateChangeRequestRequest) {
    return apiClient.post<ChangeRequestDto>('/change-requests', data);
  },

  approve(id: string, data: HandleChangeRequestRequest) {
    return apiClient.post<ChangeRequestDto>(`/change-requests/${id}/approve`, data);
  },

  reject(id: string, data: HandleChangeRequestRequest) {
    return apiClient.post<ChangeRequestDto>(`/change-requests/${id}/reject`, data);
  },
};
