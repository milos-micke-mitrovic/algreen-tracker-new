import type { ProcessDto, PagedResult } from '@algreen/shared-types';
import type {
  CreateProcessRequest,
  UpdateProcessRequest,
  AddSubProcessRequest,
  UpdateSubProcessRequest,
} from '@algreen/shared-types';
import { apiClient } from '../axios-instance';

export const processesApi = {
  getAll(params: { tenantId: string; isActive?: boolean; search?: string; page?: number; pageSize?: number; createdFrom?: string; createdTo?: string }) {
    return apiClient.get<PagedResult<ProcessDto>>('/processes', { params });
  },

  getById(id: string) {
    return apiClient.get<ProcessDto>(`/processes/${id}`);
  },

  create(data: CreateProcessRequest) {
    return apiClient.post<ProcessDto>('/processes', data);
  },

  update(id: string, data: UpdateProcessRequest) {
    return apiClient.put<ProcessDto>(`/processes/${id}`, data);
  },

  reorder(items: { id: string; sequenceOrder: number }[]) {
    return apiClient.post('/processes/reorder', { items });
  },

  deactivate(id: string) {
    return apiClient.delete(`/processes/${id}`);
  },

  activate(id: string) {
    return apiClient.post(`/processes/${id}/activate`);
  },

  addSubProcess(processId: string, data: AddSubProcessRequest) {
    return apiClient.post<ProcessDto>(`/processes/${processId}/sub-processes`, data);
  },

  updateSubProcess(processId: string, subProcessId: string, data: UpdateSubProcessRequest) {
    return apiClient.put<ProcessDto>(
      `/processes/${processId}/sub-processes/${subProcessId}`,
      data,
    );
  },

  deactivateSubProcess(processId: string, subProcessId: string) {
    return apiClient.delete(`/processes/${processId}/sub-processes/${subProcessId}`);
  },
};
