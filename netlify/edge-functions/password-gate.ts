import type { Config, Context } from "@netlify/edge-functions";

// Password gate for the whole site.
// The password is stored in Netlify as the SITE_PASSWORD environment variable,
// never in this code. If SITE_PASSWORD is not set, the site stays open.

const COOKIE = "na_access";
const LOGIN_PATH = "/__login";
const MAX_AGE = 60 * 60 * 24 * 30; // stay signed in for 30 days

async function tokenFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(`nicolearata-portfolio:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function loginPage(showError: boolean, next: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Nicole Arata — Portfolio</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,400;1,300;1,400&family=Inter+Tight:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root { --cream:#f7f2ea; --ink:#1a1410; --ember:#d9531e; --ember-deep:#a8391a; --rule:rgba(26,20,16,.15); }
  * { box-sizing:border-box; margin:0; }
  body { min-height:100vh; display:grid; place-items:center; background:var(--cream); color:var(--ink);
         font-family:'Inter Tight',system-ui,sans-serif; padding:24px; }
  .card { width:100%; max-width:420px; }
  .logo { font-family:'Fraunces',serif; font-size:22px; display:flex; align-items:center; gap:10px; margin-bottom:48px; }
  .logo::before { content:""; width:8px; height:8px; border-radius:50%; background:var(--ember); }
  h1 { font-family:'Fraunces',serif; font-weight:400; font-size:44px; line-height:1.05; letter-spacing:-.03em; margin-bottom:16px; }
  h1 em { font-style:italic; color:var(--ember-deep); font-weight:300; }
  p { font-size:15px; line-height:1.6; color:rgba(26,20,16,.7); margin-bottom:32px; }
  label { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.18em; color:var(--ember); font-weight:600; margin-bottom:10px; }
  input { width:100%; padding:16px; font-size:16px; font-family:inherit; border:1px solid var(--rule); background:#fff; color:var(--ink); outline:none; }
  input:focus { border-color:var(--ember); }
  button { margin-top:16px; width:100%; padding:16px; border:0; background:var(--ink); color:var(--cream);
           font-family:inherit; font-size:13px; letter-spacing:.14em; text-transform:uppercase; cursor:pointer; }
  button:hover { background:var(--ember-deep); }
  .error { color:var(--ember-deep); font-size:14px; margin-top:12px; }
  .contact { margin-top:40px; font-size:13px; color:rgba(26,20,16,.6); }
  .contact a { color:var(--ember-deep); }
</style>
</head>
<body>
  <form class="card" method="POST" action="${LOGIN_PATH}">
    <div class="logo">Nicole Arata</div>
    <h1>Welcome <em>in.</em></h1>
    <p>This portfolio is password-protected. Enter the password you were sent to view the work.</p>
    <label for="pw">Password</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>
    <input type="hidden" name="next" value="${next.replace(/"/g, "&quot;")}">
    <button type="submit">View Portfolio →</button>
    ${showError ? '<div class="error">That password didn\'t work. Please try again.</div>' : ""}
    <div class="contact">Need access? <a href="mailto:Nicoleaarata@gmail.com">Nicoleaarata@gmail.com</a></div>
  </form>
</body>
</html>`;
  return new Response(html, {
    status: showError ? 401 : 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function safeNext(value: string | null): string {
  // Only allow redirects back to a path on this site.
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default async (request: Request, context: Context) => {
  const password = Netlify.env.get("SITE_PASSWORD");
  if (!password) return context.next(); // no password set: site is open

  const url = new URL(request.url);
  const expected = await tokenFor(password);

  if (url.pathname === LOGIN_PATH && request.method === "POST") {
    const form = await request.formData();
    const attempt = String(form.get("password") ?? "");
    const next = safeNext(String(form.get("next") ?? "/"));
    if ((await tokenFor(attempt)) === expected) {
      return new Response(null, {
        status: 303,
        headers: {
          location: next,
          "set-cookie": `${COOKIE}=${expected}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
          "cache-control": "no-store",
        },
      });
    }
    return loginPage(true, next);
  }

  if (context.cookies.get(COOKIE) === expected) {
    if (url.pathname === LOGIN_PATH) return Response.redirect(new URL("/", url), 303);
    return context.next();
  }

  return loginPage(false, url.pathname + url.search);
};

export const config: Config = {
  path: "/*",
  // Icons stay public so the browser tab shows them on the login screen too.
  excludedPath: ["/favicon.svg", "/favicon-32.png", "/apple-touch-icon.png"],
};
