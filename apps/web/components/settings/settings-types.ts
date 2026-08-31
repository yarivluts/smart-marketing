export interface ProjectSettingsData {
  name: string;
  vertical: string;
  currency?: string;
  timezone?: string;
  sessionReplayUrlTemplate?: string;
}

export interface NotificationSettingsData {
  emailAlerts: boolean;
  slackAlerts: boolean;
  budgetOverrunAlerts: boolean;
  goalRiskAlerts: boolean;
  winRuleAlerts: boolean;
  weeklyDigest: boolean;
}
