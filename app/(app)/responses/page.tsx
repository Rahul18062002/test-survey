'use client';

import { useState, useMemo } from 'react';
import { Star, Inbox, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import type { SurveyResponse } from '@/lib/types';

export default function ResponsesPage() {
  const { responses, surveys } = useStore();
  const [surveyFilter, setSurveyFilter] = useState<string>('all');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [selectedResponse, setSelectedResponse] = useState<SurveyResponse | null>(null);

  const filtered = useMemo(() => {
    return responses.filter((r) => {
      if (surveyFilter !== 'all' && r.surveyId !== surveyFilter) return false;
      if (ratingFilter !== 'all') {
        const target = parseInt(ratingFilter);
        if (r.rating !== target) return false;
      }
      return true;
    });
  }, [responses, surveyFilter, ratingFilter]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Responses</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          View and filter all survey responses collected across your surveys.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={surveyFilter} onValueChange={setSurveyFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Filter by survey" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All surveys</SelectItem>
            {surveys.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ratingFilter} onValueChange={setRatingFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filter by rating" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ratings</SelectItem>
            {[5, 4, 3, 2, 1].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} star{n > 1 ? 's' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(surveyFilter !== 'all' || ratingFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSurveyFilter('all');
              setRatingFilter('all');
            }}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Respondent</TableHead>
              <TableHead>Survey</TableHead>
              <TableHead className="w-36">Submitted</TableHead>
              <TableHead className="w-28">Rating</TableHead>
              <TableHead className="w-24">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Inbox className="h-10 w-10" />
                    <p>No responses match your filters.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedResponse(r)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                        {r.respondent.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium">{r.respondent}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{r.surveyName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(r.submittedAt)}
                  </TableCell>
                  <TableCell>
                    {r.rating !== null ? (
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="font-medium">{r.rating}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">Completed</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!selectedResponse} onOpenChange={(open) => !open && setSelectedResponse(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selectedResponse && (
            <>
              <SheetHeader>
                <SheetTitle>Response Details</SheetTitle>
                <SheetDescription>
                  Submitted on {formatDateTime(selectedResponse.submittedAt)}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Respondent</p>
                    <p className="mt-1 font-medium">{selectedResponse.respondent}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Survey</p>
                    <p className="mt-1 font-medium">{selectedResponse.surveyName}</p>
                  </div>
                </div>

                {selectedResponse.rating !== null && (
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Overall Rating</p>
                    <div className="mt-1 flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={`h-5 w-5 ${
                            n <= selectedResponse.rating!
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-border'
                          }`}
                        />
                      ))}
                      <span className="ml-2 font-medium">{selectedResponse.rating}</span>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold">Answers</h4>
                  {Object.entries(selectedResponse.answers).map(([question, answer], idx) => (
                    <div key={idx} className="rounded-lg border bg-muted/20 p-4">
                      <p className="text-sm font-medium text-muted-foreground">{question}</p>
                      <p className="mt-1 text-sm">{answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
