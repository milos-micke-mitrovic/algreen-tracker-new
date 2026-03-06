import type { SpecialRequestTypeDto, PagedResult } from '@algreen/shared-types';
import type {
  CreateSpecialRequestTypeRequest,
  UpdateSpecialRequestTypeRequest,
} from '@algreen/shared-types';
import { apiClient } from '../axios-instance';

export const specialRequestTypesApi = {
  getAll(params: { tenantId: string; isActive?: boolean; search?: string; page?: number; pageSize?: number; createdFrom?: string; createdTo?: string }) {
    return apiClient.get<PagedResult<SpecialRequestTypeDto>>('/special-request-types', { params });
  },

  create(data: CreateSpecialRequestTypeRequest) {
    return apiClient.post<SpecialRequestTypeDto>('/special-request-types', data);
  },

  update(id: string, data: UpdateSpecialRequestTypeRequest) {
    return apiClient.put<SpecialRequestTypeDto>(`/special-request-types/${id}`, data);
  },

  deactivate(id: string) {
    return apiClient.delete(`/special-request-types/${id}`);
  },

  activate(id: string) {
    return apiClient.post(`/special-request-types/${id}/activate`);
  },
};
