/**
 * Bottom output panel. Lazily selects a renderer for the selected node's detected type and
 * exposes the matching export formats.
 */
import React, { lazy, memo, Suspense, useMemo } from "react";
import {
  Box,
  Flex,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Textarea,
  Button,
} from "@chakra-ui/react";
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
    <Flex
      alignItems="center"
      justifyContent="center"
      p={2}
      sx={{
        fontSize: long ? 14 : 70,
        fontWeight: long ? 400 : 700,
        height: "100%",
      }}
    >
      {long ? <Textarea readOnly value={value} /> : value}
    </Flex>
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
      <SectionLabel mr={2}>Output</SectionLabel>
      {formats.length > 0 && (
        <Menu>
          <MenuButton as={Button} bg="bg.light" size="sm" px={2}>
            <Flex alignItems="center">
              Export <ChevronDownIcon style={{ width: 12, height: 12 }} />
            </Flex>
          </MenuButton>
          <MenuList zIndex={1000}>
            {formats.map((format) => (
              <MenuItem onClick={format.onSelect} key={format.filetype + format.label}>
                {format.label}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>
      )}
    </Panel>
  );
};

const getView = (type) => {
  switch (type) {
    case TYPES.DATASET:
      return GridView;
    case TYPES.TOPOJSON:
    case TYPES.GEOJSON:
      return GeoView;
    case TYPES.ARRAY:
    case TYPES.OBJECT:
      return JsonTreeView;
    case TYPES.NUMBER:
    case TYPES.STRING:
    case TYPES.DATE:
    case TYPES.BOOLEAN:
    case TYPES.UNDEFINED:
    case TYPES.NULL:
      return SimpleTypeView;
    default:
      return () => null;
  }
};

const DataView = memo(({ data, type, dataId }) => {
  const View = useMemo(() => getView(type), [type]);
  return (
    <>
      <OutputHeader data={data} type={type} />
      <Box height="100%">
        <Suspense fallback={<div />}>
          <View data={data} type={type} dataId={dataId} />
        </Suspense>
      </Box>
    </>
  );
});
DataView.displayName = "DataView";

export default DataView;
