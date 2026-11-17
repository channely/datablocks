/**
 * Application shell: header, React Flow canvas, data output panel, terminal, drop target, and
 * keyboard shortcuts. Also seeds the demo flow and wires the optional save callback.
 */
import React, { useCallback, useEffect } from "react";
import { Box, Button, Flex } from "@chakra-ui/react";
import { useDropzone } from "react-dropzone";
import { useHotkeys } from "react-hotkeys-hook";
import { ReactFlowProvider, useReactFlow } from "react-flow-renderer";
import useStore from "./store";
import Header from "./components/Header";
import FlowView from "./components/Flow";
import DataView from "./components/DataView";
import Terminal from "./components/Terminal";
import Panel from "./components/Panel";
import SectionLabel from "./components/SectionLabel";
import Library from "./components/Library";
import { getFlowRect } from "./lib/download";
import { parseFile } from "./lib/dataIO";
import { useFlowCommands } from "./hooks/useFlowCommands";
import useData from "./hooks/useData";

const DEFAULT_DATA = {
  flow: [
    {
      elements: [],
      id: null,
      title: "demo flow",
      is_public: false,
      created_at: new Date(),
      updated_at: new Date(),
      demoMode: true,
    },
  ],
};

const AddBlock = () => {
  const setModal = useStore((state) => state.setModal);
  return (
    <Button
      data-testid="addblock"
      onClick={() => setModal({ type: "library" })}
      position="absolute"
      zIndex={100}
      top="10px"
      left="10px"
      fontSize="12px"
      borderRadius="20px"
      border="1px solid"
      borderColor="violetLighten30"
      background="bg.dark"
      color="violetLighten85"
    >
      + block
    </Button>
  );
};

const DropZoneWrapper = ({ children }) => {
  const addNode = useStore((state) => state.addNode);
  const addLogs = useStore((state) => state.addLogs);

  const onDropAccepted = useCallback(
    async (files, event) => {
      const rect = getFlowRect();
      const position = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const fileName = files[0].name;
      const result = await parseFile(files[0]);
      if (result.error) {
        addLogs({ method: "error", data: [result.error] });
        return;
      }
      addNode({
        type: "file",
        position,
        data: {
          group: "input",
          label: "File",
          fileName,
          current: result.data,
        },
      });
    },
    [addNode, addLogs],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    noClick: true,
    onDropAccepted,
  });

  return (
    <Flex
      {...getRootProps()}
      flexDirection="column"
      height="100%"
      bg="bg.dark"
      flexGrow={1}
      opacity={isDragActive ? 0.9 : 1}
    >
      <input {...getInputProps()} />
      <Library />
      {children}
    </Flex>
  );
};

const AppInner = ({
  data = DEFAULT_DATA,
  demoMode = false,
  loading = false,
  onFlowSave,
  onFlowTitleChange = () => {},
}) => {
  const flowTransform = useStore((state) => state.flowTransform);
  const setFlowData = useStore((state) => state.setFlowData);
  const setElements = useStore((state) => state.setElements);
  const clearLogs = useStore((state) => state.clearLogs);
  const addLogs = useStore((state) => state.addLogs);
  const setDemoMode = useStore((state) => state.setDemoMode);
  const setOnFlowSaveCallback = useStore((state) => state.setOnFlowSaveCallback);
  const selectedCurrent = useStore((state) => {
    const node = state.nodes.find((n) => n.id === state.selectedNode?.id);
    return node?.data?.current;
  });
  const [selectedData, selectedType] = useData(selectedCurrent);
  const { setViewport, viewportInitialized } = useReactFlow();
  const { save, clear } = useFlowCommands();

  useEffect(
    () => () => {
      setElements([]);
      clearLogs();
    },
    [setElements, clearLogs],
  );

  useEffect(() => {
    if (data?.flow && viewportInitialized) {
      setFlowData(data.flow[0]);
    }
  }, [data, viewportInitialized, setFlowData]);

  useEffect(() => {
    if (flowTransform) setViewport(flowTransform);
  }, [flowTransform, setViewport]);

  useEffect(() => {
    if (onFlowSave) setOnFlowSaveCallback(() => onFlowSave);
  }, [onFlowSave, setOnFlowSaveCallback]);

  useEffect(() => {
    setDemoMode(demoMode);
    if (demoMode) {
      addLogs({
        method: "info",
        data: ["This is just a demo! To use all features login or create an account."],
      });
    }
  }, [demoMode, addLogs, setDemoMode]);

  useHotkeys(
    "ctrl+s, command+s",
    (event) => {
      event.preventDefault();
      save();
    },
    [save],
  );
  useHotkeys(
    "ctrl+k, command+k",
    (event) => {
      event.preventDefault();
      clear();
    },
    [clear],
  );

  return (
    <Box position="relative" overflow="hidden" height="100%">
      <Flex flexDirection="column" flexGrow={1} height="100%">
        <Header onFlowTitleChange={onFlowTitleChange} />
        <Box
          height="65%"
          resize="vertical"
          overflow="auto"
          flexShrink={0}
          position="relative"
          minHeight="150px"
        >
          <AddBlock />
          <DropZoneWrapper>{!loading && <FlowView />}</DropZoneWrapper>
        </Box>
        <Flex
          flexGrow={1}
          bg="bg.dark"
          borderTop="1px solid"
          borderTopColor="bg.light"
          height="100%"
        >
          <Flex flexDirection="column" flexGrow={1} width="100%" height="100%" bg="bg.dark">
            <DataView data={selectedData} type={selectedType} dataId={selectedCurrent} />
          </Flex>
          <Flex
            height="100%"
            width="40%"
            maxWidth="500px"
            flexDirection="column"
            borderLeft="1px solid"
            borderLeftColor="bg.light"
          >
            <Panel borderBottom>
              <SectionLabel>Logs</SectionLabel>
            </Panel>
            <Terminal />
          </Flex>
        </Flex>
      </Flex>
    </Box>
  );
};

const App = ({ data = DEFAULT_DATA, demoMode = true, ...rest }) => (
  <ReactFlowProvider>
    <AppInner data={data} demoMode={demoMode} {...rest} />
  </ReactFlowProvider>
);

export default App;
