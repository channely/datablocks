/**
 * Object/array inspector. Uses react-json-tree with its default Solarized theme, matching the
 * reference demo's output rendering.
 */
import React, { memo } from "react";
import { Box } from "@chakra-ui/react";
import { JSONTree } from "react-json-tree";

const JsonTreeView = memo(({ data = {} }) => (
  <Box
    height="100%"
    fontFamily="mono"
    position="relative"
    overflow="auto"
    data-testid="jsontreeview"
  >
    <Box position="absolute" left={0} top={0} right={0} bottom={0}>
      <JSONTree data={data} />
    </Box>
  </Box>
));
JsonTreeView.displayName = "JSONTreeView";

export default JsonTreeView;
