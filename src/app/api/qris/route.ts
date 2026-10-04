import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// "Unduh QRIS": the QRIS image lives in Supabase Storage (another origin),
// where the browser ignores <a download>. Serving it from here as an
// attachment makes the button save the file on every device. The image is
// already public on the payment pages; the URL comes only from the admin's
// site_settings, never from the request.
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.from("site_settings").select("value").eq("key", "qris_image_url").maybeSingle();
  const url = data?.value?.trim();
  if (!url || !/^https:\/\//.test(url)) return new NextResponse("QRIS belum tersedia", { status: 404 });

  const upstream = await fetch(url, { cache: "no-store" });
  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !type.startsWith("image/")) {
    return new NextResponse("QRIS belum tersedia", { status: 404 });
  }
  const ext = type.split("/")[1]?.split(";")[0].replace("jpeg", "jpg") || "png";

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="QRIS-Sari-Les-Renang.${ext}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
