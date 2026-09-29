import type { Survey, SurveyResponse, Automation, Question } from './types';

function makeQuestion(
  id: string,
  type: Question['type'],
  text: string,
  required: boolean,
  options: string[] = []
): Question {
  return { id, type, text, required, options };
}

export const demoSurveys: Survey[] = [
  {
    id: 'srv-1',
    name: 'Customer Satisfaction Survey',
    description: 'Measure how satisfied your customers are with your product and service.',
    status: 'active',
    createdAt: '2025-09-02T10:00:00Z',
    questions: [
      makeQuestion('q-1-1', 'rating', 'How satisfied are you with our product?', true),
      makeQuestion('q-1-2', 'long-text', 'What did you like most about your experience?', false),
      makeQuestion('q-1-3', 'long-text', 'What could we improve?', false),
      makeQuestion('q-1-4', 'multiple-choice', 'How did you hear about us?', false, [
        'Search engine',
        'Social media',
        'Friend or colleague',
        'Advertisement',
        'Other',
      ]),
    ],
  },
  {
    id: 'srv-2',
    name: 'Product Feedback',
    description: 'Collect feedback on new product features and recent releases.',
    status: 'active',
    createdAt: '2025-09-05T14:30:00Z',
    questions: [
      makeQuestion('q-2-1', 'rating', 'How would you rate the new product features?', true),
      makeQuestion('q-2-2', 'short-text', 'Which feature do you use the most?', true),
      makeQuestion('q-2-3', 'multiple-choice', 'Would you recommend this product to others?', true, [
        'Definitely',
        'Probably',
        'Not sure',
        'Probably not',
        'Definitely not',
      ]),
    ],
  },
  {
    id: 'srv-3',
    name: 'Website Experience',
    description: 'Understand how visitors experience your website and where to improve.',
    status: 'active',
    createdAt: '2025-09-10T09:15:00Z',
    questions: [
      makeQuestion('q-3-1', 'rating', 'How easy was it to find what you were looking for?', true),
      makeQuestion('q-3-2', 'long-text', 'Did you encounter any issues while browsing?', false),
      makeQuestion('q-3-3', 'multiple-choice', 'What device are you using?', false, [
        'Desktop',
        'Tablet',
        'Mobile phone',
      ]),
    ],
  },
  {
    id: 'srv-4',
    name: 'Event Feedback',
    description: 'Gather attendee feedback after an event to improve future ones.',
    status: 'draft',
    createdAt: '2025-09-18T16:45:00Z',
    questions: [
      makeQuestion('q-4-1', 'rating', 'How would you rate the event overall?', true),
      makeQuestion('q-4-2', 'multiple-choice', 'Was the event length appropriate?', false, [
        'Too short',
        'Just right',
        'Too long',
      ]),
      makeQuestion('q-4-3', 'long-text', 'What topics would you like to see at future events?', false),
    ],
  },
];

export const demoResponses: SurveyResponse[] = [
  {
    id: 'res-1',
    surveyId: 'srv-1',
    surveyName: 'Customer Satisfaction Survey',
    respondent: 'Sarah Johnson',
    submittedAt: '2025-09-24T09:32:00Z',
    rating: 5,
    answers: {
      'How satisfied are you with our product?': '5',
      'What did you like most about your experience?': 'The onboarding was incredibly smooth and intuitive.',
      'What could we improve?': 'I would love to see more customization options.',
      'How did you hear about us?': 'Friend or colleague',
    },
  },
  {
    id: 'res-2',
    surveyId: 'srv-1',
    surveyName: 'Customer Satisfaction Survey',
    respondent: 'Michael Chen',
    submittedAt: '2025-09-24T11:15:00Z',
    rating: 4,
    answers: {
      'How satisfied are you with our product?': '4',
      'What did you like most about your experience?': 'The dashboard is clean and easy to navigate.',
      'What could we improve?': 'Loading times could be a bit faster on mobile.',
      'How did you hear about us?': 'Search engine',
    },
  },
  {
    id: 'res-3',
    surveyId: 'srv-2',
    surveyName: 'Product Feedback',
    respondent: 'Emily Davis',
    submittedAt: '2025-09-24T14:02:00Z',
    rating: 4,
    answers: {
      'How would you rate the new product features?': '4',
      'Which feature do you use the most?': 'The analytics dashboard',
      'Would you recommend this product to others?': 'Definitely',
    },
  },
  {
    id: 'res-4',
    surveyId: 'srv-3',
    surveyName: 'Website Experience',
    respondent: 'James Wilson',
    submittedAt: '2025-09-25T08:48:00Z',
    rating: 3,
    answers: {
      'How easy was it to find what you were looking for?': '3',
      'Did you encounter any issues while browsing?': 'The search feature was a bit slow.',
      'What device are you using?': 'Desktop',
    },
  },
  {
    id: 'res-5',
    surveyId: 'srv-2',
    surveyName: 'Product Feedback',
    respondent: 'Olivia Martinez',
    submittedAt: '2025-09-25T10:20:00Z',
    rating: 5,
    answers: {
      'How would you rate the new product features?': '5',
      'Which feature do you use the most?': 'Automation builder',
      'Would you recommend this product to others?': 'Definitely',
    },
  },
  {
    id: 'res-6',
    surveyId: 'srv-1',
    surveyName: 'Customer Satisfaction Survey',
    respondent: 'Robert Taylor',
    submittedAt: '2025-09-25T13:45:00Z',
    rating: 2,
    answers: {
      'How satisfied are you with our product?': '2',
      'What did you like most about your experience?': 'The customer support was helpful.',
      'What could we improve?': 'The interface feels cluttered on smaller screens.',
      'How did you hear about us?': 'Social media',
    },
  },
  {
    id: 'res-7',
    surveyId: 'srv-3',
    surveyName: 'Website Experience',
    respondent: 'Sophia Brown',
    submittedAt: '2025-09-25T16:10:00Z',
    rating: 4,
    answers: {
      'How easy was it to find what you were looking for?': '4',
      'Did you encounter any issues while browsing?': 'No issues at all, everything worked great.',
      'What device are you using?': 'Mobile phone',
    },
  },
  {
    id: 'res-8',
    surveyId: 'srv-1',
    surveyName: 'Customer Satisfaction Survey',
    respondent: 'Daniel Anderson',
    submittedAt: '2025-09-26T09:05:00Z',
    rating: 5,
    answers: {
      'How satisfied are you with our product?': '5',
      'What did you like most about your experience?': 'Everything just works as expected.',
      'What could we improve?': 'Nothing comes to mind right now.',
      'How did you hear about us?': 'Advertisement',
    },
  },
  {
    id: 'res-9',
    surveyId: 'srv-2',
    surveyName: 'Product Feedback',
    respondent: 'Ava Garcia',
    submittedAt: '2025-09-26T11:30:00Z',
    rating: 3,
    answers: {
      'How would you rate the new product features?': '3',
      'Which feature do you use the most?': 'Survey builder',
      'Would you recommend this product to others?': 'Probably',
    },
  },
  {
    id: 'res-10',
    surveyId: 'srv-1',
    surveyName: 'Customer Satisfaction Survey',
    respondent: 'William Lee',
    submittedAt: '2025-09-26T15:22:00Z',
    rating: 4,
    answers: {
      'How satisfied are you with our product?': '4',
      'What did you like most about your experience?': 'The reporting features are very useful.',
      'What could we improve?': 'Would like export options for the data.',
      'How did you hear about us?': 'Search engine',
    },
  },
];

export const demoAutomations: Automation[] = [
  {
    id: 'auto-1',
    name: 'New Feedback → Google Sheets',
    trigger: 'New Survey Response',
    triggerDescription: 'Runs whenever someone submits a response to one of your surveys.',
    actionApp: 'Google Sheets',
    actionDescription: 'Add response to Google Sheets',
    status: 'demo',
    createdAt: '2025-09-15T10:00:00Z',
  },
  {
    id: 'auto-2',
    name: 'New Feedback → Slack',
    trigger: 'New Survey Response',
    triggerDescription: 'Runs whenever someone submits a response to one of your surveys.',
    actionApp: 'Slack',
    actionDescription: 'Send notification to Slack',
    status: 'demo',
    createdAt: '2025-09-20T12:00:00Z',
  },
];
