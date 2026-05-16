import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { ChartHint } from "../../lib/sqlApi";

const COLORS = ["#0ea5e9", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981", "#f43f5e"];

interface Props {
  hint: ChartHint;
  columns: string[];
  rows: unknown[][];
}

export default function ChartView({ hint, columns, rows }: Props) {
  if (hint.type === "none" || rows.length === 0) return null;
  const x = hint.x ?? columns[0];
  const y = hint.y ?? columns[1];
  const xi = columns.indexOf(x);
  const yi = columns.indexOf(y);
  if (xi < 0 || yi < 0) return null;

  const data = rows.slice(0, 50).map((r) => ({ x: String(r[xi]), y: Number(r[yi]) }));

  return (
    <div className="h-64 w-full mt-3">
      <ResponsiveContainer>
        {hint.type === "bar" ? (
          <BarChart data={data}>
            <XAxis dataKey="x" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="y" fill="#0ea5e9" />
          </BarChart>
        ) : hint.type === "line" ? (
          <LineChart data={data}>
            <XAxis dataKey="x" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="y" stroke="#0ea5e9" />
          </LineChart>
        ) : (
          <PieChart>
            <Tooltip />
            <Pie data={data} dataKey="y" nameKey="x" outerRadius={90}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
