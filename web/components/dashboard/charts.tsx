"use client";

import type { ReactElement } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";

const COLORS = ["#00E5A0", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

function ChartContainer({ children }: { children: ReactElement }) {
  return (
    <div className="h-[280px] w-full min-h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function ApplicationActivityChart({ data }: { data: { date: string; applications: number }[] }) {
  if (!data.length) {
    return <EmptyChart message="No application activity yet" />;
  }
  return (
    <ChartContainer>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorApps" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00E5A0" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#00E5A0" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
        <Area type="monotone" dataKey="applications" stroke="#00E5A0" fill="url(#colorApps)" strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  );
}

export function UpcomingDeadlinesChart({ data }: { data: { company: string; daysLeft: number }[] }) {
  if (!data.length) return <EmptyChart message="No upcoming deadlines" />;
  return (
    <ChartContainer>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="company" stroke="hsl(var(--muted-foreground))" fontSize={11} />
        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
        <Bar dataKey="daysLeft" fill="#00E5A0" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

export function StatusPieChart({ data }: { data: { _id: string; count: number }[] }) {
  if (!data.length) return <EmptyChart message="No status data" />;
  const chartData = data.map((d) => ({ name: d._id, value: d.count }));
  return (
    <ChartContainer>
      <PieChart>
        <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value">
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
      </PieChart>
    </ChartContainer>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <p className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">{message}</p>
  );
}
