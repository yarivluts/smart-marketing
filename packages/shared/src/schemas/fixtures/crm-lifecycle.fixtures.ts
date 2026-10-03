import type { CrmLifecycleEvent } from '../crm-lifecycle';

export const crmLifecycleFixtures: {
  hubspotMqlToSql: CrmLifecycleEvent;
  salesforceDemoScheduled: CrmLifecycleEvent;
  salesforceDemoHeld: CrmLifecycleEvent;
  demoHeld: CrmLifecycleEvent;
  pipedriveDealWon: CrmLifecycleEvent;
  dealWon: CrmLifecycleEvent;
  crmDealLost: CrmLifecycleEvent;
} = {
  hubspotMqlToSql: {
    eventId: 'evt_crm_hs_001',
    event: 'crm_lifecycle',
    ts: '2026-09-02T09:15:00.000Z',
    customerId: 'cust_acme_corp',
    properties: {
      stage: 'sql',
      dealId: 'hs_deal_99182',
      dealName: 'Acme Corp - Growth Plan Enterprise Pilot',
      dealValueCents: 1500000,
      currency: 'USD',
      ownerEmail: 'sarah.rep@growthos.io',
      ownerName: 'Sarah Jenkins',
      companyName: 'Acme Corp',
      companyDomain: 'acmecorp.com',
      leadSource: 'inbound_search',
      sourceCrm: 'hubspot',
      customFields: {
        hubspotScore: 88,
        buyingTimeline: 'immediate',
      },
    },
  },

  salesforceDemoScheduled: {
    eventId: 'evt_crm_sf_002',
    event: 'crm_lifecycle',
    ts: '2026-09-02T11:00:00.000Z',
    customerId: 'cust_globex_inc',
    properties: {
      stage: 'demo_scheduled',
      dealId: 'sf_opp_0065g00001abc',
      dealName: 'Globex Corp - Multi-Seat Expansion',
      dealValueCents: 3600000,
      currency: 'USD',
      ownerEmail: 'david.ae@growthos.io',
      ownerName: 'David Miller',
      companyName: 'Globex Inc',
      companyDomain: 'globex.com',
      leadSource: 'paid_meta_webinar',
      sourceCrm: 'salesforce',
    },
  },

  salesforceDemoHeld: {
    eventId: 'evt_crm_sf_003',
    event: 'crm_lifecycle',
    ts: '2026-09-02T15:30:00.000Z',
    customerId: 'cust_globex_inc',
    properties: {
      stage: 'demo_held',
      dealId: 'sf_opp_0065g00001abc',
      dealName: 'Globex Corp - Multi-Seat Expansion',
      dealValueCents: 3600000,
      currency: 'USD',
      ownerEmail: 'david.ae@growthos.io',
      ownerName: 'David Miller',
      companyName: 'Globex Inc',
      companyDomain: 'globex.com',
      sourceCrm: 'salesforce',
    },
  },

  get demoHeld() {
    return this.salesforceDemoHeld;
  },

  pipedriveDealWon: {
    eventId: 'evt_crm_pd_004',
    event: 'crm_lifecycle',
    ts: '2026-09-02T16:00:00.000Z',
    customerId: 'cust_massive_dynamic',
    properties: {
      stage: 'customer',
      dealId: 'pd_deal_77819',
      dealName: 'Massive Dynamic - Annual Tier 1',
      dealValueCents: 2400000,
      currency: 'USD',
      ownerEmail: 'sarah.rep@growthos.io',
      ownerName: 'Sarah Jenkins',
      companyName: 'Massive Dynamic',
      companyDomain: 'massivedynamic.corp',
      leadSource: 'sales_outbound',
      sourceCrm: 'pipedrive',
    },
  },

  get dealWon() {
    return this.pipedriveDealWon;
  },

  crmDealLost: {
    eventId: 'evt_crm_lost_005',
    event: 'crm_lifecycle',
    ts: '2026-09-02T17:20:00.000Z',
    customerId: 'cust_stark_industries',
    properties: {
      stage: 'lost',
      dealId: 'sf_opp_0065g00009xyz',
      dealName: 'Stark Industries Marketing Pilot',
      dealValueCents: 5000000,
      currency: 'USD',
      ownerEmail: 'sarah.rep@growthos.io',
      ownerName: 'Sarah Jenkins',
      companyName: 'Stark Industries',
      companyDomain: 'starkindustries.com',
      leadSource: 'event_sponsor',
      lostReason: 'competitor_chosen',
      sourceCrm: 'salesforce',
      customFields: {
        competitorName: 'Legacy Analytics Corp',
      },
    },
  },
};
