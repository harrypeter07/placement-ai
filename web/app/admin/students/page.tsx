"use client";

import { useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Student {
  _id: string;
  name: string;
  email: string;
  branch?: string;
  cgpa?: number;
  createdAt: string;
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/students").then((r) => r.json()).then(setStudents).finally(() => setLoading(false));
  }, []);

  return (
    <>
      <DashboardHeader title="Students" />
      <main className="p-4 lg:p-8 space-y-3">
        {loading ? <Skeleton className="h-20" /> : students.length === 0 ? (
          <Card className="glass"><CardContent className="py-12 text-center text-muted-foreground">No students registered yet.</CardContent></Card>
        ) : students.map((s) => (
          <Card key={s._id} className="glass">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span><strong>{s.name}</strong><br /><span className="text-sm text-muted-foreground">{s.email}</span></span>
              <span className="flex gap-2">
                {s.branch && <Badge variant="outline">{s.branch}</Badge>}
                {s.cgpa && <Badge>CGPA {s.cgpa}</Badge>}
              </span>
            </CardContent>
          </Card>
        ))}
      </main>
    </>
  );
}
