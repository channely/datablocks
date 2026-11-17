/** Uppercase section heading used in panels and the library. */
import { Box } from "@chakra-ui/react";

const SectionLabel = ({ children, ...props }) => (
  <Box
    fontSize="11px"
    fontWeight={700}
    textTransform="uppercase"
    letterSpacing="0.13em"
    lineHeight="1"
    {...props}
  >
    {children}
  </Box>
);

export default SectionLabel;
