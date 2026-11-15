export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const mealInput = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm";
export const mealButton = "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50";
export const mealSecondary = "rounded-xl border border-border px-4 py-2.5 text-sm font-semibold disabled:opacity-50";

export type Plan = {
  id: string;
  kitchen_id: string;
  kitchen_name: string;
  area: string;
  is_demo: boolean;
  name: string;
  price_pkr: number;
  delivery_fee_pkr: number;
  delivery_time: string;
  capacity: number;
  published: boolean;
  menu: Record<string, { id: string; name: string; description: string }[]>;
};

export type Delivery = {
  id: string;
  date: string;
  time: string;
  dish_name: string;
  total_pkr: number;
  status: "scheduled" | "skipped" | "preparing" | "delivered" | "cancelled" | "missed" | "unavailable";
};

export type Subscription = {
  id: string;
  plan_name: string;
  kitchen_name: string;
  is_demo: boolean;
  start_date: string;
  end_date: string;
  delivery_address: string;
  status: "active" | "ended" | "cancelled";
  deliveries: Delivery[];
};
