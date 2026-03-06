import type { ShiftDto, PagedResult } from '@algreen/shared-types';
import type { CreateShiftRequest, UpdateShiftRequest } from '@algreen/shared-types';
import { apiClient } from '../axios-instance';

export const shiftsApi = {
  getAll(params: { tenantId: string; isActive?: boolean; search?: string; page?: number; pageSize?: number; createdFrom?: string; createdTo?: string }) {
    return apiClient.get<PagedResult<ShiftDto>>('/shifts', { params });
  },

  create(data: CreateShiftRequest) {
    return apiClient.post<ShiftDto>('/shifts', data);
  },

  update(id: string, data: UpdateShiftRequest) {
    return apiClient.put<ShiftDto>(`/shifts/${id}`, data);
  },
};
