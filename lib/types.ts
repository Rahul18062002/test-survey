export type QuestionType = 'short-text' | 'long-text' | 'multiple-choice' | 'rating';

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  required: boolean;
  options: string[];
}

export type SurveyStatus = 'active' | 'draft';

export interface Survey {
  id: string;
  name: string;
  description: string;
  status: SurveyStatus;
  questions: Question[];
  createdAt: string;
}

export interface SurveyResponse {
  id: string;
  surveyId: string;
  surveyName: string;
  respondent: string;
  submittedAt: string;
  rating: number | null;
  answers: Record<string, string>;
}

export type AutomationStatus = 'active' | 'paused' | 'demo';

export interface Automation {
  id: string;
  name: string;
  trigger: string;
  triggerDescription: string;
  actionApp: string;
  actionDescription: string;
  status: AutomationStatus;
  createdAt: string;
}

export interface SurveyResponseEvent {
  event: 'survey.response.created';
  surveyId: string;
  surveyName: string;
  responseId: string;
  respondent?: string;
  submittedAt: string;
  answers: Record<string, string>;
}
