"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Bar,
  BarChart,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ef4444", "#0ea5e9", "#8b5cf6", "#14b8a6"];

export function ExpensePie({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) {
    return <p className="text-sm text-muted-foreground">Sin egresos este mes.</p>;
  }
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => Number(v ?? 0).toLocaleString("es-AR")} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyBars({ data }: { data: { name: string; ingresos: number; egresos: number }[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="name" fontSize={12} />
          <YAxis fontSize={12} />
          <Tooltip formatter={(v) => Number(v ?? 0).toLocaleString("es-AR")} />
          <Bar dataKey="ingresos" fill="#10b981" radius={6} />
          <Bar dataKey="egresos" fill="#ef4444" radius={6} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
