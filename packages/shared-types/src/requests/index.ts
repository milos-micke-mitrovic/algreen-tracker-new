import { ChangeRequestType, ComplexityType, OrderType, UserRole } from '../enums';

// ─── Auth ────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
  tenantCode: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// ─── Users ───────────────────────────────────────────────

export interface CreateUserRequest {
  tenantId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  processId?: string | null;
}

export interface UpdateUserRequest {
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  canIncludeWithdrawnInAnalysis: boolean;
  processId?: string | null;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ─── Shifts ──────────────────────────────────────────────

export interface CreateShiftRequest {
  tenantId: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface UpdateShiftRequest {
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

// ─── Orders ──────────────────────────────────────────────

export interface CreateOrderItemInput {
  productCategoryId: string;
  productName: string;
  quantity: number;
  notes?: string;
}

export interface CreateOrderRequest {
  tenantId: string;
  orderNumber: string;
  deliveryDate: string;
  priority: number;
  orderType: OrderType;
  notes?: string;
  customWarningDays?: number;
  customCriticalDays?: number;
  items?: CreateOrderItemInput[];
}

export interface UpdateOrderRequest {
  notes?: string;
  customWarningDays?: number;
  customCriticalDays?: number;
  addItems?: CreateOrderItemInput[];
  removeItemIds?: string[];
  complexityOverrides?: { itemId: string; processId: string; complexity: ComplexityType }[];
  addSpecialRequests?: { itemId: string; specialRequestTypeId: string }[];
  removeSpecialRequests?: { itemId: string; specialRequestId: string }[];
}

export interface AddOrderItemRequest {
  productCategoryId: string;
  productName: string;
  quantity: number;
  notes?: string;
}

export interface WithdrawOrderToProcessRequest {
  targetProcessId: string;
  reason: string;
  userId: string;
}

export interface AddSpecialRequestRequest {
  specialRequestTypeId: string;
}

export interface OverrideComplexityRequest {
  complexity: ComplexityType;
}

// ─── Block Requests ──────────────────────────────────────

export interface CreateBlockRequestRequest {
  tenantId: string;
  orderItemProcessId?: string;
  orderItemSubProcessId?: string;
  requestedByUserId: string;
  requestNote?: string;
}

export interface HandleBlockRequestRequest {
  handledByUserId: string;
  note?: string;
}

// ─── Change Requests ─────────────────────────────────────

export interface CreateChangeRequestRequest {
  tenantId: string;
  orderId: string;
  requestedByUserId: string;
  requestType: ChangeRequestType;
  description: string;
}

export interface HandleChangeRequestRequest {
  handledByUserId: string;
  responseNote?: string;
}

// ─── Work Sessions ───────────────────────────────────────

export interface CheckInRequest {
  tenantId: string;
  processId: string;
  userId: string;
}

export interface CheckOutRequest {
  userId: string;
}

// ─── Process Workflow ────────────────────────────────────

export interface StartProcessWorkRequest {
  userId: string;
}

export interface StopProcessWorkRequest {
  userId: string;
}

export interface ResumeProcessWorkRequest {
  userId: string;
}

export interface BlockProcessRequest {
  userId: string;
  reason: string;
}

export interface UnblockProcessRequest {
  userId: string;
}

export interface WithdrawProcessRequest {
  userId: string;
  reason: string;
}

// ─── Sub-Process Workflow ────────────────────────────────

export interface StartSubProcessRequest {
  userId: string;
}

export interface CompleteSubProcessRequest {
  userId: string;
}

// ─── Processes ───────────────────────────────────────────

export interface CreateProcessRequest {
  tenantId: string;
  code: string;
  name: string;
  sequenceOrder: number;
  subProcesses?: { name: string; sequenceOrder: number }[];
}

export interface UpdateProcessRequest {
  name: string;
  sequenceOrder: number;
  addSubProcesses?: { name: string; sequenceOrder: number }[];
  deactivateSubProcessIds?: string[];
}

export interface AddSubProcessRequest {
  name: string;
  sequenceOrder: number;
}

export interface UpdateSubProcessRequest {
  name: string;
  sequenceOrder: number;
}

// ─── Product Categories ──────────────────────────────────

export interface CategoryProcessInput {
  processId: string;
  sequenceOrder: number;
  defaultComplexity?: ComplexityType;
}

export interface CategoryDependencyInput {
  processId: string;
  dependsOnProcessId: string;
}

export interface CreateProductCategoryRequest {
  tenantId: string;
  name: string;
  description?: string;
  defaultWarningDays?: number;
  defaultCriticalDays?: number;
  processes?: CategoryProcessInput[];
  dependencies?: CategoryDependencyInput[];
}

export interface UpdateProductCategoryRequest {
  name: string;
  description?: string;
  defaultWarningDays?: number;
  defaultCriticalDays?: number;
  processes?: CategoryProcessInput[];
  dependencies?: CategoryDependencyInput[];
}

// Keep for backward compat with existing separate endpoints
export interface AddCategoryProcessRequest {
  processId: string;
  sequenceOrder: number;
  defaultComplexity?: ComplexityType;
}

export interface AddCategoryDependencyRequest {
  processId: string;
  dependsOnProcessId: string;
}

// ─── Special Request Types ───────────────────────────────

export interface CreateSpecialRequestTypeRequest {
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  addsProcesses?: string[];
  removesProcesses?: string[];
  onlyProcesses?: string[];
}

export interface UpdateSpecialRequestTypeRequest {
  name: string;
  description?: string;
  addsProcesses?: string[];
  removesProcesses?: string[];
  onlyProcesses?: string[];
}

// ─── Tenants ─────────────────────────────────────────────

export interface CreateTenantRequest {
  name: string;
  code: string;
  defaultWarningDays?: number;
  defaultCriticalDays?: number;
  warningColor?: string;
  criticalColor?: string;
}

export interface UpdateTenantRequest {
  name: string;
  isActive: boolean;
  defaultWarningDays?: number;
  defaultCriticalDays?: number;
  warningColor?: string;
  criticalColor?: string;
}

export interface UpdateTenantSettingsRequest {
  defaultWarningDays: number;
  defaultCriticalDays: number;
  warningColor: string;
  criticalColor: string;
}
