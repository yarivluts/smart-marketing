import type { CampaignSpendStatus } from '@growthos/firebase-orm-models';

/** Translation key for a campaign spend row's red/green/gray status — the AC's own "driving red/green in campaign tables". */
export function campaignSpendStatusLabelKey(status: CampaignSpendStatus): string {
  switch (status) {
    case 'over_target':
      return 'statusOverTarget';
    case 'on_target':
      return 'statusOnTarget';
    case 'no_target':
      return 'statusNoTarget';
    case 'no_spend_data':
      return 'statusNoSpendData';
    default: {
      const exhaustive: never = status;
      throw new Error(`Unknown campaign spend status "${exhaustive as string}".`);
    }
  }
}
