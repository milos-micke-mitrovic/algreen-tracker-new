import type { BlockRequestDto, PagedResult, RequestStatus } from '@algreen/shared-types';
import type {
  CreateBlockRequestRequest,
  HandleBlockRequestRequest,
} from '@algreen/shared-types';
import { apiClient } from '../axios-instance';

export const blockRequestsApi = {
  getAll(params: { tenantId: string; status?: RequestStatus; search?: string; page?: number; pageSize?: number; createdFrom?: string; createdTo?: string }) {
    return apiClient.get<PagedResult<BlockRequestDto>>('/block-requests', { params });
  },

  create(data: CreateBlockRequestRequest) {
    return apiClient.post<BlockRequestDto>('/block-requests', data);
  },

  approve(id: string, data: HandleBlockRequestRequest) {
    return apiClient.post<BlockRequestDto>(`/block-requests/${id}/approve`, data);
  },

  reject(id: string, data: HandleBlockRequestRequest) {
    return apiClient.post<BlockRequestDto>(`/block-requests/${id}/reject`, data);
  },
};
