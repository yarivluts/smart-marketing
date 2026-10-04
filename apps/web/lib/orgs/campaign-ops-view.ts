import type { CampaignSpendStatus, CreativeFatigueLevel, CreativeSwapAction } from '@growthos/firebase-orm-models';
import type { PpAccent } from '@/components/pastel/primitives';

/** Translation key for a campaign spend row's red/green/gray status — the AC's own "driving red/green in campaign tables". */
export function campaignSpendStatusLabelKey(status: CampaignSpendStatus): string {
  switch (status) {
    case 'over_target':
      return 'statusOverTarget';
    case 'on_target':
      return 'statusOnTarget';
    case 'no_target':
      return 'statusNoTarget';
    default: {
      const exhaustive: never = status;
      throw new Error(`Unknown campaign spend status "${exhaustive as string}".`);
    }
  }
}

/** Translation key for creative wear-out level (KAN-305). */
export function creativeFatigueLevelLabelKey(level: CreativeFatigueLevel): string {
  switch (level) {
    case 'fresh':
      return 'fatigueFresh';
    case 'wearing_out':
      return 'fatigueWearingOut';
    case 'fatigued':
      return 'fatigueFatigued';
    default: {
      const exhaustive: never = level;
      throw new Error(`Unknown creative fatigue level "${exhaustive as string}".`);
    }
  }
}

/** Translation key for creative swap recommendation action (KAN-305). */
export function creativeSwapActionLabelKey(action: CreativeSwapAction): string {
  switch (action) {
    case 'scale':
      return 'actionScale';
    case 'review':
      return 'actionReview';
    case 'auto_swap':
      return 'actionAutoSwap';
    default: {
      const exhaustive: never = action;
      throw new Error(`Unknown creative swap action "${exhaustive as string}".`);
    }
  }
}

/** Pastel badge accent for creative fatigue wear-out pill (KAN-305). */
export function creativeFatiguePillAccent(level: CreativeFatigueLevel): PpAccent {
  switch (level) {
    case 'fresh':
      return 'mint';
    case 'wearing_out':
      return 'amber';
    case 'fatigued':
      return 'error';
    default: {
      const exhaustive: never = level;
      throw new Error(`Unknown creative fatigue level "${exhaustive as string}".`);
    }
  }
}

/** Pastel badge accent for recommended swap action button/pill (KAN-305). */
export function creativeSwapActionPillAccent(action: CreativeSwapAction): PpAccent {
  switch (action) {
    case 'scale':
      return 'sky';
    case 'review':
      return 'amber';
    case 'auto_swap':
      return 'error';
    default: {
      const exhaustive: never = action;
      throw new Error(`Unknown creative swap action "${exhaustive as string}".`);
    }
  }
}

