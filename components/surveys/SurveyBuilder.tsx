'use client';

import { useState, useCallback } from 'react';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Type,
  AlignLeft,
  ListChecks,
  Star,
  GripVertical,
} from 'lucide-react';
import type { Survey, Question, QuestionType } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const questionTypeOptions: { value: QuestionType; label: string; icon: React.ElementType }[] = [
  { value: 'short-text', label: 'Short Text', icon: Type },
  { value: 'long-text', label: 'Long Text', icon: AlignLeft },
  { value: 'multiple-choice', label: 'Multiple Choice', icon: ListChecks },
  { value: 'rating', label: 'Rating 1–5', icon: Star },
];

function genId() {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface SurveyBuilderProps {
  initialSurvey?: Survey;
  onSave: (survey: Survey) => void;
  onCancel: () => void;
  mode: 'create' | 'edit';
}

export function SurveyBuilder({ initialSurvey, onSave, onCancel, mode }: SurveyBuilderProps) {
  const [name, setName] = useState(initialSurvey?.name ?? '');
  const [description, setDescription] = useState(initialSurvey?.description ?? '');
  const [questions, setQuestions] = useState<Question[]>(
    initialSurvey?.questions ?? []
  );

  const addQuestion = useCallback(() => {
    setQuestions((prev) => [
      ...prev,
      { id: genId(), type: 'short-text', text: '', required: false, options: [] },
    ]);
  }, []);

  const updateQuestion = useCallback((id: string, updates: Partial<Question>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...updates } : q)));
  }, []);

  const deleteQuestion = useCallback((id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const moveQuestion = useCallback((index: number, direction: 'up' | 'down') => {
    setQuestions((prev) => {
      const next = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }, []);

  const addOption = useCallback((questionId: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId ? { ...q, options: [...q.options, ''] } : q
      )
    );
  }, []);

  const updateOption = useCallback(
    (questionId: string, optionIndex: number, value: string) => {
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === questionId
            ? { ...q, options: q.options.map((opt, i) => (i === optionIndex ? value : opt)) }
            : q
        )
      );
    },
    []
  );

  const deleteOption = useCallback((questionId: string, optionIndex: number) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? { ...q, options: q.options.filter((_, i) => i !== optionIndex) }
          : q
      )
    );
  }, []);

  function handleSave(status: 'draft' | 'active') {
    const survey: Survey = {
      id: initialSurvey?.id ?? `srv-${Date.now()}`,
      name,
      description,
      status,
      questions: questions.filter((q) => q.text.trim() !== ''),
      createdAt: initialSurvey?.createdAt ?? new Date().toISOString(),
    };
    onSave(survey);
  }

  const canSave = name.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {mode === 'create' ? 'Create Survey' : 'Edit Survey'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Build your survey by adding questions below.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSave('draft')}
            disabled={!canSave}
          >
            Save Draft
          </Button>
          <Button onClick={() => handleSave('active')} disabled={!canSave}>
            Publish Survey
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <h3 className="mb-4 font-semibold">Survey Information</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="survey-name">Survey Name</Label>
            <Input
              id="survey-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer Satisfaction Survey"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="survey-description">Description</Label>
            <Textarea
              id="survey-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe the purpose of this survey."
              rows={3}
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Questions</h3>
          <Button size="sm" variant="outline" onClick={addQuestion}>
            <Plus className="mr-2 h-4 w-4" />
            Add Question
          </Button>
        </div>

        {questions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-muted-foreground">
            <p>No questions yet.</p>
            <Button size="sm" variant="outline" onClick={addQuestion}>
              <Plus className="mr-2 h-4 w-4" />
              Add your first question
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((question, index) => {
              const TypeIcon = questionTypeOptions.find(
                (o) => o.value === question.type
              )?.icon ?? Type;
              return (
                <div
                  key={question.id}
                  className="rounded-lg border bg-muted/20 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1 pt-2 text-muted-foreground">
                      <GripVertical className="h-4 w-4" />
                      <span className="text-xs font-medium">{index + 1}</span>
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="flex gap-3">
                        <Input
                          value={question.text}
                          onChange={(e) =>
                            updateQuestion(question.id, { text: e.target.value })
                          }
                          placeholder="Type your question…"
                          className="flex-1"
                        />
                        <Select
                          value={question.type}
                          onValueChange={(val: QuestionType) =>
                            updateQuestion(question.id, {
                              type: val,
                              options: val === 'multiple-choice' ? question.options.length ? question.options : ['', ''] : [],
                            })
                          }
                        >
                          <SelectTrigger className="w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {questionTypeOptions.map((opt) => {
                              const Icon = opt.icon;
                              return (
                                <SelectItem key={opt.value} value={opt.value}>
                                  <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4" />
                                    {opt.label}
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center gap-2 pl-1 text-sm text-muted-foreground">
                        <TypeIcon className="h-4 w-4" />
                        <span>
                          {questionTypeOptions.find((o) => o.value === question.type)?.label}
                        </span>
                      </div>

                      {question.type === 'multiple-choice' && (
                        <div className="space-y-2 pl-1">
                          {question.options.map((option, optIdx) => (
                            <div key={optIdx} className="flex items-center gap-2">
                              <Input
                                value={option}
                                onChange={(e) =>
                                  updateOption(question.id, optIdx, e.target.value)
                                }
                                placeholder={`Option ${optIdx + 1}`}
                                className="flex-1"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => deleteOption(question.id, optIdx)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-primary"
                            onClick={() => addOption(question.id)}
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Add option
                          </Button>
                        </div>
                      )}

                      <div className="flex items-center justify-between pl-1 pt-1">
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`required-${question.id}`}
                            checked={question.required}
                            onCheckedChange={(checked) =>
                              updateQuestion(question.id, { required: checked })
                            }
                          />
                          <Label
                            htmlFor={`required-${question.id}`}
                            className="text-sm text-muted-foreground"
                          >
                            Required
                          </Label>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={index === 0}
                            onClick={() => moveQuestion(index, 'up')}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={index === questions.length - 1}
                            onClick={() => moveQuestion(index, 'down')}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteQuestion(question.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
