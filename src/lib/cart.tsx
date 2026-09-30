import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type Dish } from "./api";
import { useAuth } from "./auth";

type CartItem = { dishId: string; qty: number };
type Role = "student" | "vendor" | "both";
type Ctx = {
  items: CartItem[];
  add: (dish: Dish) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
  total: number;
  count: number;
  addPulse: number;
  detailed: { dish: Dish; qty: number }[];
  role: Role;
  setRole: (role: Role) => void;
};

const CartCtx = createContext<Ctx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [catalog, setCatalog] = useState<Record<string, Dish>>({});
  const [role, setRoleState] = useState<Role>("student");
  const [hydrated, setHydrated] = useState(false);
  const [addPulse, setAddPulse] = useState(0);
  const requested = useRef(new Set<string>());

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("nb-cart") || "[]") as CartItem[];
      setItems(saved.filter((item) => /^[0-9a-f-]{36}$/i.test(item.dishId) && Number.isInteger(item.qty) && item.qty > 0));
      const savedRole = localStorage.getItem("nb-role") as Role | null;
      if (savedRole === "student" || savedRole === "vendor" || savedRole === "both") setRoleState(savedRole);
    } catch {
      setItems([]);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (user) setRoleState(user.view_preference === "seller" ? "vendor" : user.view_preference === "both" ? "both" : "student");
  }, [user]);

  useEffect(() => {
    if (hydrated) localStorage.setItem("nb-cart", JSON.stringify(items));
    const ids = items.map((item) => item.dishId).filter((id) => !catalog[id] && !requested.current.has(id));
    if (ids.length) {
      ids.forEach((id) => requested.current.add(id));
      Promise.all(ids.map((id) => api.get<Dish>("/dishes/" + encodeURIComponent(id)).catch(() => null))).then(
        (dishes) =>
          setCatalog((current) => ({
            ...current,
            ...Object.fromEntries(dishes.filter((dish): dish is Dish => dish !== null).map((dish) => [dish.id, dish])),
          })),
      );
    }
  }, [items, hydrated, catalog]);

  const add = (dish: Dish) => {
    const firstVendor = items.map((item) => catalog[item.dishId]?.vendor_id).find(Boolean);
    if (firstVendor && firstVendor !== dish.vendor_id) {
      if (!window.confirm("Orders can include one kitchen at a time. Replace your current cart?")) return;
      setItems([{ dishId: dish.id, qty: 1 }]);
      setCatalog((current) => ({ ...current, [dish.id]: dish }));
      setAddPulse((current) => current + 1);
      return;
    }
    setCatalog((current) => ({ ...current, [dish.id]: dish }));
    setAddPulse((current) => current + 1);
    setItems((current) => {
      const id = dish.id;
      const found = current.find((item) => item.dishId === id);
      return found
        ? current.map((item) => (item.dishId === id ? { ...item, qty: item.qty + 1 } : item))
        : [...current, { dishId: id, qty: 1 }];
    });
  };
  const remove = (id: string) => setItems((current) => current.filter((item) => item.dishId !== id));
  const setQty = (id: string, qty: number) =>
    setItems((current) =>
      qty <= 0
        ? current.filter((item) => item.dishId !== id)
        : current.map((item) => (item.dishId === id ? { ...item, qty } : item)),
    );
  const clear = () => setItems([]);
  const setRole = (next: Role) => {
    setRoleState(next);
    localStorage.setItem("nb-role", next);
  };
  const detailed = useMemo(
    () =>
      items
        .filter((item) => catalog[item.dishId])
        .map((item) => ({ dish: catalog[item.dishId], qty: item.qty })),
    [items, catalog],
  );
  const total = detailed.reduce((sum, item) => sum + item.dish.price_pkr * item.qty, 0);
  const count = items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <CartCtx.Provider value={{ items, add, remove, setQty, clear, total, count, addPulse, detailed, role, setRole }}>
      {children}
    </CartCtx.Provider>
  );
}

export function useCart() {
  const context = useContext(CartCtx);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
