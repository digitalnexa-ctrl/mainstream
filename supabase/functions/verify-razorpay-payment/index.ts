import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://mainstream-4c6.pages.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!keyId || !keySecret || !supabaseUrl || !serviceRoleKey) {
      return json({ error: "Payment verification is not configured." }, 500);
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
    if (![razorpay_order_id, razorpay_payment_id, razorpay_signature].every((v) => typeof v === "string" && v.length > 0)) {
      return json({ error: "Missing Razorpay payment verification fields." }, 400);
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(keySecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signed = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${razorpay_order_id}|${razorpay_payment_id}`),
    );
    const expected = toHex(new Uint8Array(signed));
    // Compare the HMAC hex strings without an early exit.
    const expectedBytes = new TextEncoder().encode(expected);
    const receivedBytes = new TextEncoder().encode(razorpay_signature);
    let diff = expectedBytes.length ^ receivedBytes.length;
    for (let i = 0; i < Math.min(expectedBytes.length, receivedBytes.length); i++) {
      diff |= expectedBytes[i] ^ receivedBytes[i];
    }
    if (diff !== 0) return json({ error: "Payment signature verification failed." }, 400);

    const auth = btoa(`${keyId}:${keySecret}`);
    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`, {
      headers: { "Authorization": `Basic ${auth}` },
    });
    const payment = await paymentResponse.json();
    if (!paymentResponse.ok ||
        payment.order_id !== razorpay_order_id ||
        !["captured"].includes(payment.status)) {
      console.error("Razorpay payment not captured", payment);
      return json({ error: "Razorpay has not confirmed a captured payment yet." }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: order, error: findError } = await supabase
      .from("orders")
      .select("id,order_number,total,items,payment_status,razorpay_order_id")
      .eq("razorpay_order_id", razorpay_order_id)
      .single();
    if (findError || !order) return json({ error: "Order record was not found." }, 404);

    if (Math.round(Number(order.total) * 100) !== Number(payment.amount) ||
        payment.currency !== "INR") {
      return json({ error: "Payment amount does not match the order." }, 400);
    }

    const { data: completion, error: completionError } = await supabase.rpc(
      "complete_razorpay_order",
      {
        p_razorpay_order_id: razorpay_order_id,
        p_payment_id: razorpay_payment_id,
        p_payment_method: payment.method || "Razorpay",
      },
    );
    if (completionError) throw completionError;

    return json({
      verified: true,
      paid: true,
      stock: completion,
      orderNumber: order.order_number,
      total: order.total,
      items: order.items,
      paymentId: razorpay_payment_id,
      paymentMethod: payment.method || "Razorpay",
    });
  } catch (error) {
    console.error("verify-razorpay-payment error", error);
    return json({ error: "Unable to verify payment. Please contact MAINSTREAM support." }, 500);
  }
});
