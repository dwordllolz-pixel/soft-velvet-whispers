export type ChartConfig = Record<string, { label?: unknown; color?: string }>;

export function ChartContainer({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export const ChartTooltip = () => null;
export const ChartTooltipContent = () => null;
export const ChartLegend = () => null;
export const ChartLegendContent = () => null;
export const ChartStyle = () => null;