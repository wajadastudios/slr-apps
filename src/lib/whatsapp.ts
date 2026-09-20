import "server-only";

// Fonnte answers HTTP 200 even when it did not send anything (device
// disconnected, quota used up, bad number), so the JSON body is checked and
// any failure is logged where it can be found in the server logs.
export async function sendWhatsApp(phone: string | null | undefined, message: string): Promise<boolean> {
  const token = process.env.FONNTE_API_KEY;
  const target = phone?.replace(/[^0-9]/g, "");
  if (!token) {
    console.error("sendWhatsApp skipped: FONNTE_API_KEY is not set");
    return false;
  }
  if (!target) {
    console.error("sendWhatsApp skipped: no target number");
    return false;
  }

  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ target, message, countryCode: "62" }),
    });
    const body = (await res.json().catch(() => null)) as { status?: boolean; reason?: string } | null;
    if (!res.ok || body?.status === false) {
      console.error("sendWhatsApp not delivered:", res.status, body?.reason ?? body);
      return false;
    }
    return true;
  } catch (err) {
    console.error("sendWhatsApp failed:", err);
    return false;
  }
}
