import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { employeeArchiveBlob, downloadEmployeeArchive, type EmployeeArchive } from "@/lib/employee-archive";

export function DeletedEmployeeArchives() {
  const [open, setOpen] = useState(false);
  const [prepared, setPrepared] = useState<{ id: string; blob: Blob; filename: string } | null>(null);
  const archives = useQuery({
    queryKey: ["employee-archives"],
    enabled: open,
    queryFn: async () => {
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from("employee_archives")
          .select("user_id, full_name, email, archived_at")
          .order("archived_at", { ascending: false }).order("user_id").range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(data ?? []));
        if ((data?.length ?? 0) < 500) return rows;
      }
    },
  });
  const prepare = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("employee_archives")
        .select("payload, full_name, archived_at").eq("user_id", id).single();
      if (error) throw error;
      const blob = await employeeArchiveBlob(data.payload as unknown as EmployeeArchive, data.archived_at);
      const name = (data.full_name || id).replace(/[\\/:*?"<>|]/g, "-");
      return { id, blob, filename: `ארכיון-עובד-${name}-${data.archived_at.slice(0, 10)}.xlsx` };
    },
    onSuccess: setPrepared,
    onError: () => toast.error("הכנת הקובץ נכשלה. אפשר לנסות שוב; הנתונים שמורים."),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Archive className="size-4" />ארכיון עובדים שנמחקו</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>ארכיון עובדים שנמחקו</DialogTitle></DialogHeader>
        {archives.isPending && <LoaderCircle className="size-5 animate-spin" aria-label="טוען ארכיון" />}
        {archives.isError && <p role="alert" className="text-destructive">טעינת הארכיון נכשלה</p>}
        {archives.data?.length === 0 && <p className="text-muted-foreground">אין עובדים שנמחקו</p>}
        <div className="max-h-[65vh] overflow-auto">
          {archives.data?.map((employee) => (
            <div key={employee.user_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4">
              <div className="min-w-0">
                <div className="font-medium">{employee.full_name || employee.email}</div>
                <div className="break-all text-sm text-muted-foreground">{employee.email}</div>
                <div className="text-xs text-muted-foreground">נשמר: {new Date(employee.archived_at).toLocaleDateString("he-IL")}</div>
              </div>
              {prepared?.id === employee.user_id ? (
                <Button onClick={() => downloadEmployeeArchive(prepared.blob, prepared.filename)}>
                  <Download className="size-4" />הורדת קובץ Excel
                </Button>
              ) : (
                <Button variant="outline" disabled={prepare.isPending} onClick={() => prepare.mutate(employee.user_id)}>
                  {prepare.isPending && prepare.variables === employee.user_id ? <LoaderCircle className="size-4 animate-spin" /> : <Archive className="size-4" />}
                  הכנת קובץ Excel
                </Button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}