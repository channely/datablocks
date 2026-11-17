/**
 * Block library modal (also used as an inline drop target). Blocks are filtered by group and
 * search text; clicking an item creates a node and closes the modal.
 */
import React, { useRef, useState } from "react";
import {
  Box,
  Flex,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalOverlay,
} from "@chakra-ui/react";
import { groupBy, uniq } from "lodash-es";
import useStore from "../store";
import { BLOCKS } from "../blocks/registry";
import { TYPES, titlecase } from "../lib/types";
import SectionLabel from "./SectionLabel";
import Panel from "./Panel";
import {
  ChartIcon,
  GeoGroupIcon,
  InputGroupIcon,
  MiscGroupIcon,
  OutputGroupIcon,
  TransformGroupIcon,
} from "./icons";

const GROUP_ICONS = {
  input: InputGroupIcon,
  visualization: ChartIcon,
  output: OutputGroupIcon,
  transform: TransformGroupIcon,
  "geo data": GeoGroupIcon,
  misc: MiscGroupIcon,
};

const TYPE_COUNT = Object.keys(TYPES).length;

const typesLabel = (types) => {
  if (!types) return "-";
  const names = types.map(titlecase);
  return names.length === TYPE_COUNT ? "All types" : names.join(", ");
};

const kebab = (value) => value.replace(/\s+/g, "-").toLowerCase();

const BlockItem = ({ type, title, description, data, input, output, Icon }) => {
  const addNode = useStore((state) => state.addNode);
  const setModal = useStore((state) => state.setModal);

  return (
    <Box
      bg="bg.light"
      p="10px"
      cursor="pointer"
      userSelect="none"
      border="1px solid"
      borderColor="bg.light"
      color="text"
      borderRadius="4px"
      transform="scale(1)"
      transition="transform 0.1s"
      display="flex"
      flexDirection="column"
      _hover={{ color: "text", borderColor: "bg.lighter", transform: "scale(1.03)" }}
      onClick={() => {
        addNode({ ...data });
        setModal(null);
      }}
      data-testid={`blockitem-${type}`}
      className="blockitem"
    >
      <Box fontSize="xl" fontWeight="bold" mb={2}>
        {Icon && <Icon />} {title}
      </Box>
      <Box color="silverDarken15">{description}</Box>
      <Box fontSize="12px" marginTop="auto" paddingTop="10px" color="silverDarken30">
        <Box>Input: {typesLabel(input)}</Box>
        <Box>Output: {typesLabel(output)}</Box>
      </Box>
    </Box>
  );
};

const GroupFilter = ({ isActive, children, ...props }) => (
  <Panel
    paddingLeft={0}
    cursor="pointer"
    userSelect="none"
    color={isActive ? "primary" : "text"}
    _hover={{ color: "primary" }}
    {...props}
  >
    {children}
  </Panel>
);

const BlockLibrary = ({ data = {} }) => {
  const [activeGroup, setActiveGroup] = useState(null);
  const [search, setSearch] = useState("");
  const inputRef = useRef();
  React.useEffect(() => inputRef.current.focus(), []);

  const filtered = BLOCKS.filter((block) => {
    const haystack = `${block.data?.label} ${block.description}`.toLowerCase();
    const matchesGroup = !activeGroup || block.data?.group === activeGroup;
    const matchesSearch = !search || haystack.includes(search);
    return matchesGroup && matchesSearch;
  });

  const groups = uniq(BLOCKS.map((block) => block.data?.group));
  const grouped = groupBy(filtered, (block) => block.data?.group);

  return (
    <Flex>
      <Box flex="180px 0 0" py={3} pr={2}>
        <Box fontSize="2xl" fontWeight="bold" mb={3}>
          Block Library
        </Box>
        <Box mb={3}>
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value.toLowerCase());
              setActiveGroup(null);
            }}
            placeholder="Search..."
            ref={inputRef}
            data-testid="search"
            width="100%"
          />
        </Box>
        {groups.map((group) => {
          const Icon = GROUP_ICONS[group];
          return (
            <GroupFilter
              isActive={activeGroup === group}
              onClick={() => setActiveGroup(activeGroup === group ? null : group)}
              data-testid={`groupfilter-${kebab(group)}`}
              key={group}
            >
              {Icon && (
                <Box mr={2}>
                  <Icon />
                </Box>
              )}
              <SectionLabel>{group}</SectionLabel>
            </GroupFilter>
          );
        })}
      </Box>
      <Box height="100%" flexGrow={1}>
        {Object.entries(grouped).map(([group, blocks]) => (
          <React.Fragment key={group}>
            <Flex
              pt={4}
              pb={2}
              px={3}
              className="blockgroup"
              data-testid={`blockgroup-${kebab(group)}`}
            >
              <SectionLabel>{group}</SectionLabel>
            </Flex>
            <Box
              p={3}
              overflow="auto"
              display="grid"
              gridTemplateColumns="repeat(3, 200px)"
              gridAutoRows="1fr"
              gridColumnGap="15px"
              gridRowGap="15px"
            >
              {blocks.map((block) => (
                <BlockItem
                  key={block.type}
                  type={block.type}
                  title={block.data.label}
                  description={block.description}
                  data={block}
                  position={data.position}
                  input={block.input}
                  output={block.output}
                />
              ))}
            </Box>
          </React.Fragment>
        ))}
      </Box>
    </Flex>
  );
};

export const Library = () => {
  const modal = useStore((state) => state.modal);
  if (!modal) return null;
  return <LibraryModal data={modal} />;
};

const LibraryModal = ({ data }) => {
  const setModal = useStore((state) => state.setModal);
  return (
    <Modal
      scrollBehavior="inside"
      size="6xl"
      isOpen
      onClose={() => setModal(null)}
      data-testid="modal-library"
    >
      <ModalOverlay />
      <ModalContent bg="bg.grey">
        <ModalCloseButton />
        <ModalBody>
          <BlockLibrary data={data} />
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default Library;
