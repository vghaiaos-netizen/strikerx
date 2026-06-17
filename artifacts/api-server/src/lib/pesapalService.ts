import { logger } from "./logger";

const PESAPAL_BASE = process.env.PESAPAL_ENV === "production"
  ? "https://pay.pesapal.com/v3"
  : "https://cybqa.pesapal.com/pesapalv3";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  try {
    const res = await fetch(`${PESAPAL_BASE}/api/Auth/RequestToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ consumer_key: consumerKey, consumer_secret: consumerSecret }),
    });
    const data = await res.json() as { token?: string; expiresDate?: string; error?: unknown };
    if (!data.token) { logger.error({ data }, "Pesapal auth failed"); return null; }
    const expiresAt = data.expiresDate ? new Date(data.expiresDate).getTime() : Date.now() + 3600_000;
    cachedToken = { token: data.token, expiresAt };
    return data.token;
  } catch (err) {
    logger.error({ err }, "Pesapal auth error");
    return null;
  }
}

export async function pesapalStkPush(params: {
  phoneNumber: string;
  amountKes: number;
  reference: string;
  description: string;
  callbackUrl: string;
  notificationId: string;
}): Promise<{ orderTrackingId: string; redirectUrl?: string } | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const payload = {
    id: params.reference,
    currency: "KES",
    amount: params.amountKes,
    description: params.description,
    callback_url: params.callbackUrl,
    notification_id: params.notificationId,
    billing_address: {
      phone_number: params.phoneNumber,
    },
  };

  try {
    const res = await fetch(`${PESAPAL_BASE}/api/Transactions/SubmitOrderRequest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json() as { order_tracking_id?: string; redirect_url?: string; error?: unknown; status?: string };
    if (!data.order_tracking_id) { logger.error({ data }, "Pesapal STK push failed"); return null; }
    return { orderTrackingId: data.order_tracking_id, redirectUrl: data.redirect_url };
  } catch (err) {
    logger.error({ err }, "Pesapal STK push error");
    return null;
  }
}

export async function pesapalGetTransactionStatus(orderTrackingId: string): Promise<{
  status: "PENDING" | "COMPLETED" | "FAILED" | "INVALID";
  paymentMethod?: string;
  amount?: number;
} | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(
      `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
      { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } },
    );
    const data = await res.json() as { payment_status_description?: string; amount?: number; payment_method?: string };
    const raw = (data.payment_status_description ?? "PENDING").toUpperCase();
    const status = (["COMPLETED", "FAILED", "INVALID"].includes(raw) ? raw : "PENDING") as "PENDING" | "COMPLETED" | "FAILED" | "INVALID";
    return { status, paymentMethod: data.payment_method, amount: data.amount };
  } catch (err) {
    logger.error({ err }, "Pesapal status check error");
    return null;
  }
}

export function isPesapalConfigured(): boolean {
  return !!(process.env.PESAPAL_CONSUMER_KEY && process.env.PESAPAL_CONSUMER_SECRET && process.env.PESAPAL_IPN_ID);
}
