import type { UserDto, PagedResult } from '@algreen/shared-types';
import type { CreateUserRequest, UpdateUserRequest, ChangePasswordRequest } from '@algreen/shared-types';
import { apiClient } from '../axios-instance';

export const usersApi = {
  getAll(params: { tenantId: string; role?: string; isActive?: boolean; search?: string; page?: number; pageSize?: number; createdFrom?: string; createdTo?: string }) {
    return apiClient.get<PagedResult<UserDto>>('/users', { params });
  },

  getById(id: string) {
    return apiClient.get<UserDto>(`/users/${id}`);
  },

  create(data: CreateUserRequest) {
    return apiClient.post<UserDto>('/users', data);
  },

  update(id: string, data: UpdateUserRequest) {
    return apiClient.put<UserDto>(`/users/${id}`, data);
  },

  changePassword(id: string, data: ChangePasswordRequest) {
    return apiClient.post(`/users/${id}/change-password`, data);
  },
};
