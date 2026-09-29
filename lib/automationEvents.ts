import type { SurveyResponseEvent } from './types';

type EventHandler = (event: SurveyResponseEvent) => void;

const handlers: EventHandler[] = [];

export function onSurveyResponseEvent(handler: EventHandler): () => void {
  handlers.push(handler);
  return () => {
    const idx = handlers.indexOf(handler);
    if (idx > -1) handlers.splice(idx, 1);
  };
}

export function emitSurveyResponseEvent(event: SurveyResponseEvent): void {
  handlers.forEach((h) => {
    try {
      h(event);
    } catch (err) {
      console.error('[automationEvents] handler error:', err);
    }
  });
}
