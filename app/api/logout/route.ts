import { clearSessionCookie, requestIsSecure } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  const response = Response.json({ ok: true });
  response.headers.set("set-cookie", clearSessionCookie(requestIsSecure(request)));
  return response;
}
