'use client';

import { useState } from 'react';
import { Zap, Workflow, CheckCircle2, ArrowRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

/*
 * TODO:
 * Replace this placeholder with the official viaSocket Embed implementation.
 * Do not implement custom OAuth or third-party integrations here.
 */

export function ViasocketEmbed() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-primary/20 bg-primary/[0.02] p-10 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Workflow className="h-7 w-7" />
        </div>

        <Badge variant="outline" className="mb-4 gap-1.5 border-green-200 bg-green-50 text-green-700">
          <CheckCircle2 className="h-3 w-3" />
          Integration ready
        </Badge>

        <h3 className="text-lg font-semibold">viaSocket Integrations</h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Connect FeedbackFlow to external apps and build automated workflows without
          leaving this platform.
        </p>

        <Button className="mt-6" onClick={() => setOpen(true)}>
          <Zap className="mr-2 h-4 w-4" />
          Launch Automation Builder
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5 text-primary" />
              viaSocket Embed Integration Point
            </DialogTitle>
            <DialogDescription>
              The production viaSocket Embed component will be loaded here.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center rounded-lg border-2 border-dashed border-primary/20 bg-muted/20 p-10 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Workflow className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">
              This is where the viaSocket Embed will render the app connection flow,
              action selection, and workflow configuration.
            </p>

            <div className="mt-6 w-full space-y-3">
              <div className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                  <ExternalLink className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">App connections</p>
                  <p className="text-xs text-muted-foreground">OAuth handled by viaSocket</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-green-50 text-green-600">
                  <Zap className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Triggers & actions</p>
                  <p className="text-xs text-muted-foreground">2,300+ apps supported</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 text-amber-600">
                  <ArrowRight className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Workflow configuration</p>
                  <p className="text-xs text-muted-foreground">Configure and deploy automations</p>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-md bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
              Placeholder — replace with the official viaSocket Embed SDK
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
