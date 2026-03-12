import {
  OrderStatus,
  OrderType,
  ProcessStatus,
  SubProcessStatus,
  RequestStatus,
  ChangeRequestType,
  NotificationType,
  ComplexityType,
  UserRole,
} from '../enums';

// ─── Pagination ─────────────────────────────────────────

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

// ─── Identity ────────────────────────────────────────────

export interface UserDto {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: UserRole;
  processId: string | null;
  canIncludeWithdrawnInAnalysis: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface ShiftDto {
  id: string;
  tenantId: string;
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface LoginResponseDto {
  token: string;
  refreshToken: string;
  user: UserDto;
}

// ─── Orders ──────────────────────────────────────────────

export interface OrderDto {
  id: string;
  tenantId: string;
  orderNumber: string;
  deliveryDate: string;
  priority: number;
  orderType: OrderType;
  status: OrderStatus;
  notes: string | null;
  customWarningDays: number | null;
  customCriticalDays: number | null;
  itemCount: number;
}

export interface OrderDetailDto {
  id: string;
  tenantId: string;
  orderNumber: string;
  deliveryDate: string;
  priority: number;
  orderType: OrderType;
  status: OrderStatus;
  notes: string | null;
  customWarningDays: number | null;
  customCriticalDays: number | null;
  items: OrderItemDto[];
  attachments: OrderAttachmentDto[];
}

export interface OrderItemDto {
  id: string;
  orderId: string;
  productCategoryId: string;
  productName: string;
  quantity: number;
  notes: string | null;
  processes: OrderItemProcessDto[];
  specialRequests: OrderItemSpecialRequestDto[];
  attachments: OrderAttachmentDto[];
}

export interface OrderItemProcessDto {
  id: string;
  orderItemId: string;
  processId: string;
  complexity: ComplexityType | null;
  complexityOverridden: boolean;
  status: ProcessStatus;
  startedAt: string | null;
  completedAt: string | null;
  totalDurationMinutes: number;
  isWithdrawn: boolean;
  subProcesses: OrderItemSubProcessDto[];
}

export interface OrderItemSubProcessDto {
  id: string;
  orderItemProcessId: string;
  subProcessId: string;
  status: SubProcessStatus;
  totalDurationMinutes: number;
  isWithdrawn: boolean;
}

export interface OrderItemSpecialRequestDto {
  id: string;
  specialRequestTypeId: string;
}

export interface OrderMasterViewDto {
  id: string;
  orderNumber: string;
  orderType: OrderType;
  status: OrderStatus;
  deliveryDate: string;
  priority: number;
  customWarningDays: number | null;
  customCriticalDays: number | null;
  completedProcesses: number;
  totalProcesses: number;
  /** Map of processId → aggregated ProcessStatus string */
  processStatuses: Record<string, string>;
  attachmentCount: number;
  createdAt: string;
}

// ─── Block & Change Requests ─────────────────────────────

export interface BlockRequestDto {
  id: string;
  orderItemProcessId: string | null;
  orderItemSubProcessId: string | null;
  requestedByUserId: string;
  requestNote: string | null;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string | null;
  handledByUserId: string | null;
  handledAt: string | null;
  blockReason: string | null;
  rejectionNote: string | null;
  orderId: string | null;
  orderNumber: string | null;
}

export interface ChangeRequestDto {
  id: string;
  orderId: string;
  orderNumber: string | null;
  requestedByUserId: string;
  requestType: ChangeRequestType;
  description: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string | null;
  handledByUserId: string | null;
  handledAt: string | null;
  responseNote: string | null;
}

// ─── Notifications ───────────────────────────────────────

export interface NotificationDto {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  referenceType: string | null;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
}

// ─── Work Sessions ───────────────────────────────────────

export interface WorkSessionDto {
  id: string;
  processId: string;
  userId: string;
  checkInTime: string;
  checkOutTime: string | null;
  durationMinutes: number | null;
  date: string;
  isActive: boolean;
}

// ─── Production ──────────────────────────────────────────

export interface ProcessDto {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  sequenceOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  subProcesses: SubProcessDto[];
}

export interface SubProcessDto {
  id: string;
  processId: string;
  name: string;
  sequenceOrder: number;
  isActive: boolean;
}

export interface ProductCategoryDto {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  defaultWarningDays: number | null;
  defaultCriticalDays: number | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ProductCategoryDetailDto {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  defaultWarningDays: number | null;
  defaultCriticalDays: number | null;
  createdAt: string;
  updatedAt: string | null;
  processes: ProductCategoryProcessDto[];
  dependencies: ProductCategoryDependencyDto[];
}

export interface ProductCategoryProcessDto {
  id: string;
  processId: string;
  processCode: string | null;
  processName: string | null;
  defaultComplexity: ComplexityType | null;
  sequenceOrder: number;
}

export interface ProductCategoryDependencyDto {
  id: string;
  processId: string;
  processCode: string | null;
  dependsOnProcessId: string;
  dependsOnProcessCode: string | null;
}

export interface SpecialRequestTypeDto {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  addsProcesses: string[];
  removesProcesses: string[];
  onlyProcesses: string[];
  ignoresDependencies: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
}

// ─── Dashboard ──────────────────────────────────────────

export interface DashboardStatisticsDto {
  today: {
    ordersCompleted: number;
    ordersActive: number;
    processesCompleted: number;
    averageProcessTimeMinutes: number;
  };
  warnings: {
    criticalCount: number;
    warningCount: number;
  };
  pendingBlockRequests: number;
}

export interface DeadlineWarningDto {
  orderId: string;
  orderNumber: string;
  deliveryDate: string;
  daysRemaining: number;
  level: 'Warning' | 'Critical';
  currentProcess: string | null;
}

export interface LiveViewProcessDto {
  processId: string;
  processCode: string;
  processName: string;
  queueCount: number;
  inProgressCount: number;
  activeOrders: LiveViewOrderDto[];
}

export interface LiveViewOrderDto {
  orderItemId: string;
  orderId: string;
  orderNumber: string;
  productName: string;
  status: string;
  isBlocked: boolean;
  blockReason: string | null;
}

export interface WorkerStatusDto {
  processId: string;
  isWorkerCheckedIn: boolean;
  worker: {
    id: string;
    name: string;
    checkInTime: string | null;
  } | null;
}

export interface PendingBlockRequestDto {
  id: string;
  orderNumber: string;
  processName: string;
  productName: string;
  requestNote: string | null;
  requestedBy: string;
  requestedAt: string;
}

// ─── Tenancy ─────────────────────────────────────────────

export interface TenantDto {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface TenantSettingsDto {
  id: string;
  tenantId: string;
  defaultWarningDays: number;
  defaultCriticalDays: number;
  warningColor: string;
  criticalColor: string;
}

// ─── Order Attachments ──────────────────────────────────

export interface OrderAttachmentDto {
  id: string;
  orderId: string;
  orderItemId: string | null;
  originalFileName: string;
  contentType: string;
  fileSizeBytes: number;
  uploadedAt: string;
}

// ─── Tablet ─────────────────────────────────────────────

export interface TabletQueueItemDto {
  orderItemProcessId: string;
  orderId: string;
  orderItemId: string;
  orderNumber: string;
  priority: number;
  deliveryDate: string;
  productName: string;
  productCategoryName: string | null;
  quantity: number;
  complexity: ComplexityType | null;
  status: ProcessStatus;
  specialRequestNames: string[];
  completedProcessCount: number;
  totalProcessCount: number;
}

export interface TabletActiveWorkDto {
  orderItemProcessId: string;
  orderId: string;
  orderItemId: string;
  orderNumber: string;
  priority: number;
  deliveryDate: string;
  productName: string;
  productCategoryName: string | null;
  quantity: number;
  complexity: ComplexityType | null;
  status: ProcessStatus;
  specialRequestNames: string[];
  completedProcessCount: number;
  totalProcessCount: number;
  startedAt: string | null;
  totalDurationMinutes: number;
  isTimerRunning: boolean;
  currentLogStartedAt: string | null;
  subProcesses: TabletSubProcessDto[];
}

export interface TabletSubProcessDto {
  id: string;
  subProcessId: string;
  status: SubProcessStatus;
  totalDurationMinutes: number;
  isWithdrawn: boolean;
  isTimerRunning: boolean;
}

export interface TabletIncomingDto {
  orderItemProcessId: string;
  orderId: string;
  orderItemId: string;
  orderNumber: string;
  priority: number;
  deliveryDate: string;
  productName: string;
  productCategoryName: string | null;
  quantity: number;
  complexity: ComplexityType | null;
  status: ProcessStatus;
  specialRequestNames: string[];
  completedProcessCount: number;
  totalProcessCount: number;
  blockingProcesses: BlockingProcessDto[];
}

export interface BlockingProcessDto {
  orderItemProcessId: string;
  processId: string;
  status: ProcessStatus;
}
