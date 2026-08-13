import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** פתיחת פרויקט חדש על ידי עובד: קוד, שם ולקוח חובה, תאריך התחלה אופציונלי. */
export function NewProjectDialog({ triggerLabel = "פרויקט חדש" }: { triggerLabel?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", client_name: "", start_date: "" });

  const valid = form.code.trim() && form.name.trim() && form.client_name.trim();

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("projects").insert({
        code: form.code.trim(),
        name: form.name.trim(),
        client_name: form.client_name.trim(),
        start_date: form.start_date || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הפרויקט נוסף. המנהל יקבל התראה להשלמת הפרטים הכספיים.");
      setForm({ code: "", name: "", client_name: "", start_date: "" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["projects-dir"] });
      qc.invalidateQueries({ queryKey: ["projects-full"] });
      qc.invalidateQueries({ queryKey: ["projects-review"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "שמירה נכשלה";
      toast.error(msg.includes("duplicate") ? "קוד פרויקט זה כבר קיים במערכת" : msg);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <FolderPlus className="size-4" aria-hidden />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>פרויקט חדש</DialogTitle>
          <DialogDescription>
            ניתן להזין את הפרטים הבסיסיים בלבד. השכר, התקציב ותחנות התשלום יושלמו על ידי המנהל.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="np-code">קוד פרויקט *</Label>
            <Input
              id="np-code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="np-name">שם הפרויקט *</Label>
            <Input
              id="np-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="np-client">שם הלקוח *</Label>
            <Input
              id="np-client"
              value={form.client_name}
              onChange={(e) => setForm({ ...form, client_name: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="np-start">תאריך תחילה (אופציונלי)</Label>
            <Input
              id="np-start"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            ביטול
          </Button>
          <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            שמירה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
