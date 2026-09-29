'use client';

import React, { createContext, useContext, useCallback } from 'react';
import type { Survey, SurveyResponse, Automation } from './types';
import { demoSurveys, demoResponses, demoAutomations } from './mock-data';
import { emitSurveyResponseEvent } from './automationEvents';

interface StoreState {
  surveys: Survey[];
  responses: SurveyResponse[];
  automations: Automation[];
}

interface StoreContextValue extends StoreState {
  addSurvey: (survey: Survey) => void;
  updateSurvey: (id: string, updates: Partial<Survey>) => void;
  deleteSurvey: (id: string) => void;
  getSurvey: (id: string) => Survey | undefined;
  addResponse: (response: SurveyResponse) => void;
  addAutomation: (automation: Automation) => void;
  updateAutomation: (id: string, updates: Partial<Automation>) => void;
  deleteAutomation: (id: string) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [surveys, setSurveys] = React.useState<Survey[]>(demoSurveys);
  const [responses, setResponses] = React.useState<SurveyResponse[]>(demoResponses);
  const [automations, setAutomations] = React.useState<Automation[]>(demoAutomations);

  const addSurvey = useCallback((survey: Survey) => {
    setSurveys((prev) => [survey, ...prev]);
  }, []);

  const updateSurvey = useCallback((id: string, updates: Partial<Survey>) => {
    setSurveys((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }, []);

  const deleteSurvey = useCallback((id: string) => {
    setSurveys((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const getSurvey = useCallback(
    (id: string) => surveys.find((s) => s.id === id),
    [surveys]
  );

  const addResponse = useCallback((response: SurveyResponse) => {
    setResponses((prev) => [response, ...prev]);
    emitSurveyResponseEvent({
      event: 'survey.response.created',
      surveyId: response.surveyId,
      surveyName: response.surveyName,
      responseId: response.id,
      respondent: response.respondent,
      submittedAt: response.submittedAt,
      answers: response.answers,
    });
  }, []);

  const addAutomation = useCallback((automation: Automation) => {
    setAutomations((prev) => [automation, ...prev]);
  }, []);

  const updateAutomation = useCallback((id: string, updates: Partial<Automation>) => {
    setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  }, []);

  const deleteAutomation = useCallback((id: string) => {
    setAutomations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const value: StoreContextValue = {
    surveys,
    responses,
    automations,
    addSurvey,
    updateSurvey,
    deleteSurvey,
    getSurvey,
    addResponse,
    addAutomation,
    updateAutomation,
    deleteAutomation,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
