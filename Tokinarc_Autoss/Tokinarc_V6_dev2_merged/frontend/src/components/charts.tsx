/**
 * Tokinarc frontend — src/components/charts.tsx
 * Biểu đồ cột tiền VND dùng chung (recharts), bám theme tối + lửa hàn.
 */
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { compactVnd } from '@/lib/crm'

interface Row { label: string; value: number }

const PALETTE = [
  'rgb(var(--chart-1))', 'rgb(var(--chart-2))', 'rgb(var(--chart-3))',
  'rgb(var(--chart-4))', 'rgb(var(--chart-5))', 'rgb(var(--chart-6))',
]

function MoneyTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-ink-3 border border-line rounded-md px-3 py-1.5 text-xs">
      <div className="text-txt-2">{payload[0].payload.label}</div>
      <div className="font-semibold text-flame">{compactVnd(payload[0].value)}</div>
    </div>
  )
}

export function MoneyBarChart({ data, height = 240, multicolor = false }: {
  data: Row[]; height?: number; multicolor?: boolean
}) {
  if (!data.length) {
    return <div className="text-txt-2 text-sm text-center py-10">Chưa có dữ liệu.</div>
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
        <XAxis dataKey="label" stroke="rgb(var(--txt-2))" fontSize={11} tickLine={false} axisLine={{ stroke: 'rgb(var(--line))' }} />
        <YAxis stroke="rgb(var(--txt-2))" fontSize={11} tickLine={false} axisLine={false}
          tickFormatter={(v) => compactVnd(v).replace('₫ ', '')} width={56} />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(224,92,27,0.08)' }} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={64}>
          {data.map((_, i) => (
            <Cell key={i} fill={multicolor ? PALETTE[i % PALETTE.length] : 'rgb(var(--flame))'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
