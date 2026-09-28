"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTr } from "@/lib/dates";
import { tl, tlShort } from "@/lib/money";

const axis = { stroke: "var(--color-axis)", fontSize: 11, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  contentStyle: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-line)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--color-fg)",
  },
  labelStyle: { color: "var(--color-muted)", marginBottom: 4 },
};

// Tek seri: toplam nakit bakiyesi (vadesiz hesaplar) zamana göre
export function BalanceChart({ data, height = 280 }: { data: { date: string; total: number }[]; height?: number }) {
  const hasNegative = data.some((d) => d.total < 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-series-1)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="var(--color-series-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--color-grid)" vertical={false} />
        <XAxis dataKey="date" {...axis} tickFormatter={(d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`} minTickGap={40} />
        <YAxis {...axis} tickFormatter={(v: number) => tlShort(v)} width={80} />
        {hasNegative && <ReferenceLine y={0} stroke="var(--color-neg)" strokeDasharray="4 4" />}
        <Tooltip
          {...tooltipStyle}
          cursor={{ stroke: "var(--color-axis)", strokeWidth: 1 }}
          labelFormatter={(d) => formatTr(String(d))}
          formatter={(v) => [tl(Number(v)), "Toplam nakit"]}
        />
        <Area type="stepAfter" dataKey="total" stroke="var(--color-series-1)" strokeWidth={2} fill="url(#balFill)" activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Aylık gelir ve gider karşılaştırması
export function IncomeExpenseChart({ data }: { data: { label: string; income: number; expense: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={2}>
        <CartesianGrid stroke="var(--color-grid)" vertical={false} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} tickFormatter={(v: number) => tlShort(v)} width={80} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "var(--color-subtle)" }} formatter={(v, name) => [tl(Number(v)), name]} />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-muted)" }} iconType="circle" iconSize={8} />
        <Bar dataKey="income" name="Gelir" fill="var(--color-series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expense" name="Gider" fill="var(--color-series-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
