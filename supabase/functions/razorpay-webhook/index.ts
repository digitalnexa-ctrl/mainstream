import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://mainstream-4c6.pages.dev",
  "Access-Control-Allow-Headers": "content-type, x-razorpay-signature, x-razorpay-event-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function toHex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
      return json({ error: "Webhook is not configured." }, 500);
    }

    const rawBody = await req.text();
    const received = req.headers.get("x-razorpay-signature") || "";
    const hmacKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = toHex(new Uint8Array(await crypto.subtle.sign(
      "HMAC", hmacKey, new TextEncoder().encode(rawBody),
    )));
    const a = new TextEncoder().encode(digest);
    const b = new TextEncoder().encode(received);
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a[i] ^ b[i];
    if (diff !== 0) return json({ error: "Invalid webhook signature." }, 401);

    const event = JSON.parse(rawBody);
    if (event.event !== "payment.captured") return json({ received: true, ignored: true });

    const payment = event.payload?.payment?.entity;
    if (!payment?.order_id || !payment?.id || payment.status !== "captured") {
      return json({ error: "Invalid captured payment payload." }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: order, error: findError } = await supabase
      .from("orders")
      .select("id,total,payment_status")
      .eq("razorpay_order_id", payment.order_id)
      .single();
    if (findError || !order) return json({ error: "Matching MAINSTREAM order not found." }, 404);
    if (Math.round(Number(order.total) * 100) !== Number(payment.amount) || payment.currency !== "INR") {
      return json({ error: "Webhook payment amount does not match the order." }, 400);
    }

    if (order.payment_status !== "paid") {
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          order_status: "processing",
          payment_method: payment.method || "Razorpay",
          razorpay_payment_id: payment.id,
          paid_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      if (updateError) throw updateError;
    }

    return json({ received: true, paid: true });
  } catch (error) {
    console.error("razorpay-webhook error", error);
    return json({ error: "Webhook processing failed." }, 500);
  }
});
