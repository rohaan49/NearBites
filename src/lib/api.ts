export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1";

const SESSION_KEY = "nb-session";

type Session = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null) {
  if (typeof window === "undefined") return;
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body.detail === "string"
        ? body.detail
        : typeof body.error?.message === "string"
          ? body.error.message
          : "Request failed";
    throw new ApiError(response.status, message);
  }
  return body as T;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const session = readSession();
  const headers = new Headers(options.headers);
  if (session) headers.set("Authorization", "Bearer " + session.access_token);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(API_BASE + path, { ...options, headers });
  if (response.status === 401 && session && retry && path !== "/auth/refresh") {
    try {
      const renewed = await apiRequest<Session>(
        "/auth/refresh",
        {
          method: "POST",
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        },
        false,
      );
      saveSession(renewed);
      return apiRequest<T>(path, options, false);
    } catch {
      saveSession(null);
    }
  }
  return parseResponse<T>(response);
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body: unknown, headers?: HeadersInit) =>
    apiRequest<T>(path, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
      headers,
    }),
  patch: <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  role: "buyer" | "seller" | "admin";
  view_preference: "buyer" | "seller" | "both";
  email_verified: boolean;
};

export type Vendor = {
  id: string;
  name: string;
  chef: string;
  area: string;
  bio: string;
  status: string;
  training_verified: boolean;
  location_set: boolean;
  distance_km?: number | null;
  rating?: number | null;
  review_count?: number;
  is_sample: boolean;
};

export type Dish = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  area: string;
  distance_km?: number | null;
  name: string;
  description: string;
  price_pkr: number;
  portion_size: string;
  image_url: string | null;
  portions_available: number;
  portions_total: number;
  tag: string | null;
  status: string;
  is_sample: boolean;
  is_demo: boolean;
};

export type Order = {
  id: string;
  vendor_id: string;
  status: string;
  payment_method: string;
  payment_status: string;
  subtotal_pkr: number;
  delivery_fee_pkr: number;
  total_pkr: number;
  placed_at: string;
  items: {
    dish_id: string;
    name: string;
    quantity: number;
    unit_price_pkr: number;
  }[];
};

export type Address = {
  id: string;
  label: string;
  line1: string;
  area: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
};
