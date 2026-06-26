import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  trainingChartColors,
  trainingChartMargin,
  trainingChartTooltipStyle
} from "../chartConfig";
import type { TrainingTrendPoint } from "../types";

interface TrainingTrendChartsProps {
  points: TrainingTrendPoint[];
}

export function TrainingTrendCharts({ points }: TrainingTrendChartsProps) {
  const loadPoints = points.filter((point) => point.trainingLoad !== undefined);
  const hrvPoints = points.filter(
    (point) => point.avgSleepHrv !== undefined || point.sleepHrvBase !== undefined
  );

  return (
    <div className="training-chart-grid">
      <section className="panel training-chart-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Training Load</p>
            <h2>Last 7 days</h2>
          </div>
        </div>
        {loadPoints.length > 0 ? (
          <div className="training-chart-shell">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={loadPoints} margin={trainingChartMargin}>
                <defs>
                  <linearGradient id="trainingLoadFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={trainingChartColors.accent}
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="100%"
                      stopColor={trainingChartColors.accent}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={trainingChartColors.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: trainingChartColors.text, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: trainingChartColors.text, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip contentStyle={trainingChartTooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="trainingLoad"
                  name="Load"
                  stroke={trainingChartColors.accent}
                  fill="url(#trainingLoadFill)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: trainingChartColors.accent }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="training-empty-chart">No training load data this week.</p>
        )}
      </section>

      <section className="panel training-chart-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">HRV vs Baseline</p>
            <h2>Last 7 days</h2>
          </div>
        </div>
        {hrvPoints.length > 0 ? (
          <div className="training-chart-shell">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hrvPoints} margin={trainingChartMargin}>
                <CartesianGrid stroke={trainingChartColors.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: trainingChartColors.text, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: trainingChartColors.text, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip contentStyle={trainingChartTooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="avgSleepHrv"
                  name="HRV"
                  stroke={trainingChartColors.accent}
                  strokeWidth={2}
                  dot={{ r: 3, fill: trainingChartColors.accent }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="sleepHrvBase"
                  name="Baseline"
                  stroke={trainingChartColors.gold}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="training-empty-chart">No HRV data this week.</p>
        )}
      </section>
    </div>
  );
}
