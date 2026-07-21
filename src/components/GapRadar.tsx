"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useLayoutEffect, useRef } from "react";
import * as am5 from "@amcharts/amcharts5";
import * as am5radar from "@amcharts/amcharts5/radar";
import * as am5xy from "@amcharts/amcharts5/xy";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";

export type Spoke = {
  id: string;
  category: string;
  self: number | null;
  assessed: number | null;
  hasChildren: boolean;
};

// Self-claim (indigo, dashed) vs assessed (teal, filled) overlaid polygons.
// Click a spoke label to drill into it (if it has children) or select it.
export default function GapRadar({
  data,
  tierMax,
  onSelect,
  onDrill,
}: {
  data: Spoke[];
  tierMax: number;
  onSelect: (id: string) => void;
  onDrill: (id: string) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const state = useRef<any>({});
  const cb = useRef({ data, onSelect, onDrill });
  cb.current = { data, onSelect, onDrill };

  useLayoutEffect(() => {
    if (!divRef.current) return;
    // If you have an amCharts license, uncomment and add your key:
    // am5.addLicense("YOUR_LICENSE_KEY");
    const themeColors = () => {
      const d = document.documentElement.classList.contains("dark");
      return {
        ink: am5.color(d ? 0xcbd5e1 : 0x334155),
        grid: am5.color(d ? 0x334155 : 0xe2e8f0),
      };
    };
    const { ink, grid } = themeColors();
    const selfColor = am5.color(0x6366f1); // indigo — claimed
    const assessedColor = am5.color(0x0d9488); // teal — assessed

    const root = am5.Root.new(divRef.current);
    root.setThemes([am5themes_Animated.new(root)]);

    const chart = root.container.children.push(
      am5radar.RadarChart.new(root, {
        panX: false,
        panY: false,
        wheelX: "none",
        wheelY: "none",
        radius: am5.percent(80),
        innerRadius: am5.percent(14),
      }),
    );

    const xRenderer = am5radar.AxisRendererCircular.new(root, {
      minGridDistance: 8,
    });
    xRenderer.labels.template.setAll({
      fontSize: 11,
      fill: ink,
      cursorOverStyle: "pointer",
    });
    xRenderer.grid.template.setAll({ stroke: grid, strokeOpacity: 0.4 });
    const xAxis = chart.xAxes.push(
      am5xy.CategoryAxis.new(root, {
        categoryField: "category",
        renderer: xRenderer,
      }),
    );

    const yRenderer = am5radar.AxisRendererRadial.new(root, {});
    yRenderer.labels.template.setAll({ fontSize: 10, fill: ink });
    yRenderer.grid.template.setAll({ stroke: grid, strokeOpacity: 0.4 });
    const yAxis = chart.yAxes.push(
      am5xy.ValueAxis.new(root, {
        renderer: yRenderer,
        min: 0,
        max: tierMax,
        strictMinMax: true,
        maxPrecision: 0,
      }),
    );

    const mkSeries = (
      name: string,
      field: string,
      color: am5.Color,
      dashed: boolean,
    ) => {
      const s = chart.series.push(
        am5radar.RadarLineSeries.new(root, {
          name,
          xAxis,
          yAxis,
          valueYField: field,
          categoryXField: "category",
          stroke: color,
          fill: color,
          connectEnds: true,
        }),
      );
      s.strokes.template.setAll({
        strokeWidth: 2,
        strokeDasharray: dashed ? [4, 4] : [],
      });
      s.fills.template.setAll({ visible: !dashed, fillOpacity: 0.16 });
      s.bullets.push(() =>
        am5.Bullet.new(root, {
          sprite: am5.Circle.new(root, { radius: dashed ? 3 : 4, fill: color }),
        }),
      );
      return s;
    };

    const selfSeries = mkSeries("Self-rating", "self", selfColor, true);
    const assessedSeries = mkSeries("Assessed", "assessed", assessedColor, false);
    // Legend is rendered in HTML below the chart (avoids SVG-edge clipping).

    xRenderer.labels.template.events.on("click", (ev) => {
      const cat = (ev.target.dataItem as any)?.get("category");
      const row = cb.current.data.find((d) => d.category === cat);
      if (!row) return;
      if (row.hasChildren) cb.current.onDrill(row.id);
      else cb.current.onSelect(row.id);
    });

    state.current = { root, xAxis, selfSeries, assessedSeries };

    // Recolor labels/grid live when the app theme toggles.
    const themeObs = new MutationObserver(() => {
      const c = themeColors();
      xRenderer.labels.template.set("fill", c.ink);
      yRenderer.labels.template.set("fill", c.ink);
      xRenderer.grid.template.set("stroke", c.grid);
      yRenderer.grid.template.set("stroke", c.grid);
    });
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      themeObs.disconnect();
      root.dispose();
    };
    // Built once; data flows in through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const s = state.current;
    if (!s.xAxis) return;
    const rows = data.map((d) => ({
      category: d.category,
      self: d.self,
      assessed: d.assessed,
    }));
    s.xAxis.data.setAll(rows);
    s.selfSeries.data.setAll(rows);
    s.assessedSeries.data.setAll(rows);
  }, [data]);

  return <div ref={divRef} className="h-full w-full" />;
}
