'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus, MoreHorizontal, Eye, Pencil, Link2, Trash2, FileText } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

export default function SurveysPage() {
  const { surveys, responses, deleteSurvey } = useStore();
  const { toast } = useToast();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const responseCountFor = (surveyId: string) =>
    responses.filter((r) => r.surveyId === surveyId).length;

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function copyLink(surveyId: string) {
    const url = `${window.location.origin}/surveys/${surveyId}/respond`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copied', description: 'Public survey link copied to clipboard.' });
  }

  function confirmDelete() {
    if (!deleteId) return;
    deleteSurvey(deleteId);
    toast({ title: 'Survey deleted', description: 'The survey has been removed.' });
    setDeleteId(null);
  }

  const surveyToDelete = surveys.find((s) => s.id === deleteId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Surveys</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create, edit, and share surveys with your audience.
          </p>
        </div>
        <Button asChild>
          <Link href="/surveys/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Survey
          </Link>
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Survey</TableHead>
              <TableHead className="w-28">Responses</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-36">Created</TableHead>
              <TableHead className="w-16 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {surveys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <FileText className="h-10 w-10" />
                    <p>No surveys yet. Create your first survey to get started.</p>
                    <Button asChild size="sm">
                      <Link href="/surveys/new">
                        <Plus className="mr-2 h-4 w-4" />
                        Create Survey
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              surveys.map((survey) => (
                <TableRow key={survey.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <Link
                        href={`/surveys/${survey.id}`}
                        className="font-medium hover:text-primary"
                      >
                        {survey.name}
                      </Link>
                      <span className="max-w-md truncate text-xs text-muted-foreground">
                        {survey.description}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">
                    {responseCountFor(survey.id)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={survey.status === 'active' ? 'default' : 'secondary'}>
                      {survey.status === 'active' ? 'Active' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(survey.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/surveys/${survey.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/surveys/${survey.id}/edit`}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyLink(survey.id)}>
                          <Link2 className="mr-2 h-4 w-4" />
                          Copy Link
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteId(survey.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete survey?</AlertDialogTitle>
            <AlertDialogDescription>
              {surveyToDelete
                ? `This will permanently remove "${surveyToDelete.name}" and cannot be undone.`
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
