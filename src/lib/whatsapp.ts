import "server-only";

export async function sendWhatsApp(phone: string | null | undefined, message: string) {
  const token = process.env.FONNTE_API_KEY;
  const target = phone?.replace(/[^0-9]/g, "");
  if (!token || !target) return;

  try {
    await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ target, message }),
    });
  } catch (err) {
    console.error("sendWhatsApp failed:", err);
  }
}
