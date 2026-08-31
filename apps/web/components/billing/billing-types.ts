export type TransactionStatus = 'completed' | 'pending' | 'failed' | 'refunded';
export type GatewayType = 'stripe' | 'paypal' | 'wire';

export interface BillingOpsFeedEntry {
  id: string;
  type: 'charge' | 'refund' | 'dispute' | 'churn' | 'dunning';
  status: TransactionStatus;
  amount: number | null;
  currency: string | null;
  customerId?: string | null;
  customerName?: string | null;
  environmentId: string;
  environmentName?: string;
  landedAt: string;
  clientId: string;
  failureMessage?: string | null;
  refundReason?: string | null;
  gateway?: GatewayType;
}

export interface BillingPlanSummary {
  tierName: string;
  priceMonthly: number;
  currency: string;
  billingInterval: 'monthly' | 'annual';
  renewalDate: string;
  seatUsage: { current: number; max: number };
  eventUsage: { current: number; max: number };
  apiUsage: { current: number; max: number };
}

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: 'paid' | 'open' | 'void';
  invoiceDate: string;
  pdfUrl?: string;
}
