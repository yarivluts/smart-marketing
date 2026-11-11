import enMessages from '../../messages/en.json';
import heMessages from '../../messages/he.json';
import type { RecommendationTranslator } from './recommendation-synthesizer';

type Messages = Record<string, string>;

/** A stand-in for next-intl's `t` for the `ProactiveRecommendations` namespace: fills `{name}` placeholders from a message file. */
export function translatorFor(messages: Messages): RecommendationTranslator {
  return (key, values = {}) => {
    const template = messages[key];
    if (template === undefined) {
      throw new Error(`Missing ProactiveRecommendations message: ${key}`);
    }
    return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''));
  };
}

export const enMessagesFor = enMessages.ProactiveRecommendations as Messages;
export const heMessagesFor = (heMessages as { ProactiveRecommendations: Messages }).ProactiveRecommendations;
export const t = translatorFor(enMessagesFor);
