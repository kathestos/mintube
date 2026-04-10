import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { buildSubscriptionFeed } from "@/lib/subscription-feed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (
    !token?.accessToken ||
    token.error === "RefreshAccessTokenError"
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const videos = await buildSubscriptionFeed(token.accessToken as string);
    return NextResponse.json({ videos });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Feed error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
