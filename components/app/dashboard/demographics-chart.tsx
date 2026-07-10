"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { AgeGenderBand, GenderTotals } from "@/lib/dashboard/types";

/** Series colors from app theme tokens (`--chart-*` in globals.css). */
const chartConfig = {
  male: {
    label: "Male",
    color: "var(--chart-1)",
  },
  female: {
    label: "Female",
    color: "var(--chart-3)",
  },
  unassigned: {
    label: "Unassigned",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig;

export function DemographicsChart({
  bands,
  totals,
}: {
  bands: AgeGenderBand[];
  totals: GenderTotals;
}) {
  const data = bands.map((b) => ({
    band: b.label,
    male: b.male,
    female: b.female,
    unassigned: b.unassigned,
  }));

  const hasAny = data.some(
    (d) => d.male + d.female + d.unassigned > 0,
  );

  if (!hasAny) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No age/gender demographics yet. Add member dates of birth and gender
        to populate this chart.
      </p>
    );
  }

  return (
    <div className="w-full">
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-[280px] w-full"
        initialDimension={{ width: 720, height: 280 }}
      >
        <BarChart
          accessibilityLayer
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="band"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            width={40}
            allowDecimals={false}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)" }}
            content={
              <ChartTooltipContent
                indicator="dot"
                labelFormatter={(label) => `Age ${label}`}
              />
            }
          />
          {/* Stack bottom → top: unassigned, female, male (theme chart colors) */}
          <Bar
            dataKey="unassigned"
            stackId="a"
            fill="var(--color-unassigned)"
            maxBarSize={56}
          />
          <Bar
            dataKey="female"
            stackId="a"
            fill="var(--color-female)"
            maxBarSize={56}
          />
          <Bar
            dataKey="male"
            stackId="a"
            fill="var(--color-male)"
            radius={[4, 4, 0, 0]}
            maxBarSize={56}
          />
        </BarChart>
      </ChartContainer>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 px-1 text-sm text-muted-foreground">
        <LegendDot
          color={chartConfig.male.color}
          label={`Male: ${totals.male.toLocaleString()}`}
        />
        <LegendDot
          color={chartConfig.female.color}
          label={`Female: ${totals.female.toLocaleString()}`}
        />
        <LegendDot
          color={chartConfig.unassigned.color}
          label={`Unassigned: ${totals.unassigned.toLocaleString()}`}
        />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}
