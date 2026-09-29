'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, Link2, BarChart3, Star } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export default function SurveyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getSurvey, responses } = useStore();
  const { toast } = useToast();

  const survey = getSurvey(params.id);

  if (!survey) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-muted-foreground">Survey not found.</p>
        <Button variant="outline" onClick={() => router.push('/surveys')}>
          Back to surveys
        </Button>
      </div>
    );
  }

  const surveyResponses = responses.filter((r) => r.surveyId === survey.id);

  function copyLink() {
    const url = `${window.location.origin}/surveys/${survey!.id}/respond`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copied', description: 'Public survey link copied to clipboard.' });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/surveys">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">{survey.name}</h2>
            <Badge variant={survey.status === 'active' ? 'default' : 'secondary'}>
              {survey.status === 'active' ? 'Active' : 'Draft'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{survey.description}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyLink}>
            <Link2 className="mr-2 h-4 w-4" />
            Copy Link
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/surveys/${survey.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{surveyResponses.length}</p>
              <p className="text-sm text-muted-foreground">Responses</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600">
              <Star className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-semibold">
                {surveyResponses.length > 0
                  ? (
                      surveyResponses.reduce((acc, r) => acc + (r.rating ?? 0), 0) /
                      surveyResponses.length
                    ).toFixed(1)
                  : '—'}
              </p>
              <p className="text-sm text-muted-foreground">Avg. Rating</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Pencil className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{survey.questions.length}</p>
              <p className="text-sm text-muted-foreground">Questions</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="mb-4 font-semibold">Questions</h3>
        <div className="space-y-4">
          {survey.questions.map((q, idx) => (
            <div key={q.id} className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-xs font-medium text-primary">
                    {idx + 1}
                  </span>
                  <span className="font-medium">{q.text}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {q.type.replace('-', ' ')}
                  </Badge>
                  {q.required && (
                    <Badge variant="secondary">Required</Badge>
                  )}
                </div>
              </div>
              {q.type === 'multiple-choice' && q.options.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 pl-8">
                  {q.options.map((opt, i) => (
                    <Badge key={i} variant="outline">{opt}</Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 font-semibold">Recent Responses</h3>
        {surveyResponses.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No responses yet for this survey.
          </p>
        ) : (
          <div className="space-y-2">
            {surveyResponses.slice(0, 5).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                    {r.respondent.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{r.respondent}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.submittedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
                {r.rating !== null && (
                  <div className="flex items-center gap-1 text-sm font-medium">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {r.rating}
                  </div>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link href="/responses">View all responses</Link>
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
