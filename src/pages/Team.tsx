import { useState } from "react";
import { useLiveSheetData } from "@/hooks/useLiveSheetData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SheetDataBanner } from "@/components/SheetDataBanner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "react-router-dom";

export default function Team() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: teamMembers, isLoading, refetch, lastSyncedAt, sheetUrl, isConfigured } = useLiveSheetData('team');

  const filteredMembers = teamMembers.filter((member: any) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      member.full_name?.toLowerCase().includes(search) ||
      member.email?.toLowerCase().includes(search)
    );
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin":
        return "default";
      case "closer":
        return "secondary";
      case "setter":
        return "outline";
      default:
        return "outline";
    }
  };

  if (!isConfigured && !isLoading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Team</h1>
        <Alert>
          <AlertTitle>No Team Sheet Configured</AlertTitle>
          <AlertDescription>
            Connect a Google Sheet with team data to view your team roster.{" "}
            <Link to="/settings" className="text-primary hover:underline">
              Go to Settings
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Team</h1>
          <p className="text-muted-foreground mt-1">
            View team members from Google Sheets
          </p>
        </div>
      </div>

      <SheetDataBanner
        sheetUrl={sheetUrl}
        lastSyncedAt={lastSyncedAt}
        onRefresh={refetch}
        isLoading={isLoading}
        entityName="team members"
      />

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search team members..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Loading from Google Sheets...
                </TableCell>
              </TableRow>
            ) : filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  No team members found
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((member: any) => (
                <TableRow key={member.team_member_id}>
                  <TableCell className="font-medium">{member.full_name || "—"}</TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>{member.phone || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(member.role)}>
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{member.department || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={member.active ? "default" : "secondary"}>
                      {member.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
