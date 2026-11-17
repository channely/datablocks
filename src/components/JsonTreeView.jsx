/**
 * Object/array inspector. Uses react-json-tree with its default Solarized theme, matching the
 * reference demo's output rendering.
 */
import { memo } from "react";
import { JSONTree } from "react-json-tree";

const JsonTreeView = memo(({ data = {} }) => (
  <div className="relative h-full overflow-auto font-mono" data-testid="jsontreeview">
    <div className="absolute inset-0">
      <JSONTree data={data} />
    </div>
  </div>
));
JsonTreeView.displayName = "JSONTreeView";

export default JsonTreeView;
