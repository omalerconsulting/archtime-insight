// Supabase Edge Function — monthly report email to the accountant.
//
// SETUP (one-time, in the Supabase dashboard):
// 1. Create an account at https://resend.com and verify the office domain.
// 2. Project Settings → Edge Functions → add secret: RESEND_API_KEY.
// 3. Deploy: `supabase functions deploy send-monthly-report`.
// 4. Schedule (Database → Cron / pg_cron) to run on org_settings.auto_send_day
//    each month, or invoke it manually from the app.
//
// Until this function is deployed, the app offers a mailto-based
// "שליחה לרו״ח" button on the consolidated monthly report instead.

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { month } = await req.json().catch(() => ({ month: null }));
    const target = month ?? new Date().toISOString().slice(0, 7); // YYYY-MM

    const { data: settings } = await supabase
      .from("org_settings")
      .select("office_name, accountant_email")
      .maybeSingle();
    if (!settings?.accountant_email) {
      return new Response(JSON.stringify({ error: "no accountant email configured" }), { status: 400 });
    }

    const start = `${target}-01`;
    const end = new Date(Number(target.slice(0, 4)), Number(target.slice(5, 7)), 0)
      .toISOString()
      .slice(0, 10);

    const [{ data: entries }, { data: profiles }] = await Promise.all([
      supabase
        .from("time_entries")
        .select("user_id, work_date, clock_in, clock_out, break_minutes, absence_type")
        .gte("work_date", start)
        .lte("work_date", end),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    const nameOf = (id: string) =>
      profiles?.find((p) => p.id === id)?.full_name || profiles?.find((p) => p.id === id)?.email || id;

    const perEmployee = new Map<string, { hours: number; absences: number }>();
    for (const e of entries ?? []) {
      const cur = perEmployee.get(e.user_id) ?? { hours: 0, absences: 0 };
      if (e.clock_in && e.clock_out) {
        const [h1, m1] = e.clock_in.split(":").map(Number);
        const [h2, m2] = e.clock_out.split(":").map(Number);
        let mins = h2 * 60 + m2 - (h1 * 60 + m1);
        if (mins < 0) mins += 1440;
        cur.hours += Math.max(0, (mins - (e.break_minutes ?? 0)) / 60);
      }
      if (e.absence_type) cur.absences += 1;
      perEmployee.set(e.user_id, cur);
    }

    const rows = [...perEmployee.entries()]
      .map(
        ([id, v]) =>
          `<tr><td>${nameOf(id)}</td><td>${v.hours.toFixed(2)}</td><td>${v.absences}</td></tr>`,
      )
      .join("");

    const html = `
      <div dir="rtl" style="font-family:Arial,sans-serif">
        <h2>דוח שעות חודשי – ${target}</h2>
        <p>${settings.office_name}</p>
        <table border="1" cellpadding="6" cellspacing="0">
          <tr><th>עובד/ת</th><th>שעות נוכחות</th><th>ימי היעדרות</th></tr>
          ${rows || "<tr><td colspan='3'>אין דיווחים</td></tr>"}
        </table>
        <p>הופק אוטומטית ממערכת ניהול השעות.</p>
      </div>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "reports@resend.dev",
        to: settings.accountant_email,
        subject: `דוח שעות חודשי – ${target} – ${settings.office_name}`,
        html,
      }),
    });
    if (!resp.ok) throw new Error(await resp.text());

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
