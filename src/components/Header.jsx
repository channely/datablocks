/**
 * Application header: logo, File/View/Help menus, and the inline flow title editor. Save and
 * Clear are hidden in demo mode, matching the reference behavior.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, Flex, Input } from "@chakra-ui/react";
import { useReactFlow } from "react-flow-renderer";
import useStore from "../store";
import { CheckIcon, Logo, PencilIcon } from "./icons";
import Dropdown from "./Dropdown";
import { useAutoLayout, useFlowCommands, useLoadAllNodes } from "../hooks/useFlowCommands";

export const Header = ({ children, showDatablocksLabel = false }) => (
  <Flex
    alignItems="center"
    borderBottom="1px solid"
    borderColor="bg.light"
    flexShrink={0}
    width="100%"
    bg="bg.dark"
    padding="12px 16px"
    data-testid="header"
  >
    <a href={import.meta.env.BASE_URL}>
      <Flex alignItems="center" userSelect="none" marginRight="10px">
        <Logo />
        {showDatablocksLabel && (
          <Box fontWeight={700} fontSize="14px" color="silver">
            datablocks
          </Box>
        )}
      </Flex>
    </a>
    {children}
  </Flex>
);

export const HeaderMenu = ({ children }) => <Flex width="100%">{children}</Flex>;

export const HeaderLabel = ({ children, ...props }) => (
  <Box
    color="text"
    fontSize="11px"
    marginRight="1em"
    textTransform="uppercase"
    letterSpacing="0.1em"
    cursor="pointer"
    userSelect="none"
    textAlign="center"
    _hover={{ color: "primary" }}
    {...props}
  >
    {children}
  </Box>
);

const TitleEditor = ({ onFlowTitleChange }) => {
  const demoMode = useStore((state) => state.demoMode);
  const title = useStore((state) => state.title);
  const setTitle = useStore((state) => state.setTitle);
  const inputRef = useRef(null);
  const [isEditing, setIsEditing] = useState(false);

  const hoverProps = demoMode
    ? {}
    : {
        cursor: "pointer",
        "& svg": {
          position: "absolute",
          display: "block !important",
          right: 0,
          top: 0,
        },
      };

  useEffect(() => {
    if (isEditing) inputRef.current.focus();
  }, [isEditing]);

  const prevent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const submit = (e) => {
    if (demoMode) return null;
    e.preventDefault();
    e.stopPropagation();
    const value = inputRef.current?.value;
    if (value) {
      setTitle(value);
      onFlowTitleChange(value);
    }
    setIsEditing(false);
  };

  const onTitleClick = useCallback(() => {
    if (demoMode) return null;
    setIsEditing(true);
  }, [demoMode]);

  return (
    <Box
      display="flex"
      position="absolute"
      left="50%"
      transform="translate(-50%, 0)"
      fontWeight={700}
    >
      {isEditing && !demoMode ? (
        <Box
          as="form"
          onSubmit={submit}
          display="flex"
          marginBottom="5px"
          flexGrow={1}
          border="1px solid"
          borderColor="silverDarken30"
          borderRadius="2px"
          overflow="hidden"
          width="100%"
          sx={{
            input: {
              fontWeight: 700,
              width: "100%",
              border: "none",
              borderRadius: "2px 0 0 2px",
              "&:focus": { outline: "none" },
            },
          }}
        >
          <Input
            type="text"
            defaultValue={title}
            onFocus={prevent}
            onClick={prevent}
            onBlur={submit}
            ref={inputRef}
          />
          <Button type="submit">
            <CheckIcon style={{ width: 16, height: 16 }} />
          </Button>
        </Box>
      ) : (
        <Box
          position="relative"
          padding="0 15px"
          onClick={onTitleClick}
          _hover={hoverProps}
          sx={{ "& svg": { display: "none !important" } }}
        >
          {title}
          {!demoMode && <PencilIcon style={{ width: 12, height: 12 }} />}
        </Box>
      )}
    </Box>
  );
};

const HeaderTools = ({ onFlowTitleChange }) => {
  const demoMode = useStore((state) => state.demoMode);
  const loadFlow = useStore((state) => state.loadFlow);
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
  const { save, clear } = useFlowCommands();
  const loadAllNodes = useLoadAllNodes();
  const autoLayout = useAutoLayout();

  return (
    <>
      <HeaderMenu>
        {!demoMode && (
          <Dropdown
            items={[
              { label: "Save", onSelect: save },
              { label: "Clear", onSelect: clear },
            ]}
            label={<HeaderLabel style={{ marginRight: 0 }}>File</HeaderLabel>}
          />
        )}
        <Dropdown
          items={[
            { label: "Auto Layout Nodes", onSelect: autoLayout },
            { label: "Fit View", onSelect: fitView },
            {
              label: "Zoom 100%",
              onSelect: () => zoomTo(1),
            },
            { label: "Zoom In", onSelect: zoomIn },
            { label: "Zoom Out", onSelect: zoomOut },
            { label: "All nodes", onSelect: loadAllNodes },
          ]}
          label={<HeaderLabel style={{ marginRight: 0 }}>View</HeaderLabel>}
        />
        <Dropdown
          items={[
            {
              label: "Introduction Flow",
              onSelect: () => loadFlow("introduction"),
            },
          ]}
          label={<HeaderLabel style={{ marginRight: 0 }}>Help</HeaderLabel>}
        />
        {demoMode && (
          <Flex ml="auto">
            <HeaderLabel style={{ marginRight: 0, marginLeft: "1em" }}>
              <a href="/login">Login</a>
            </HeaderLabel>
            <HeaderLabel style={{ marginRight: 0, marginLeft: "1em" }}>
              <a href="/signup">Sign up</a>
            </HeaderLabel>
          </Flex>
        )}
      </HeaderMenu>
      <TitleEditor onFlowTitleChange={onFlowTitleChange} />
    </>
  );
};

const HeaderBar = ({ onFlowTitleChange = () => {} }) => (
  <Header>
    <HeaderTools onFlowTitleChange={onFlowTitleChange} />
  </Header>
);

export default HeaderBar;
