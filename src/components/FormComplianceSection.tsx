import { ClipboardCheck, ClipboardX, AlertTriangle, ChevronDown, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";

interface MissingForm {
  id: string;
  leadName: string;
  personName: string;
  formType: 'setter' | 'closer';
  bookedAt: string;
}

interface FormComplianceSectionProps {
  setterFormComplianceRate: number;
  closerFormComplianceRate: number;
  setterFormsFilled: number;
  closerFormsFilled: number;
  totalSetterFormsRequired: number;
  totalCloserFormsRequired: number;
  missingSetterForms: MissingForm[];
  missingCloserForms: MissingForm[];
  setterCompliance: Record<string, { total: number; filled: number; rate: number }>;
  closerCompliance: Record<string, { total: number; filled: number; rate: number }>;
}

const getComplianceColor = (rate: number) => {
  if (rate >= 90) return "text-success";
  if (rate >= 70) return "text-warning";
  return "text-destructive";
};

const getComplianceBgColor = (rate: number) => {
  if (rate >= 90) return "bg-success/10 border-success/20";
  if (rate >= 70) return "bg-warning/10 border-warning/20";
  return "bg-destructive/10 border-destructive/20";
};

const getProgressColor = (rate: number) => {
  if (rate >= 90) return "[&>div]:bg-success";
  if (rate >= 70) return "[&>div]:bg-warning";
  return "[&>div]:bg-destructive";
};

const getTimeAgo = (dateStr: string) => {
  if (!dateStr) return "Unknown";
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return "Unknown";
  }
};

const getUrgencyBadge = (dateStr: string) => {
  if (!dateStr) return <Badge variant="outline">Unknown</Badge>;
  try {
    const hoursAgo = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
    if (hoursAgo > 48) {
      return <Badge variant="destructive">Critical</Badge>;
    }
    if (hoursAgo > 24) {
      return <Badge className="bg-destructive/80">Overdue</Badge>;
    }
    return <Badge variant="outline" className="border-warning text-warning">Recent</Badge>;
  } catch {
    return <Badge variant="outline">Unknown</Badge>;
  }
};

export const FormComplianceSection = ({
  setterFormComplianceRate,
  closerFormComplianceRate,
  setterFormsFilled,
  closerFormsFilled,
  totalSetterFormsRequired,
  totalCloserFormsRequired,
  missingSetterForms,
  missingCloserForms,
  setterCompliance,
  closerCompliance,
}: FormComplianceSectionProps) => {
  const allMissingForms = [...missingSetterForms, ...missingCloserForms]
    .sort((a, b) => {
      const dateA = a.bookedAt ? new Date(a.bookedAt).getTime() : 0;
      const dateB = b.bookedAt ? new Date(b.bookedAt).getTime() : 0;
      return dateA - dateB; // Oldest first (most urgent)
    })
    .slice(0, 10); // Show top 10 most urgent

  const hasComplianceData = totalSetterFormsRequired > 0 || totalCloserFormsRequired > 0;

  if (!hasComplianceData) {
    return null;
  }

  return (
    <div className="space-y-6 mb-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Setter Form Compliance */}
        <Card className={`border ${getComplianceBgColor(setterFormComplianceRate)}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ClipboardCheck className={`h-4 w-4 ${getComplianceColor(setterFormComplianceRate)}`} />
              Setter Form Compliance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${getComplianceColor(setterFormComplianceRate)}`}>
                {setterFormComplianceRate.toFixed(0)}%
              </span>
              <span className="text-sm text-muted-foreground">
                ({setterFormsFilled}/{totalSetterFormsRequired} filled)
              </span>
            </div>
            <Progress 
              value={setterFormComplianceRate} 
              className={`mt-3 h-2 ${getProgressColor(setterFormComplianceRate)}`} 
            />
          </CardContent>
        </Card>

        {/* Closer Form Compliance */}
        <Card className={`border ${getComplianceBgColor(closerFormComplianceRate)}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ClipboardCheck className={`h-4 w-4 ${getComplianceColor(closerFormComplianceRate)}`} />
              Closer Form Compliance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${getComplianceColor(closerFormComplianceRate)}`}>
                {closerFormComplianceRate.toFixed(0)}%
              </span>
              <span className="text-sm text-muted-foreground">
                ({closerFormsFilled}/{totalCloserFormsRequired} filled)
              </span>
            </div>
            <Progress 
              value={closerFormComplianceRate} 
              className={`mt-3 h-2 ${getProgressColor(closerFormComplianceRate)}`} 
            />
          </CardContent>
        </Card>
      </div>

      {/* Who's Dropping the Ball */}
      {allMissingForms.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Who's Dropping the Ball ({allMissingForms.length} missing forms)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Team Member</TableHead>
                  <TableHead>Missing Form</TableHead>
                  <TableHead>Booked</TableHead>
                  <TableHead>Urgency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allMissingForms.map((form) => (
                  <TableRow key={`${form.formType}-${form.id}`}>
                    <TableCell className="font-medium">{form.leadName || 'Unknown'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {form.personName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={form.formType === 'setter' ? 'secondary' : 'outline'}>
                        {form.formType === 'setter' ? 'Post-Set Form' : 'Closer Form'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {getTimeAgo(form.bookedAt)}
                    </TableCell>
                    <TableCell>{getUrgencyBadge(form.bookedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* All forms filled celebration */}
      {allMissingForms.length === 0 && hasComplianceData && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="py-6 text-center">
            <ClipboardCheck className="h-10 w-10 mx-auto text-success mb-2" />
            <p className="text-success font-medium">All forms are filled! Great job team! 🎉</p>
          </CardContent>
        </Card>
      )}

      {/* Team Breakdown */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="team-breakdown" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <span className="font-semibold">Team Compliance Breakdown</span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              {/* Setters */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground">Setters</h4>
                {Object.entries(setterCompliance).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No setter data available</p>
                ) : (
                  Object.entries(setterCompliance)
                    .sort((a, b) => a[1].rate - b[1].rate)
                    .map(([name, data]) => (
                      <div key={name} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{name}</span>
                          <span className={getComplianceColor(data.rate)}>
                            {data.rate.toFixed(0)}% ({data.filled}/{data.total})
                          </span>
                        </div>
                        <Progress 
                          value={data.rate} 
                          className={`h-1.5 ${getProgressColor(data.rate)}`} 
                        />
                      </div>
                    ))
                )}
              </div>

              {/* Closers */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground">Closers</h4>
                {Object.entries(closerCompliance).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No closer data available</p>
                ) : (
                  Object.entries(closerCompliance)
                    .sort((a, b) => a[1].rate - b[1].rate)
                    .map(([name, data]) => (
                      <div key={name} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{name}</span>
                          <span className={getComplianceColor(data.rate)}>
                            {data.rate.toFixed(0)}% ({data.filled}/{data.total})
                          </span>
                        </div>
                        <Progress 
                          value={data.rate} 
                          className={`h-1.5 ${getProgressColor(data.rate)}`} 
                        />
                      </div>
                    ))
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
