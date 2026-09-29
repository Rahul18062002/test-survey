'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Star, CheckCircle2, ArrowLeft, MessageSquare } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SurveyResponse } from '@/lib/types';

export default function PublicSurveyPage() {
  const params = useParams<{ id: string }>();
  const { getSurvey, addResponse } = useStore();

  const survey = getSurvey(params.id);

  const [respondent, setRespondent] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [rating, setRating] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!survey) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <MessageSquare className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-semibold">Survey not found</h1>
        <p className="text-sm text-muted-foreground">
          This survey may have been removed or is no longer available.
        </p>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    survey!.questions.forEach((q) => {
      if (q.required) {
        if (q.type === 'rating') {
          if (!rating[q.text]) newErrors[q.text] = 'Please select a rating.';
        } else if (!answers[q.text]?.trim()) {
          newErrors[q.text] = 'This field is required.';
        }
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const allAnswers: Record<string, string> = { ...answers };
    survey!.questions.forEach((q) => {
      if (q.type === 'rating' && rating[q.text]) {
        allAnswers[q.text] = String(rating[q.text]);
      }
    });

    const avgRating = Object.values(rating).length > 0
      ? Math.round((Object.values(rating).reduce((a, b) => a + b, 0) / Object.values(rating).length) * 10) / 10
      : null;

    const response: SurveyResponse = {
      id: `res-${Date.now()}`,
      surveyId: survey!.id,
      surveyName: survey!.name,
      respondent: respondent.trim() || 'Anonymous',
      submittedAt: new Date().toISOString(),
      rating: avgRating,
      answers: allAnswers,
    };

    addResponse(response);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-6">
        <Card className="max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-semibold">Thank you for your feedback!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your response has been recorded. We appreciate you taking the time to share your thoughts.
          </p>
        </Card>
      </div>
    );
  }

  if (survey.status === 'draft') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <MessageSquare className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-semibold">This survey is not yet published</h1>
        <p className="text-sm text-muted-foreground">
          The survey owner needs to publish it before responses can be collected.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span>FeedbackFlow</span>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">{survey.name}</h1>
          <p className="mt-2 text-muted-foreground">{survey.description}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="p-6">
            <div className="space-y-2">
              <Label htmlFor="respondent">
                Your name <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="respondent"
                value={respondent}
                onChange={(e) => setRespondent(e.target.value)}
                placeholder="Enter your name"
              />
            </div>
          </Card>

          {survey.questions.map((q, idx) => (
            <Card key={q.id} className="p-6">
              <div className="mb-4">
                <Label className="text-base font-medium">
                  <span className="mr-2 text-primary">{idx + 1}.</span>
                  {q.text}
                  {q.required && <span className="ml-1 text-destructive">*</span>}
                </Label>
              </div>

              {q.type === 'short-text' && (
                <Input
                  value={answers[q.text] ?? ''}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [q.text]: e.target.value }))
                  }
                  placeholder="Your answer"
                />
              )}

              {q.type === 'long-text' && (
                <Textarea
                  value={answers[q.text] ?? ''}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [q.text]: e.target.value }))
                  }
                  placeholder="Your answer"
                  rows={4}
                />
              )}

              {q.type === 'multiple-choice' && (
                <div className="space-y-2">
                  {q.options.map((opt, optIdx) => (
                    <label
                      key={optIdx}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-secondary',
                        answers[q.text] === opt && 'border-primary bg-primary/5'
                      )}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        value={opt}
                        checked={answers[q.text] === opt}
                        onChange={(e) =>
                          setAnswers((prev) => ({ ...prev, [q.text]: e.target.value }))
                        }
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="text-sm">{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {q.type === 'rating' && (
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating((prev) => ({ ...prev, [q.text]: n }))}
                      className={cn(
                        'flex h-12 w-12 items-center justify-center rounded-lg border transition-all',
                        rating[q.text] >= n
                          ? 'border-amber-400 bg-amber-50 text-amber-500'
                          : 'border-border text-muted-foreground hover:border-amber-300 hover:bg-amber-50/50'
                      )}
                    >
                      <Star
                        className={cn(
                          'h-5 w-5',
                          rating[q.text] >= n && 'fill-amber-400 text-amber-400'
                        )}
                      />
                    </button>
                  ))}
                </div>
              )}

              {errors[q.text] && (
                <p className="mt-2 text-sm text-destructive">{errors[q.text]}</p>
              )}
            </Card>
          ))}

          <Button type="submit" size="lg" className="w-full">
            Submit Response
          </Button>
        </form>
      </div>
    </div>
  );
}
