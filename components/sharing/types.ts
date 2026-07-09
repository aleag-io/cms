export type SharingRequest = {
  id: string;
  parishId: string;
  dioceseId: string;
  dataCategory: string;
  reason: string;
  status: string;
  requestedByUserId: string;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  expiresAt: string;
  createdAt: string;
};

export type SharingGrant = {
  id: string;
  parishId: string;
  dioceseId: string;
  dataCategory: string;
  granteeType: string;
  granteeId: string;
  scope: string;
  grantedByUserId: string;
  requestId: string | null;
  grantedAt: string;
  expiresAt: string | null;
  isActive: boolean;
  revokedAt: string | null;
  notes: string | null;
};

export type EmergencyGrant = {
  id: string;
  parishId: string;
  dioceseId: string;
  grantedByUserId: string;
  justification: string;
  grantedAt: string;
  expiresAt: string;
  isActive: boolean;
  revokedAt: string | null;
};

export type ContextualShare = {
  id: string;
  parishId: string;
  resourceType: string;
  resourceId: string | null;
  shareMode: string;
  createdByUserId: string;
  recipientUserId: string | null;
  recipientRole: string | null;
  isAnonymized: boolean;
  expiresAt: string | null;
  maxViews: number | null;
  viewCount: number;
  isActive: boolean;
  revokedAt: string | null;
  createdAt: string;
};

export type ParishOption = {
  id: string;
  name: string;
  isActive?: boolean;
};
