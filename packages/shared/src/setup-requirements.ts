export type PlatformType = 'web' | 'mobile' | 'hybrid';

export type BusinessModel =
  | 'saas_subscription'
  | 'ecommerce_physical'
  | 'digital_products'
  | 'leadgen_b2b'
  | 'marketplace_hybrid';

export type ProjectTransactionType =
  | 'monthly_recurring'
  | 'annual_recurring'
  | 'one_time'
  | 'hybrid_mixed';

export type PrimaryStack =
  | 'shopify'
  | 'woocommerce'
  | 'stripe'
  | 'custom_web'
  | 'mobile_native'
  | 'hubspot_salesforce';

export interface ProjectProfile {
  platformType: PlatformType;
  businessModel: BusinessModel;
  transactionType: ProjectTransactionType;
  primaryStack: PrimaryStack;
  domainUrl?: string;
  verifiedRequirements: string[];
  customHiddenModules: string[];
}

export interface SetupRequirement {
  id: string;
  category: 'tracking' | 'monetization' | 'attribution' | 'guardrails' | 'crm';
  titleKey: string;
  descriptionKey: string;
  impactKey: string;
  isCore: boolean;
  applicableModels: BusinessModel[];
  applicablePlatforms: PlatformType[];
  samplePayload?: Record<string, unknown>;
  quickSnippet: (orgId: string, projectId: string, stack: PrimaryStack) => string;
  guideSteps: string[];
}

export const SETUP_REQUIREMENTS: SetupRequirement[] = [
  {
    id: 'req_web_sdk',
    category: 'tracking',
    titleKey: 'SetupRequirements.webSdkTitle',
    descriptionKey: 'SetupRequirements.webSdkDesc',
    impactKey: 'SetupRequirements.webSdkImpact',
    isCore: true,
    applicableModels: ['saas_subscription', 'ecommerce_physical', 'digital_products', 'leadgen_b2b', 'marketplace_hybrid'],
    applicablePlatforms: ['web', 'hybrid'],
    quickSnippet: (orgId, projectId, stack) => {
      if (stack === 'shopify') {
        return '<!-- Paste into theme.liquid inside <head> -->\n<script src="https://cdn.growthos.io/sdk/v2/sdk.min.js" data-org="' + orgId + '" data-project="' + projectId + '" async></script>';
      }
      return '// Add to your root layout or index.html\nimport { initGrowthOS } from "@growthos/tracking-sdk";\n\ninitGrowthOS({\n  organizationId: "' + orgId + '",\n  projectId: "' + projectId + '",\n  edgeTracking: true,\n});';
    },
    guideSteps: [
      'Copy the initialization script tag or npm import package.',
      'Place it into the <head> tag or root application component.',
      'Test initialization: The SDK will immediately establish a low-latency edge heartbeat (<18ms).',
    ],
  },
  {
    id: 'req_checkout_stream',
    category: 'monetization',
    titleKey: 'SetupRequirements.checkoutStreamTitle',
    descriptionKey: 'SetupRequirements.checkoutStreamDesc',
    impactKey: 'SetupRequirements.checkoutStreamImpact',
    isCore: true,
    applicableModels: ['ecommerce_physical', 'digital_products', 'marketplace_hybrid'],
    applicablePlatforms: ['web', 'mobile', 'hybrid'],
    samplePayload: {
      event: 'purchase',
      order_id: 'ord_9842',
      currency: 'USD',
      value: 129.50,
      items: [{ item_id: 'sku_101', item_name: 'Premium Headphones', price: 129.50, quantity: 1 }],
    },
    quickSnippet: (orgId, projectId, stack) => {
      if (stack === 'shopify') {
        return '// GrowthOS Shopify Webhook Receiver Endpoint:\nPOST https://ingest.growthos.io/api/v1/shopify/webhook\nX-GrowthOS-Org: ' + orgId + '\nX-GrowthOS-Project: ' + projectId;
      }
      return 'growthos.track("purchase", {\n  orderId: "ORDER_123",\n  value: 89.90,\n  currency: "USD",\n  items: [{ id: "prod_1", name: "Standard Edition", price: 89.90 }]\n});';
    },
    guideSteps: [
      'Configure order purchase events with order ID, currency, and gross cart amount.',
      'If using Shopify or WooCommerce, configure the webhook endpoint for automated fulfillment and refund sync.',
      'Enables true ROAS, repeat purchase cohorts, and inventory margin tracking.',
    ],
  },
  {
    id: 'req_stripe_billing',
    category: 'monetization',
    titleKey: 'SetupRequirements.stripeBillingTitle',
    descriptionKey: 'SetupRequirements.stripeBillingDesc',
    impactKey: 'SetupRequirements.stripeBillingImpact',
    isCore: true,
    applicableModels: ['saas_subscription'],
    applicablePlatforms: ['web', 'mobile', 'hybrid'],
    quickSnippet: (orgId, projectId) => {
      return 'Webhook URL: https://growthos.io/api/orgs/' + orgId + '/projects/' + projectId + '/plugins/stripe-webhook\nEvents to select:\n- customer.subscription.created\n- customer.subscription.updated\n- customer.subscription.deleted\n- invoice.payment_succeeded';
    },
    guideSteps: [
      'Open your Stripe Dashboard > Developers > Webhooks.',
      'Add the endpoint URL shown above and select subscription lifecycle events.',
      'Enables MRR Velocity, CAC Breakeven Cohorts, and Churn Survival analysis.',
    ],
  },
  {
    id: 'req_ad_attribution',
    category: 'attribution',
    titleKey: 'SetupRequirements.adAttributionTitle',
    descriptionKey: 'SetupRequirements.adAttributionDesc',
    impactKey: 'SetupRequirements.adAttributionImpact',
    isCore: true,
    applicableModels: ['saas_subscription', 'ecommerce_physical', 'digital_products', 'leadgen_b2b', 'marketplace_hybrid'],
    applicablePlatforms: ['web', 'mobile', 'hybrid'],
    quickSnippet: (_orgId, projectId) => {
      return '// Meta CAPI & Google Ads Conversion Proxy configured for project ' + projectId + '.\n// Connect OAuth via Integrations Hub or provide Meta Pixel ID & Access Token.';
    },
    guideSteps: [
      'Navigate to Integrations Hub and authorize Google Ads RSA or Meta CAPI.',
      'GrowthOS automatically bypasses iOS 14+ signal loss using verified first-party server dispatch.',
      'Unlocks Creative Fatigue Radar and Shapley multi-touch attribution.',
    ],
  },
  {
    id: 'req_lead_crm',
    category: 'crm',
    titleKey: 'SetupRequirements.leadCrmTitle',
    descriptionKey: 'SetupRequirements.leadCrmDesc',
    impactKey: 'SetupRequirements.leadCrmImpact',
    isCore: true,
    applicableModels: ['leadgen_b2b'],
    applicablePlatforms: ['web', 'hybrid'],
    quickSnippet: (orgId, projectId) => {
      return '// Ingest HubSpot or Salesforce webhook:\nPOST https://growthos.io/api/orgs/' + orgId + '/projects/' + projectId + '/hooks\nBody: { contactEmail: "lead@corp.com", dealStage: "Demo Booked", dealValue: 12000 }';
    },
    guideSteps: [
      'Connect lead capture forms on /pricing or /book-demo.',
      'Sync CRM deal progression stages to measure revenue attribution from initial ad click to closed-won.',
      'Enables PQL Hot Leads Radar and firmographic account grading.',
    ],
  },
  {
    id: 'req_cost_guardrails',
    category: 'guardrails',
    titleKey: 'SetupRequirements.costGuardrailsTitle',
    descriptionKey: 'SetupRequirements.costGuardrailsDesc',
    impactKey: 'SetupRequirements.costGuardrailsImpact',
    isCore: false,
    applicableModels: ['saas_subscription', 'ecommerce_physical', 'digital_products', 'leadgen_b2b', 'marketplace_hybrid'],
    applicablePlatforms: ['web', 'mobile', 'hybrid'],
    quickSnippet: (_orgId, projectId) => {
      return '// Configure automated spend cap & CPA circuit breakers\nPUT /api/projects/' + projectId + '/cost-guardrails\n{ maxDailyAdSpend: 1500, maxCpaThreshold: 85, autoPauseWearout: true }';
    },
    guideSteps: [
      'Define maximum acceptable CPA and daily burn limit.',
      'When triggered, the autonomous Kill-Switch auto-pauses fatigued adsets within seconds.',
    ],
  },
];

export function getApplicableRequirements(
  businessModel: BusinessModel,
  platformType: PlatformType,
): SetupRequirement[] {
  return SETUP_REQUIREMENTS.filter((req) => {
    const matchesModel = req.applicableModels.includes(businessModel);
    const matchesPlatform = req.applicablePlatforms.includes(platformType);
    return matchesModel && matchesPlatform;
  });
}

export function getHiddenModulesForProfile(
  businessModel?: string,
  transactionType?: string,
  customHiddenModules?: string[],
): string[] {
  const hidden = new Set<string>();

  if (
    businessModel === 'ecommerce_physical' ||
    businessModel === 'digital_products' ||
    transactionType === 'one_time'
  ) {
    hidden.add('billingOpsFeed');
    hidden.add('churnReasons');
    hidden.add('repCollections');
  }

  if (businessModel === 'leadgen_b2b') {
    hidden.add('billingOpsFeed');
    hidden.add('churnReasons');
  }

  if (customHiddenModules && Array.isArray(customHiddenModules)) {
    customHiddenModules.forEach((mod) => hidden.add(mod));
  }

  return Array.from(hidden);
}

export function parseProjectProfile(project: {
  vertical?: string;
  platform_type?: string;
  business_model?: string;
  transaction_type?: string;
  primary_stack?: string;
  verified_requirements?: string[];
  custom_hidden_modules?: string[];
}): ProjectProfile {
  let platformType: PlatformType = (project.platform_type as PlatformType) || 'web';
  let businessModel: BusinessModel = (project.business_model as BusinessModel) || 'saas_subscription';
  let transactionType: ProjectTransactionType = (project.transaction_type as ProjectTransactionType) || 'monthly_recurring';
  let primaryStack: PrimaryStack = (project.primary_stack as PrimaryStack) || 'custom_web';

  if (!project.business_model && project.vertical) {
    const v = project.vertical.toLowerCase();
    if (v.includes('ecom') || v.includes('store') || v.includes('shop') || v.includes('retail')) {
      businessModel = 'ecommerce_physical';
      transactionType = 'one_time';
      primaryStack = 'shopify';
    } else if (v.includes('lead') || v.includes('agency') || v.includes('b2b')) {
      businessModel = 'leadgen_b2b';
      transactionType = 'one_time';
      primaryStack = 'hubspot_salesforce';
    } else if (v.includes('mobile') || v.includes('app')) {
      platformType = 'mobile';
      businessModel = 'saas_subscription';
      primaryStack = 'mobile_native';
    }
  }

  return {
    platformType,
    businessModel,
    transactionType,
    primaryStack,
    verifiedRequirements: project.verified_requirements ?? [],
    customHiddenModules: project.custom_hidden_modules ?? [],
  };
}
