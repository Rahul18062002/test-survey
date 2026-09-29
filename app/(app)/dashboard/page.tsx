'use client';

import Link from 'next/link';
import { FileText, Inbox, CheckCircle2, TrendingUp, Plus, MoreHorizontal } from 'lucide-react';
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

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { surveys, responses } = useStore();

  const activeSurveys = surveys.filter((s) => s.status === 'active').length;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const responsesThisWeek = responses.filter(
    (r) => new Date(r.submittedAt) >= weekAgo
  ).length;

  const recentSurveys = surveys.slice(0, 5);

  const responseCountFor = (surveyId: string) =>
    responses.filter((r) => r.surveyId === surveyId).length;

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Overview of your surveys, responses, and activity.
          </p>
        </div>
        <Button asChild>
          <Link href="/surveys/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Survey
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Surveys" value={surveys.length} icon={FileText} accent="bg-blue-50 text-blue-600" />
        <StatCard label="Total Responses" value={responses.length} icon={Inbox} accent="bg-green-50 text-green-600" />
        <StatCard label="Active Surveys" value={activeSurveys} icon={CheckCircle2} accent="bg-amber-50 text-amber-600" />
        <StatCard label="Responses This Week" value={responsesThisWeek} icon={TrendingUp} accent="bg-purple-50 text-purple-600" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h3 className="font-semibold">Recent Surveys</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">Your most recent surveys at a glance.</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/surveys">View all</Link>
          </Button>
        </div>
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
            {recentSurveys.map((survey) => (
              <TableRow key={survey.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{survey.name}</span>
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
                        <Link href={`/surveys/${survey.id}`}>View</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/surveys/${survey.id}/edit`}>Edit</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/surveys/${survey.id}/respond`} target="_blank">
                          Open public survey
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
