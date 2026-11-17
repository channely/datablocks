/**
 * Thin wrapper around react-vega 8 / vega-embed 7. Chart blocks load it through `React.lazy` so
 * the Vega runtime (~1MB) is only fetched once a chart is on the canvas.
 *
 * react-vega 8 no longer accepts a `data` prop: `useVegaEmbed` (re-)embeds when the spec changes
 * (deep comparison), and the datasets are pushed into the view's named sources afterwards, so a
 * new upstream dataset updates the chart without rebuilding the view.
 */
import { useEffect, useRef } from "react";
import { useVegaEmbed } from "react-vega";

/**
 * Stable reference: react-vega re-embeds whenever the options object changes. vega-embed 7
 * defaults to the SVG renderer, which turns a 20k-row scatterplot into 20k DOM nodes; canvas
 * restores the pre-upgrade rendering cost.
 */
const EMBED_OPTIONS = { renderer: "canvas" };

const VegaChart = ({ spec, data }) => {
  const ref = useRef(null);
  const result = useVegaEmbed({ ref, spec, options: EMBED_OPTIONS });

  useEffect(() => {
    if (!result || !data) return;
    const { view } = result;
    for (const [name, values] of Object.entries(data)) {
      view.data(name, values);
    }
    // Autosize was computed for the empty dataset at embed time; recompute it for the new rows.
    view
      .resize()
      .runAsync()
      .catch((error) => console.error(`[VegaChart] ${error}`));
  }, [result, data]);

  return <div ref={ref} />;
};

export default VegaChart;
