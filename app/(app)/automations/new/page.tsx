'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Zap, Inbox, Workflow, CheckCircle2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ViasocketEmbed } from '@/components/integrations/ViasocketEmbed';
import type { Automation } from '@/lib/types';

export default function AutomationBuilderPage() {
  const router = useRouter();
  const { addAutomation } = useStore();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [actionApp, setActionApp] = useState('');
  const [actionDescription, setActionDescription] = useState('');

  function handleSave() {
    const automation: Automation = {
      id: `auto-${Date.now()}`,
      name: name || 'Untitled Automation',
      trigger: 'New Survey Response',
      triggerDescription:
        'Runs whenever someone submits a response to one of your surveys.',
      actionApp: actionApp || 'Not configured',
      actionDescription: actionDescription || 'Action not yet configured',
      status: 'demo',
      createdAt: new Date().toISOString(),
    };
    addAutomation(automation);
    toast({
      title: 'Automation created',
      description: 'Connect viaSocket Embed to activate this automation.',
    });
    router.push('/automations');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/automations">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-semibold tracking-tight">Create Automation</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Define what happens when a new survey response is submitted.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/automations')}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save Automation</Button>
      </div>

      {/* Step 1 — Trigger */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
            1
          </span>
          <h3 className="font-semibold">When this happens</h3>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Inbox className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">New Survey Response</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Runs whenever someone submits a response to one of your surveys.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Step 2 — viaSocket Embed */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
            2
          </span>
          <h3 className="font-semibold">Connect an app</h3>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Use viaSocket to connect FeedbackFlow with hundreds of external applications.
        </p>

        <ViasocketEmbed />

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="action-app">Action app (label for demo)</Label>
            <Input
              id="action-app"
              value={actionApp}
              onChange={(e) => setActionApp(e.target.value)}
              placeholder="e.g. Google Sheets"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="action-desc">Action description (label for demo)</Label>
            <Input
              id="action-desc"
              value={actionDescription}
              onChange={(e) => setActionDescription(e.target.value)}
              placeholder="e.g. Add response to spreadsheet"
            />
          </div>
        </div>
      </Card>

      {/* Step 3 — Result */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
            3
          </span>
          <h3 className="font-semibold">Workflow summary</h3>
        </div>

        <div className="flex flex-col items-center gap-3 py-4">
          <div className="flex items-center gap-3 rounded-lg border bg-muted/20 px-5 py-3">
            <Inbox className="h-5 w-5 text-primary" />
            <span className="font-medium">New Survey Response</span>
          </div>

          <ArrowRight className="h-5 w-5 rotate-90 text-muted-foreground" />

          <div className="flex items-center gap-3 rounded-lg border bg-muted/20 px-5 py-3">
            <Workflow className="h-5 w-5 text-primary" />
            <span className="font-medium">viaSocket</span>
          </div>

          <ArrowRight className="h-5 w-5 rotate-90 text-muted-foreground" />

          <div className="flex items-center gap-3 rounded-lg border bg-muted/20 px-5 py-3">
            <Zap className="h-5 w-5 text-green-600" />
            <span className="font-medium">
              {actionApp || 'Choose an app'}
            </span>
          </div>

          <ArrowRight className="h-5 w-5 rotate-90 text-muted-foreground" />

          <div className="flex items-center gap-3 rounded-lg border bg-muted/20 px-5 py-3">
            <CheckCircle2 className="h-5 w-5 text-amber-600" />
            <span className="font-medium">
              {actionDescription || 'Configure action'}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center">
          <Badge variant="outline" className="gap-1.5 border-amber-300 bg-amber-50 text-amber-700">
            Demo configuration — connect viaSocket Embed to activate
          </Badge>
        </div>
      </Card>
    </div>
  );
}
