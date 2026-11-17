/** Fixed-height panel/header strip used throughout the layout. */
import { Flex } from "@chakra-ui/react";

const border = (flag) => (flag ? "1px solid" : "none");

const Panel = ({ borderTop, borderRight, borderBottom, borderLeft, children, ...props }) => (
  <Flex
    height="30px"
    width="100%"
    flexShrink={0}
    flexGrow={0}
    overflow="visible"
    position="relative"
    p={2}
    alignItems="center"
    borderTop={border(borderTop)}
    borderRight={border(borderRight)}
    borderBottom={border(borderBottom)}
    borderLeft={border(borderLeft)}
    borderColor="bg.light"
    {...props}
  >
    {children}
  </Flex>
);

export default Panel;
