import { authRequired, passwordsMatch, requestIsSecure, sessionCookie, signSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ required: authRequired(), configured: Boolean(process.env.APP_PASSWORD) });
}

export async function POST(request: Request) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    return Response.json({ error: "服务器还没设置 APP_PASSWORD" }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  if (!passwordsMatch(String(body.password || ""), password)) {
    return Response.json({ error: "密码不对" }, { status: 401 });
  }
  const response = Response.json({ ok: true });
  response.headers.set("set-cookie", sessionCookie(signSession(password), requestIsSecure(request)));
  return response;
}
