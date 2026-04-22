const json = (body, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const clean = (value, max = 4000) => String(value || "").trim().replace(/\s+/g, " ").slice(0, max);

const getCorsHeaders = (request, env) => {
  const origin = request.headers.get("Origin");
  const allowedOrigins = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!origin) return {};
  if (!allowedOrigins.length) return {};
  if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      Vary: "Origin",
    };
  }
  return {};
};

const parseSubmission = async (request) => {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await request.json();
  }
  const formData = await request.formData();
  return Object.fromEntries(formData.entries());
};

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

async function handleContact(request, env) {
  const corsHeaders = getCorsHeaders(request, env);

  if (!env.EMAIL) {
    return json({ ok: false, message: "Email binding is not configured." }, 500, corsHeaders);
  }

  let payload;
  try {
    payload = await parseSubmission(request);
  } catch {
    return json({ ok: false, message: "Invalid form payload." }, 400, corsHeaders);
  }

  const firstName = clean(payload.firstName, 100);
  const lastName = clean(payload.lastName, 100);
  const email = clean(payload.email, 200).toLowerCase();
  const subject = clean(payload.subject, 180) || "New website inquiry";
  const message = clean(payload.message, 5000);
  const website = clean(payload.website, 200);
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Website Visitor";

  if (website) {
    return json({ ok: true, message: "Your message has been sent successfully." }, 200, corsHeaders);
  }

  if (!email || !validateEmail(email) || !message) {
    return json({ ok: false, message: "Please provide a valid email address and message." }, 400, corsHeaders);
  }

  const sentTo = env.CONTACT_TO || "info@cedarsms.com";
  const sentFrom = env.CONTACT_FROM || "noreply@cedarsms.com";
  const submittedAt = new Date().toISOString();

  const text = [
    "New Cedars Maintenance Solutions website inquiry",
    "",
    `Submitted: ${submittedAt}`,
    `Name: ${fullName}`,
    `Email: ${email}`,
    `Subject: ${subject}`,
    "",
    "Message:",
    message,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a2635;max-width:680px;margin:0 auto;">
      <h2 style="margin:0 0 16px;color:#1e3d1a;">New Cedars MS Website Inquiry</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:20px;">
        <tr><td style="padding:8px;border:1px solid #d9dee3;"><strong>Submitted</strong></td><td style="padding:8px;border:1px solid #d9dee3;">${escapeHtml(submittedAt)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #d9dee3;"><strong>Name</strong></td><td style="padding:8px;border:1px solid #d9dee3;">${escapeHtml(fullName)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #d9dee3;"><strong>Email</strong></td><td style="padding:8px;border:1px solid #d9dee3;">${escapeHtml(email)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #d9dee3;"><strong>Subject</strong></td><td style="padding:8px;border:1px solid #d9dee3;">${escapeHtml(subject)}</td></tr>
      </table>
      <div style="padding:16px;border:1px solid #d9dee3;border-radius:8px;background:#f8f8f6;white-space:pre-wrap;">${escapeHtml(message)}</div>
    </div>`;

  try {
    await env.EMAIL.send({
      to: sentTo,
      from: { email: sentFrom, name: "Cedars Maintenance Solutions Website" },
      replyTo: { email, name: fullName },
      subject: `[CedarsMS.com] ${subject}`,
      text,
      html,
    });
  } catch (error) {
    return json({ ok: false, message: error?.message || "Unable to send the email notification." }, 502, corsHeaders);
  }

  return json({ ok: true, message: "Your message has been sent successfully." }, 200, corsHeaders);
}

export { handleContact, getCorsHeaders };

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: getCorsHeaders(context.request, context.env) });
}

export async function onRequestPost(context) {
  return handleContact(context.request, context.env);
}
