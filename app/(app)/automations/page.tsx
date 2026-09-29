'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Zap, ArrowRight, MoreHorizontal, Trash2, Pause, Play } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Automation } from '@/lib/types';

function StatusBadge({ status }: { status: Automation['status'] }) {
  if (status === 'active') return <Badge className="bg-green-600 hover:bg-green-600">Active</Badge>;
  if (status === 'paused') return <Badge variant="secondary">Paused</Badge>;
  return (
    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
      Demo
    </Badge>
  );
}

export default function AutomationsPage() {
  const { automations, deleteAutomation, updateAutomation } = useStore();
  const { toast } = useToast();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function togglePause(automation: Automation) {
    const newStatus = automation.status === 'active' ? 'paused' : 'active';
    updateAutomation(automation.id, { status: newStatus });
    toast({
      title: newStatus === 'active' ? 'Automation resumed' : 'Automation paused',
    });
  }

  function confirmDelete() {
    if (!deleteId) return;
    deleteAutomation(deleteId);
    toast({ title: 'Automation deleted' });
    setDeleteId(null);
  }

  const automationToDelete = automations.find((a) => a.id === deleteId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Automations</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Connect FeedbackFlow with the apps you already use and automate what happens
            after a new response.
          </p>
        </div>
        <Button asChild>
          <Link href="/automations/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Automation
          </Link>
        </Button>
      </div>

      {automations.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Zap className="h-7 w-7" />
          </div>
          <div>
            <p className="font-medium">No automations yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first automation to connect FeedbackFlow with your favorite apps.
            </p>
          </div>
          <Button asChild>
            <Link href="/automations/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Automation
            </Link>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {automations.map((automation) => (
            <Card key={automation.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{automation.name}</h3>
                    <StatusBadge status={automation.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {formatDate(automation.createdAt)}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {automation.status !== 'demo' && (
                      <DropdownMenuItem onClick={() => togglePause(automation)}>
                        {automation.status === 'active' ? (
                          <>
                            <Pause className="mr-2 h-4 w-4" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-4 w-4" />
                            Resume
                          </>
                        )}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteId(automation.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-xs font-medium text-primary">
                      1
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Trigger</p>
                      <p className="text-sm font-medium">{automation.trigger}</p>
                    </div>
                  </div>
                  <p className="mt-2 pl-9 text-xs text-muted-foreground">
                    {automation.triggerDescription}
                  </p>
                </div>

                <div className="flex justify-center">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>

                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-green-50 text-xs font-medium text-green-600">
                      2
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Action — {automation.actionApp}
                      </p>
                      <p className="text-sm font-medium">{automation.actionDescription}</p>
                    </div>
                  </div>
                </div>
              </div>

              {automation.status === 'demo' && (
                <div className={cn(
                  'mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700'
                )}>
                  This is a demo automation. Connect viaSocket Embed to activate it.
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete automation?</AlertDialogTitle>
            <AlertDialogDescription>
              {automationToDelete
                ? `This will permanently remove "${automationToDelete.name}".`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
