export type DeviceCategory = 'laptop' | 'monitor' | 'phone' | 'security_key' | 'peripheral';

export type DeviceStatus = 'assigned' | 'in_stock' | 'in_repair' | 'pending_return' | 'retired';

export type DeviceLocation =
  | 'Dubai HQ'
  | 'Singapore Hub'
  | 'London Hub'
  | 'Berlin'
  | 'New York'
  | 'Remote';

export type CompliancePosture = 'compliant' | 'patch_required' | 'non_compliant';

export type CustodyActionType =
  | 'assigned'
  | 'unassigned'
  | 'reassigned'
  | 'repair'
  | 'mdm_action'
  | 'tag_updated';

export interface CustodyLogEntry {
  id: string;
  at: number;
  action: CustodyActionType;
  userId?: string;
  actorId: string;
  note: string;
}

export interface DeviceSpecs {
  cpu?: string;
  ram?: string;
  storage?: string;
  osVersion?: string;
  batteryHealthPct?: number;
  cycleCount?: number;
}

export interface HardwareDevice {
  id: string;
  assetTag: string;
  serialNumber: string;
  name: string;
  model: string;
  category: DeviceCategory;
  specs: DeviceSpecs;
  status: DeviceStatus;
  assignedToUserId?: string;
  assignedAt?: string;
  location: DeviceLocation;
  tags: string[];
  compliance: CompliancePosture;
  encrypted: boolean;
  edrActive: boolean;
  firewallOn: boolean;
  mdmEnrolled: boolean;
  lastCheckInAt: number;
  recoveryKeyEscrowed: string;
  purchaseDate: string;
  warrantyUntil: string;
  costUsd: number;
  custodyLog: CustodyLogEntry[];
}

export type TicketCategory =
  | 'hardware'
  | 'access_sso'
  | 'software'
  | 'network_vpn'
  | 'security'
  | 'onboarding_kit';

export type TicketPriority = 'p1' | 'p2' | 'p3' | 'p4';

export type TicketSlaStatus = 'on_track' | 'at_risk' | 'breached' | 'met';

export type TicketStatus =
  | 'open'
  | 'triaged'
  | 'in_progress'
  | 'waiting_on_user'
  | 'resolved'
  | 'closed';

export interface TicketComment {
  id: string;
  authorId: string;
  body: string;
  internal?: boolean;
  createdAt: number;
}

export interface HelpdeskTicket {
  id: string;
  number: string;
  requesterId: string;
  assigneeId?: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  slaTargetHours: 1 | 4 | 8 | 24;
  slaStatus: TicketSlaStatus;
  status: TicketStatus;
  deviceId?: string;
  requestedCatalogItemId?: string;
  includeTelemetry: boolean;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  comments: TicketComment[];
  csatRating?: number;
}

export type CatalogItemCategory =
  | 'laptop'
  | 'monitor'
  | 'peripheral'
  | 'security_key'
  | 'ergonomics'
  | 'software_license'
  | 'network_access';

export interface CatalogItem {
  id: string;
  name: string;
  vendor: string;
  category: CatalogItemCategory;
  summary: string;
  specsOrTier: string;
  costUsd: number;
  billingModel: 'one_time' | 'monthly_seat' | 'annual_seat';
  requiresManagerApproval: boolean;
  inStockCount: number;
  deliverySla: string;
  recommendedTags: string[];
  popular?: boolean;
}

export type SelfServiceFixId =
  | 'passkey_reset'
  | 'vpn_wireguard'
  | 'mdm_cert_renew'
  | 'dns_flush'
  | 'docker_socket'
  | 'sso_token_refresh';

export interface SelfServiceRun {
  id: string;
  fixId: SelfServiceFixId;
  userId: string;
  deviceId?: string;
  ranAt: number;
  status: 'passed' | 'remediated' | 'escalated';
  summary: string;
  stepsCompleted: string[];
}

export type MdmRemoteCommand =
  | 'sync_telemetry'
  | 'push_os_patch'
  | 'rotate_filevault_key'
  | 'toggle_repair_status';

export interface NewTicketInput {
  requesterId?: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  deviceId?: string;
  requestedCatalogItemId?: string;
  includeTelemetry?: boolean;
}

export interface NewDeviceInput {
  assetTag?: string;
  serialNumber: string;
  name: string;
  model: string;
  category: DeviceCategory;
  specs?: DeviceSpecs;
  location: DeviceLocation;
  costUsd: number;
  purchaseDate?: string;
  warrantyUntil?: string;
  assignedToUserId?: string;
  tags?: string[];
}

export interface PresetTagMeta {
  tag: string;
  label: string;
  color: string;
  description: string;
}
