import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://mainstream-4c6.pages.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID");
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!razorpayKeyId || !razorpayKeySecret || !supabaseUrl || !serviceRoleKey) {
      return json({ error: "Payment service is not configured." }, 500);
    }

    const body = await req.json();
    const inputItems = body.items;
    const shipping = body.shipping || {};
    if (!Array.isArray(inputItems) || inputItems.length === 0) {
      return json({ error: "Your cart is empty." }, 400);
    }
    const requiredShipping = ["firstName", "lastName", "email", "phone", "address", "city", "pincode", "state"];
    if (requiredShipping.some((key) => !String(shipping[key] || "").trim())) {
      return json({ error: "Please complete your delivery details before payment." }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(shipping.email))) {
      return json({ error: "Enter a valid email address." }, 400);
    }

    const normalized = inputItems.map((item: Record<string, unknown>) => ({
      slug: String(item.slug || "").trim().toLowerCase(),
      size: String(item.size || "M").trim().toUpperCase(),
      color: String(item.color || "Black").trim(),
      quantity: Number(item.quantity || 1),
    }));
    if (normalized.some((item) =>
      !/^[a-z0-9-]{1,80}$/.test(item.slug) ||
      !["S", "M", "L", "XL", "XXL"].includes(item.size) ||
      !["Black", "Beige", "White"].includes(item.color) ||
      !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10
    )) {
      return json({ error: "One or more cart items are invalid." }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const slugs = [...new Set(normalized.map((item) => item.slug))];
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("slug,name,price,stock,active")
      .in("slug", slugs)
      .eq("active", true);

    if (productsError) throw productsError;
    const productMap = new Map((products || []).map((product) => [product.slug, product]));
    const orderItems = normalized.map((item) => {
      const product = productMap.get(item.slug);
      if (!product) throw new Error(`Product "${item.slug}" is unavailable.`);
      if (Number(product.stock) < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}.`);
      }
      const unitPrice = Math.round(Number(product.price) * 100) / 100;
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error("Invalid product price.");
      return {
        slug: product.slug,
        name: product.name,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        unit_price: unitPrice,
        line_total: unitPrice * item.quantity,
      };
    });

    const totalRupees = orderItems.reduce((sum, item) => sum + item.line_total, 0);
    const amountPaise = Math.round(totalRupees * 100);
    if (amountPaise < 100 || amountPaise > 50000000) {
      return json({ error: "The order amount is outside the supported range." }, 400);
    }

    const orderNumber = "MS" + crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
    const auth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const rpResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: orderNumber,
        notes: { mainstream_order_number: orderNumber },
      }),
    });
    const rpOrder = await rpResponse.json();
    if (!rpResponse.ok) {
      console.error("Razorpay order creation failed", rpOrder);
      return json({ error: "Razorpay could not create the payment order. Please try again." }, 502);
    }

    const customerName = `${shipping.firstName} ${shipping.lastName}`.trim();
    const { error: insertError } = await supabase.from("orders").insert({
      order_number: orderNumber,
      customer_name: customerName,
      customer_email: String(shipping.email).trim(),
      customer_phone: String(shipping.phone).trim(),
      shipping_address: String(shipping.address).trim(),
      shipping_city: String(shipping.city).trim(),
      shipping_pincode: String(shipping.pincode).trim(),
      shipping_state: String(shipping.state).trim(),
      items: orderItems,
      total: totalRupees,
      payment_method: "Razorpay",
      payment_status: "created",
      order_status: "pending_payment",
      razorpay_order_id: rpOrder.id,
    });
    if (insertError) {
      console.error("Order record insert failed", insertError);
      return json({ error: "Unable to save the order. Please contact the store before retrying." }, 500);
    }

    return json({
      keyId: razorpayKeyId,
      razorpayOrderId: rpOrder.id,
      orderNumber,
      amount: amountPaise,
      currency: "INR",
      total: totalRupees,
      items: orderItems,
      customer: { name: customerName, email: shipping.email, contact: shipping.phone },
    });
  } catch (error) {
    console.error("create-razorpay-order error", error);
    return json({ error: error instanceof Error ? error.message : "Unable to start payment." }, 400);
  }
});
