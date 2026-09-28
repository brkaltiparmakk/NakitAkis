import type { ComponentProps, ReactNode } from "react";
import { tl } from "@/lib/money";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({ title, children, className, actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cx("rounded-xl border border-line bg-surface p-4 shadow-sm", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-muted">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cx("mt-1 text-xl font-semibold tabular-nums", tone === "neg" && "text-neg", tone === "pos" && "text-pos")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Money({ value, signed, className }: { value: number; signed?: boolean; className?: string }) {
  return (
    <span className={cx("tabular-nums", signed && value < 0 && "text-neg", signed && value > 0 && "text-pos", className)}>
      {tl(value)}
    </span>
  );
}

// Tarihi belirsiz alacaklar gerçekleşirse bir rakamın ne olacağını gösteren ikinci satır
export function AltLine({ value }: { value: number }) {
  return (
    <span className="mt-1 block font-medium text-fg">
      Alacaklar gelirse: {tl(Math.round(value * 100) / 100)}
    </span>
  );
}

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50",
        variant === "primary" && "bg-accent text-white hover:opacity-90",
        variant === "ghost" && "border border-line hover:bg-subtle",
        variant === "danger" && "text-neg hover:bg-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cx(inputCls, props.className)} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}

export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: color ? `${color}22` : undefined, color: color ?? undefined }}
    >
      {children}
    </span>
  );
}
