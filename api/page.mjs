import { handler } from "../netlify/functions/page.js";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const result = await handler({ queryStringParameters: Object.fromEntries(searchParams) });
  return new Response(result.body, {
    status: result.statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
