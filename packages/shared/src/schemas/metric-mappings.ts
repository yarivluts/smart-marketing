import type { CanonicalEventType } from './types';

export type GrowthOsMetricKey =
  | 'ROI'
  | 'BREAKEVEN'
  | 'TROI'
  | 'LTV'
  | 'MRR'
  | 'ARR'
  | 'MRR_WATERFALL'
  | 'CHURN'
  | 'CAC'
  | 'CAS'
  | 'DAU_MAU'
  | 'ACCOUNT_SURVIVAL'
  | 'CONVERSION_FUNNEL'
  | 'PAYING_ACCOUNTS_GROWTH'
  | 'DEMOS_PIPELINE';

export type MetricCategory =
  | 'revenue_mrr'
  | 'economics_unit_costs'
  | 'attribution_roi'
  | 'cohorts_retention'
  | 'product_telemetry'
  | 'sales_crm';

export interface FieldRequirement {
  eventType: CanonicalEventType;
  fields: string[];
}

export interface RecommendedQuickAction {
  type: 'oauth' | 'sdk_snippet' | 'webhook_copy' | 'api_key' | 'csv_upload';
  connectorId: string;
  label: string;
  oauthProvider?: 'stripe' | 'google_ads' | 'meta_ads' | 'hubspot' | 'salesforce';
}

export interface MetricIngestionRequirement {
  metricKey: GrowthOsMetricKey;
  name: string;
  category: MetricCategory;
  description: string;
  requiredEventTypes: CanonicalEventType[];
  requiredFields: FieldRequirement[];
  supportedConnectors: string[];
  missingImpactDescription: string;
  recommendedQuickAction: RecommendedQuickAction;
}

export const METRIC_INGESTION_MAPPINGS: Record<GrowthOsMetricKey, MetricIngestionRequirement> = {
  ROI: {
    metricKey: 'ROI',
    name: 'Return On Investment (ROI)',
    category: 'attribution_roi',
    description: 'Compares total advertising capital invested against real attributed customer revenue.',
    requiredEventTypes: ['ad_spend', 'customer_transaction'],
    requiredFields: [
      {
        eventType: 'ad_spend',
        fields: ['ts', 'value', 'dimensions.channelId', 'dimensions.campaignId', 'dimensions.currency'],
      },
      {
        eventType: 'customer_transaction',
        fields: ['ts', 'amountCents', 'status', 'currency', 'customerId'],
      },
    ],
    supportedConnectors: ['google_ads', 'meta_ads', 'tiktok_ads', 'stripe', 'chargebee', 'offline_csv'],
    missingImpactDescription:
      'Cannot calculate ROI without active ad spend feeds and customer transaction revenue streams.',
    recommendedQuickAction: {
      type: 'oauth',
      connectorId: 'stripe',
      label: 'Connect Stripe Billing',
      oauthProvider: 'stripe',
    },
  },

  BREAKEVEN: {
    metricKey: 'BREAKEVEN',
    name: 'Acquisition Cohort Breakeven & Payback Velocity',
    category: 'cohorts_retention',
    description:
      'Calculates cumulative revenue collected over 12/24 months per acquisition cohort versus initial acquisition cost to pinpoint payback month.',
    requiredEventTypes: ['ad_spend', 'customer_transaction', 'product_telemetry'],
    requiredFields: [
      {
        eventType: 'ad_spend',
        fields: ['ts', 'value', 'dimensions.channelId', 'dimensions.campaignId'],
      },
      {
        eventType: 'customer_transaction',
        fields: ['ts', 'amountCents', 'status', 'customerId'],
      },
      {
        eventType: 'product_telemetry',
        fields: ['ts', 'anonId', 'customerId', 'properties.utmCampaign'],
      },
    ],
    supportedConnectors: ['google_ads', 'meta_ads', 'stripe', 'growthos_sdk'],
    missingImpactDescription:
      'Cohort Breakeven and Payback curves require linked attribution touchpoints, ad spend, and transaction histories.',
    recommendedQuickAction: {
      type: 'sdk_snippet',
      connectorId: 'growthos_sdk',
      label: 'Install Web Tracking SDK',
    },
  },

  TROI: {
    metricKey: 'TROI',
    name: 'True Return On Investment (TROI)',
    category: 'attribution_roi',
    description:
      'Multi-touch deterministic attribution linking visitor click IDs (gclid, fbclid, ttclid) directly to paying subscription lifetime value.',
    requiredEventTypes: ['product_telemetry', 'ad_spend', 'customer_transaction'],
    requiredFields: [
      {
        eventType: 'product_telemetry',
        fields: ['ts', 'anonId', 'customerId', 'properties.clickId', 'properties.utmSource', 'properties.utmCampaign'],
      },
      {
        eventType: 'ad_spend',
        fields: ['ts', 'value', 'dimensions.channelId', 'dimensions.campaignId'],
      },
      {
        eventType: 'customer_transaction',
        fields: ['ts', 'amountCents', 'status', 'customerId'],
      },
    ],
    supportedConnectors: ['growthos_sdk', 'google_ads', 'meta_ads', 'tiktok_ads', 'stripe'],
    missingImpactDescription:
      'TROI requires first-party tracking SDK touchpoints with click IDs matched against ad spend and payment transactions.',
    recommendedQuickAction: {
      type: 'sdk_snippet',
      connectorId: 'growthos_sdk',
      label: 'Embed GrowthOS Tracking Snippet',
    },
  },

  LTV: {
    metricKey: 'LTV',
    name: 'Customer Lifetime Value (LTV)',
    category: 'cohorts_retention',
    description:
      'Projects and calculates realized cumulative net revenue per paying account over 12, 24, and 36 month horizons.',
    requiredEventTypes: ['customer_transaction', 'subscription_state_change'],
    requiredFields: [
      {
        eventType: 'customer_transaction',
        fields: ['ts', 'amountCents', 'status', 'customerId'],
      },
      {
        eventType: 'subscription_state_change',
        fields: ['ts', 'properties.currentStatus', 'properties.changeType', 'properties.mrrDeltaCents', 'customerId'],
      },
    ],
    supportedConnectors: ['stripe', 'chargebee', 'paddle', 'recurly'],
    missingImpactDescription:
      'LTV curves cannot be computed without complete recurring transaction histories and subscription lifecycle state changes.',
    recommendedQuickAction: {
      type: 'oauth',
      connectorId: 'stripe',
      label: 'Connect Stripe Billing',
      oauthProvider: 'stripe',
    },
  },

  MRR: {
    metricKey: 'MRR',
    name: 'Monthly Recurring Revenue (MRR)',
    category: 'revenue_mrr',
    description: 'Measures active normalized monthly recurring revenue across all customer subscriptions.',
    requiredEventTypes: ['subscription_state_change'],
    requiredFields: [
      {
        eventType: 'subscription_state_change',
        fields: ['ts', 'customerId', 'properties.subscriptionId', 'properties.currentMrrCents', 'properties.currentStatus', 'properties.planInterval'],
      },
    ],
    supportedConnectors: ['stripe', 'chargebee', 'paddle', 'recurly'],
    missingImpactDescription:
      'MRR calculations require real-time subscription lifecycle webhooks (subscription created, updated, canceled).',
    recommendedQuickAction: {
      type: 'webhook_copy',
      connectorId: 'stripe',
      label: 'Configure Stripe Webhook',
    },
  },

  ARR: {
    metricKey: 'ARR',
    name: 'Annual Recurring Revenue (ARR)',
    category: 'revenue_mrr',
    description: 'Annualized recurring revenue run rate calculated as MRR * 12.',
    requiredEventTypes: ['subscription_state_change'],
    requiredFields: [
      {
        eventType: 'subscription_state_change',
        fields: ['ts', 'customerId', 'properties.currentMrrCents', 'properties.currentStatus'],
      },
    ],
    supportedConnectors: ['stripe', 'chargebee', 'paddle', 'recurly'],
    missingImpactDescription:
      'ARR run-rate requires active subscription status feeds from your billing platform.',
    recommendedQuickAction: {
      type: 'oauth',
      connectorId: 'stripe',
      label: 'Connect Stripe Billing',
      oauthProvider: 'stripe',
    },
  },

  MRR_WATERFALL: {
    metricKey: 'MRR_WATERFALL',
    name: 'MRR Growth Behavior & Waterfall',
    category: 'revenue_mrr',
    description:
      'Decomposes monthly MRR change into New MRR, Expansion MRR, Contraction MRR, Reactivation MRR, and Churned MRR.',
    requiredEventTypes: ['subscription_state_change'],
    requiredFields: [
      {
        eventType: 'subscription_state_change',
        fields: ['ts', 'customerId', 'properties.changeType', 'properties.mrrDeltaCents', 'properties.previousStatus', 'properties.currentStatus'],
      },
    ],
    supportedConnectors: ['stripe', 'chargebee', 'paddle', 'recurly'],
    missingImpactDescription:
      'MRR Waterfall decomposition requires subscription transition events including plan upgrades, downgrades, and cancellations.',
    recommendedQuickAction: {
      type: 'webhook_copy',
      connectorId: 'stripe',
      label: 'Set up Stripe Webhooks',
    },
  },

  CHURN: {
    metricKey: 'CHURN',
    name: 'Gross & Net MRR Churn Rate',
    category: 'revenue_mrr',
    description:
      'Tracks monthly gross MRR lost to cancellations and contraction, offset by expansion to determine net revenue retention.',
    requiredEventTypes: ['subscription_state_change'],
    requiredFields: [
      {
        eventType: 'subscription_state_change',
        fields: ['ts', 'customerId', 'properties.changeType', 'properties.mrrDeltaCents', 'properties.cancellationReasonCode'],
      },
    ],
    supportedConnectors: ['stripe', 'chargebee', 'paddle', 'recurly'],
    missingImpactDescription:
      'Gross and Net Churn metrics require subscription cancellation and downgrade event feeds.',
    recommendedQuickAction: {
      type: 'webhook_copy',
      connectorId: 'stripe',
      label: 'Connect Billing Webhook',
    },
  },

  CAC: {
    metricKey: 'CAC',
    name: 'Customer Acquisition Cost (CAC)',
    category: 'economics_unit_costs',
    description: 'Total synchronized advertising spend divided by new paying customer conversions.',
    requiredEventTypes: ['ad_spend', 'customer_transaction'],
    requiredFields: [
      {
        eventType: 'ad_spend',
        fields: ['ts', 'value', 'dimensions.channelId', 'dimensions.campaignId'],
      },
      {
        eventType: 'customer_transaction',
        fields: ['ts', 'properties.transactionType', 'properties.status', 'customerId'],
      },
    ],
    supportedConnectors: ['google_ads', 'meta_ads', 'tiktok_ads', 'linkedin_ads', 'stripe'],
    missingImpactDescription:
      'CAC calculation requires active ad network connectors to fetch spend and billing events to detect new paying conversions.',
    recommendedQuickAction: {
      type: 'oauth',
      connectorId: 'google_ads',
      label: 'Connect Google Ads',
      oauthProvider: 'google_ads',
    },
  },

  CAS: {
    metricKey: 'CAS',
    name: 'Cost Per Account / Signup (CAS)',
    category: 'economics_unit_costs',
    description: 'Total advertising expenditure divided by total first-party account registrations.',
    requiredEventTypes: ['ad_spend', 'product_telemetry'],
    requiredFields: [
      {
        eventType: 'ad_spend',
        fields: ['ts', 'value', 'dimensions.channelId'],
      },
      {
        eventType: 'product_telemetry',
        fields: ['ts', 'event', 'anonId', 'customerId'],
      },
    ],
    supportedConnectors: ['google_ads', 'meta_ads', 'growthos_sdk'],
    missingImpactDescription:
      'CAS requires ad spend feeds matched to telemetry signup events from the tracking SDK.',
    recommendedQuickAction: {
      type: 'sdk_snippet',
      connectorId: 'growthos_sdk',
      label: 'Install Tracking SDK',
    },
  },

  DAU_MAU: {
    metricKey: 'DAU_MAU',
    name: 'DAU / MAU Stickiness Ratio',
    category: 'product_telemetry',
    description:
      'Measures product engagement and habitual stickiness by dividing Daily Active Users by Monthly Active Users.',
    requiredEventTypes: ['product_telemetry'],
    requiredFields: [
      {
        eventType: 'product_telemetry',
        fields: ['ts', 'anonId', 'customerId', 'properties.sessionId', 'properties.platform'],
      },
    ],
    supportedConnectors: ['growthos_sdk'],
    missingImpactDescription:
      'DAU/MAU engagement analytics require client SDK session and user ping telemetry.',
    recommendedQuickAction: {
      type: 'sdk_snippet',
      connectorId: 'growthos_sdk',
      label: 'Install GrowthOS Web SDK',
    },
  },

  ACCOUNT_SURVIVAL: {
    metricKey: 'ACCOUNT_SURVIVAL',
    name: 'Account Survival & Retention Cohort Matrix',
    category: 'cohorts_retention',
    description:
      'Tracks the percentage of accounts remaining active month-over-month following their initial signup date.',
    requiredEventTypes: ['product_telemetry', 'subscription_state_change'],
    requiredFields: [
      {
        eventType: 'product_telemetry',
        fields: ['ts', 'anonId', 'customerId'],
      },
      {
        eventType: 'subscription_state_change',
        fields: ['ts', 'customerId', 'properties.currentStatus'],
      },
    ],
    supportedConnectors: ['growthos_sdk', 'stripe', 'chargebee'],
    missingImpactDescription:
      'Survival cohort matrices require both product telemetry activity and subscription status records.',
    recommendedQuickAction: {
      type: 'sdk_snippet',
      connectorId: 'growthos_sdk',
      label: 'Install Tracking SDK',
    },
  },

  CONVERSION_FUNNEL: {
    metricKey: 'CONVERSION_FUNNEL',
    name: 'Multi-Step Conversion Funnel Velocity',
    category: 'product_telemetry',
    description:
      'Tracks visitor progression through Landing -> Signup -> Activation -> Paid Conversion milestones.',
    requiredEventTypes: ['product_telemetry', 'customer_transaction'],
    requiredFields: [
      {
        eventType: 'product_telemetry',
        fields: ['ts', 'event', 'anonId', 'customerId', 'properties.path'],
      },
      {
        eventType: 'customer_transaction',
        fields: ['ts', 'customerId', 'properties.transactionType', 'properties.status'],
      },
    ],
    supportedConnectors: ['growthos_sdk', 'stripe'],
    missingImpactDescription:
      'Funnel progression analysis requires tracking SDK page/event telemetry and billing transaction events.',
    recommendedQuickAction: {
      type: 'sdk_snippet',
      connectorId: 'growthos_sdk',
      label: 'Install GrowthOS SDK',
    },
  },

  PAYING_ACCOUNTS_GROWTH: {
    metricKey: 'PAYING_ACCOUNTS_GROWTH',
    name: 'Paying Accounts Growth & Velocity',
    category: 'revenue_mrr',
    description:
      'Net growth in paying customer count, calculating new paying additions minus logo cancellations.',
    requiredEventTypes: ['subscription_state_change', 'crm_lifecycle'],
    requiredFields: [
      {
        eventType: 'subscription_state_change',
        fields: ['ts', 'customerId', 'properties.changeType', 'properties.currentStatus'],
      },
      {
        eventType: 'crm_lifecycle',
        fields: ['ts', 'customerId', 'properties.stage'],
      },
    ],
    supportedConnectors: ['stripe', 'chargebee', 'hubspot', 'salesforce'],
    missingImpactDescription:
      'Paying account trajectory requires subscription lifecycle feeds paired with CRM deal stage transitions.',
    recommendedQuickAction: {
      type: 'oauth',
      connectorId: 'stripe',
      label: 'Connect Stripe Billing',
      oauthProvider: 'stripe',
    },
  },

  DEMOS_PIPELINE: {
    metricKey: 'DEMOS_PIPELINE',
    name: 'Sales Demos Scheduled & Pipeline Velocity',
    category: 'sales_crm',
    description:
      'Tracks demos booked, conducted, and converted to paying customers, calculating sales-assist conversion velocity.',
    requiredEventTypes: ['crm_lifecycle', 'customer_transaction'],
    requiredFields: [
      {
        eventType: 'crm_lifecycle',
        fields: ['ts', 'customerId', 'properties.stage', 'properties.dealValueCents'],
      },
      {
        eventType: 'customer_transaction',
        fields: ['ts', 'customerId', 'properties.amountCents', 'properties.status'],
      },
    ],
    supportedConnectors: ['hubspot', 'salesforce', 'pipedrive', 'stripe'],
    missingImpactDescription:
      'Demos pipeline analytics require CRM lifecycle events (HubSpot / Salesforce / Pipedrive) and billing transactions.',
    recommendedQuickAction: {
      type: 'oauth',
      connectorId: 'hubspot',
      label: 'Connect HubSpot CRM',
      oauthProvider: 'hubspot',
    },
  },
};

/**
 * Returns the ingestion requirement definition for a specific GrowthOS metric.
 */
export function getMetricIngestionRequirement(
  metricKey: GrowthOsMetricKey
): MetricIngestionRequirement | undefined {
  return METRIC_INGESTION_MAPPINGS[metricKey];
}

/**
 * Returns the list of canonical raw stream prerequisites for a given metric.
 */
export function getPrerequisitesForMetric(metricKey: GrowthOsMetricKey): CanonicalEventType[] {
  const mapping = METRIC_INGESTION_MAPPINGS[metricKey];
  return mapping ? mapping.requiredEventTypes : [];
}

/**
 * Given a list of missing canonical event streams, returns all metrics whose calculation is blocked or degraded.
 */
export function getMetricsImpactedByMissingStreams(
  missingStreamKeys: CanonicalEventType[]
): MetricIngestionRequirement[] {
  const missingSet = new Set(missingStreamKeys);
  return Object.values(METRIC_INGESTION_MAPPINGS).filter((metric) =>
    metric.requiredEventTypes.some((stream) => missingSet.has(stream))
  );
}

/**
 * Returns all metric requirements associated with a specific connector ID.
 */
export function getMetricsForConnector(connectorId: string): MetricIngestionRequirement[] {
  return Object.values(METRIC_INGESTION_MAPPINGS).filter((metric) =>
    metric.supportedConnectors.includes(connectorId)
  );
}

/**
 * Returns the full array of all metric ingestion requirements.
 */
export function getAllMetricMappings(): MetricIngestionRequirement[] {
  return Object.values(METRIC_INGESTION_MAPPINGS);
}
