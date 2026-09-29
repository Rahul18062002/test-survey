'use client';

import { useParams, useRouter } from 'next/navigation';
import { SurveyBuilder } from '@/components/surveys/SurveyBuilder';
import { useStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import type { Survey } from '@/lib/types';

export default function EditSurveyPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getSurvey, updateSurvey } = useStore();
  const { toast } = useToast();

  const survey = getSurvey(params.id);

  if (!survey) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-muted-foreground">Survey not found.</p>
        <button
          className="text-primary underline"
          onClick={() => router.push('/surveys')}
        >
          Back to surveys
        </button>
      </div>
    );
  }

  function handleSave(updated: Survey) {
    updateSurvey(updated.id, updated);
    toast({
      title: updated.status === 'active' ? 'Survey updated & published' : 'Draft saved',
      description: 'Your survey changes have been saved.',
    });
    router.push('/surveys');
  }

  return (
    <SurveyBuilder
      mode="edit"
      initialSurvey={survey}
      onSave={handleSave}
      onCancel={() => router.push('/surveys')}
    />
  );
}
