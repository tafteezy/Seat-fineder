// Edge Function: emails the couple their private links once, right after they publish.
// Secrets to set (see README): RESEND_API_KEY, MAIL_FROM, SITE_URL
// The links are built here from SITE_URL and the email goes only to the address stored with the wedding,
// so nobody can use this function to send arbitrary mail or links.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { slug, token } = await req.json();
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: id } = await db.rpc("token_ok", { p_slug: slug, p_token: token });
  if (!id) return reply({ error: "Not allowed" }, 403);
  const { data: w } = await db.from("weddings").select("email,n1,n2,emailed").eq("id", id).single();
  if (!w || w.emailed) return reply({ sent: false });

  const site = Deno.env.get("SITE_URL")!.replace(/\/$/, "");
  const siteUrl = `${site}/#/${slug}`;
  const manageUrl = `${site}/#/manage/${slug}/${token}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("MAIL_FROM"),
      to: w.email,
      subject: `Your seat finder is ready, ${w.n1} & ${w.n2}`,
      html: `<p>Your seat finder is live.</p>
             <p><b>Guest link (put this in your QR code):</b><br><a href="${siteUrl}">${siteUrl}</a></p>
             <p><b>Your private management link:</b><br><a href="${manageUrl}">${manageUrl}</a><br>Keep it safe: anyone with it can change your guest list.</p>`,
    }),
  });
  if (!res.ok) return reply({ sent: false }, 502);
  await db.from("weddings").update({ emailed: true }).eq("id", id);
  return reply({ sent: true });
});
