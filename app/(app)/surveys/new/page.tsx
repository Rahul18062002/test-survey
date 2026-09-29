'use client';

import { useRouter } from 'next/navigation';
import { SurveyBuilder } from '@/components/surveys/SurveyBuilder';
import { useStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import type { Survey } from '@/lib/types';

export default function CreateSurveyPage() {
  const router = useRouter();
  const { addSurvey } = useStore();
  const { toast } = useToast();

  function handleSave(survey: Survey) {
    addSurvey(survey);
    toast({
      title: survey.status === 'active' ? 'Survey published' : 'Draft saved',
      description:
        survey.status === 'active'
          ? 'Your survey is now live and ready to collect responses.'
          : 'Your survey draft has been saved.',
    });
    router.push('/surveys');
  }

  return (
    <SurveyBuilder
      mode="create"
      onSave={handleSave}
      onCancel={() => router.push('/surveys')}
    />
  );
}
