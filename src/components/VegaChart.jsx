/**
 * Thin wrapper around react-vega. Chart blocks load it through `React.lazy` so the Vega runtime
 * (~1MB) is only fetched once a chart is on the canvas.
 */
import { Vega } from "react-vega";

const VegaChart = ({ spec, data }) => <Vega spec={spec} data={data} />;

export default VegaChart;
