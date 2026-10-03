import type { AdSpendMeasureRecord } from '../ad-spend';

export const adSpendFixtures: {
  googleAdsSpend: AdSpendMeasureRecord;
  googleSearchSpend: AdSpendMeasureRecord;
  metaAdsSpend: AdSpendMeasureRecord;
  tiktokAdsSpend: AdSpendMeasureRecord;
  offlineCsvSpend: AdSpendMeasureRecord;
  linkedinAdsSpend: AdSpendMeasureRecord;
} = {
  googleAdsSpend: {
    measure: 'ad_spend',
    ts: '2026-09-02',
    value: 450.75,
    dimensions: {
      channelId: 'google_ads',
      campaignId: 'camp_goog_search_b2b_us',
      campaignName: 'US B2B Marketing Intelligence Search',
      adsetId: 'adgroup_growth_keywords',
      adsetName: 'Growth Marketing Keywords',
      adId: 'ad_rsa_growthos_v1',
      adName: 'GrowthOS - Real-time Attribution RSA',
      currency: 'USD',
      impressions: 3500,
      clicks: 120,
      conversions: 8,
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'us_b2b_search',
      utmContent: 'rsa_headline_1',
      utmTerm: 'b2b marketing attribution platform',
    },
  },

  get googleSearchSpend() {
    return this.googleAdsSpend;
  },

  metaAdsSpend: {
    measure: 'ad_spend',
    ts: '2026-09-02',
    value: 850.0,
    dimensions: {
      channelId: 'meta_ads',
      campaignId: 'camp_meta_prospecting_feed',
      campaignName: 'Meta Feed & Reels Prospecting Q3',
      adsetId: 'adset_saas_founders_us_eu',
      adsetName: 'SaaS Founders 10k-500k MRR',
      adId: 'ad_meta_video_demo_1',
      adName: 'Product Demo 30s Video',
      currency: 'USD',
      impressions: 12000,
      clicks: 340,
      conversions: 22,
      utmSource: 'meta',
      utmMedium: 'paid_social',
      utmCampaign: 'saas_founders_q3',
      utmContent: 'video_demo_30s',
    },
  },

  tiktokAdsSpend: {
    measure: 'ad_spend',
    ts: '2026-09-02',
    value: 320.5,
    dimensions: {
      channelId: 'tiktok_ads',
      campaignId: 'camp_tt_spark_ads_01',
      campaignName: 'TikTok Spark Ads Creator UGC',
      adsetId: 'adset_tt_creators_tech',
      adsetName: 'Tech & SaaS Enthusiasts',
      adId: 'ad_tt_ugc_review',
      adName: 'Creator Review - Growth Analytics',
      currency: 'USD',
      impressions: 28000,
      clicks: 510,
      conversions: 14,
      utmSource: 'tiktok',
      utmMedium: 'paid_social',
      utmCampaign: 'spark_creator_ugc',
      utmContent: 'creator_review_v2',
    },
  },

  offlineCsvSpend: {
    measure: 'ad_spend',
    ts: '2026-09-01',
    value: 5000.0,
    dimensions: {
      channelId: 'offline_csv',
      campaignId: 'camp_offline_tech_conf_q3',
      campaignName: 'SaaStr Annual 2026 Sponsorship & Billboard',
      currency: 'USD',
      impressions: 15000,
      clicks: 0,
      utmSource: 'event',
      utmMedium: 'offline',
      utmCampaign: 'saastr_2026_annual',
      metadata: {
        vendor: 'SaaStr Corp',
        invoiceNumber: 'INV-SAAS-2026-09',
      },
    },
  },

  linkedinAdsSpend: {
    measure: 'ad_spend',
    ts: '2026-09-02',
    value: 1200.0,
    dimensions: {
      channelId: 'linkedin_ads',
      campaignId: 'camp_li_cmo_sponsored_content',
      campaignName: 'CMO & VP Marketing Decision Makers',
      adsetId: 'adset_li_execs_saas',
      adsetName: 'US SaaS Executives 50-500 FTE',
      adId: 'ad_li_carousel_case_study',
      adName: 'Acme Corp 400% ROI Case Study',
      currency: 'USD',
      impressions: 4800,
      clicks: 95,
      conversions: 6,
      utmSource: 'linkedin',
      utmMedium: 'paid_social',
      utmCampaign: 'li_execs_cmo_case_study',
    },
  },
};
