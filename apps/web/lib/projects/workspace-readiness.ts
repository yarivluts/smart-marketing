import {
  getApplicableRequirements,
  type BusinessModel,
  type PlatformType,
  type PrimaryStack,
} from '@/lib/projects/project-profile';

export interface WorkspaceCardData {
  id: string;
  organizationId: string;
  organizationName: string;
  projectId?: string;
  projectName?: string;
  role: string;
  status: 'active' | 'invited' | 'pending';
  platformType: PlatformType;
  businessModel: BusinessModel;
  primaryStack: PrimaryStack;
  verifiedRequirements?: string[];
  setupReadiness: {
    readyCount: number;
    totalCount: number;
    percentage: number;
    isReady: boolean;
  };
}

export function computeWorkspaceReadiness(
  businessModel: BusinessModel = 'saas_subscription',
  platformType: PlatformType = 'web',
  verifiedRequirements: string[] = ['req_web_sdk', 'req_stripe_billing', 'req_ad_attribution'],
): {
  readyCount: number;
  totalCount: number;
  percentage: number;
  isReady: boolean;
} {
  const applicable = getApplicableRequirements(businessModel, platformType);
  const totalCount = applicable.length > 0 ? applicable.length : 4;
  const applicableIds = applicable.map((r) => r.id);
  const readyCount = verifiedRequirements.filter((id) => applicableIds.includes(id)).length;
  const percentage = Math.round((readyCount / totalCount) * 100);
  return {
    readyCount,
    totalCount,
    percentage,
    isReady: percentage === 100,
  };
}
