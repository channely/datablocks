/**
 * Bottom output panel. Lazily selects a renderer for the selected node's detected type and
 * exposes the matching export formats.
 */
import { lazy, memo, Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { TYPES, formatValue } from "../lib/types";
import { getExportFormats } from "../lib/exporters";
import Panel from "./Panel";
import SectionLabel from "./SectionLabel";
import { ChevronDownIcon } from "./icons";

const GridView = lazy(() => import("./GridView"));
const JsonTreeView = lazy(() => import("./JsonTreeView"));
const GeoView = lazy(() => import("./GeoView"));

export const SimpleTypeView = ({ data, type }) => {
  const value = formatValue({ data, type });
  const long = value.length > 64;
  return (
    <div
      className="flex h-full items-center justify-center p-2"
      style={{ fontSize: long ? 14 : 70, fontWeight: long ? 400 : 700 }}
    >
      {long ? <Textarea readOnly value={value} /> : value}
    </div>
  );
};
SimpleTypeView.displayName = "SimpleTypeView";

export const OutputHeader = ({ data, type }) => {
  const formats = getExportFormats(type).map((format) => ({
    ...format,
    onSelect: () => format.handler(data, type),
    label: `.${format.filetype}`,
  }));
  return (
    <Panel borderBottom>
      <SectionLabel className="mr-2">Output</SectionLabel>
      {formats.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="bg-bg-light px-2">
              <span className="flex items-center">
                Export <ChevronDownIcon style={{ width: 12, height: 12 }} />
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {formats.map((format) => (
              <DropdownMenuItem onSelect={format.onSelect} key={format.filetype + format.label}>
                {format.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </Panel>
  );
};

const EmptyView = () => null;

const VIEWS = {
  [TYPES.DATASET]: GridView,
  [TYPES.TOPOJSON]: GeoView,
  [TYPES.GEOJSON]: GeoView,
  [TYPES.ARRAY]: JsonTreeView,
  [TYPES.OBJECT]: JsonTreeView,
  [TYPES.NUMBER]: SimpleTypeView,
  [TYPES.STRING]: SimpleTypeView,
  [TYPES.DATE]: SimpleTypeView,
  [TYPES.BOOLEAN]: SimpleTypeView,
  [TYPES.UNDEFINED]: SimpleTypeView,
  [TYPES.NULL]: SimpleTypeView,
};

const DataView = memo(({ data, type, dataId }) => {
  const View = VIEWS[type] ?? EmptyView;
  return (
    <>
      <OutputHeader data={data} type={type} />
      <div className="h-full" data-testid="output-view">
        <Suspense fallback={<div />}>
          <View data={data} type={type} dataId={dataId} />
        </Suspense>
      </div>
    </>
  );
});
DataView.displayName = "DataView";

export default DataView;
