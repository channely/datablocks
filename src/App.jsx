/**
 * Application shell: header, React Flow canvas, data output panel, terminal, drop target, and
 * keyboard shortcuts. The standalone app restores the last session and autosaves edits; when
 * `data` is provided by an embedder it is loaded instead and autosave is skipped.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import FlowLibrary from "./components/FlowLibrary";
import { getFlowRect } from "./lib/download";
import { parseFile } from "./lib/dataIO";
import { useFlowCommands } from "./hooks/useFlowCommands";
import useData from "./hooks/useData";
import useAutosave from "./hooks/useAutosave";

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
  data,
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
  const restoreSession = useStore((state) => state.restoreSession);
  const undo = useStore((state) => state.undo);
  const redo = useStore((state) => state.redo);
  const selectedCurrent = useStore((state) => {
    const node = state.nodes.find((n) => n.id === state.selectedNode?.id);
    return node?.data?.current;
  });
  const [selectedData, selectedType] = useData(selectedCurrent);
  const { setViewport, viewportInitialized } = useReactFlow();
  const { save, clear, openFlows, saveAs } = useFlowCommands();
  const [restoring, setRestoring] = useState(!data);
  const restoredRef = useRef(false);

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
      setRestoring(false);
    }
  }, [data, viewportInitialized, setFlowData]);

  // Standalone boot: restore the last autosaved session once the canvas is ready.
  useEffect(() => {
    if (!viewportInitialized || data || restoredRef.current) return;
    restoredRef.current = true;
    restoreSession()
      .catch(() => {})
      .finally(() => setRestoring(false));
  }, [data, viewportInitialized, restoreSession]);

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

  useAutosave({ enabled: !restoring && !demoMode && !loading });

  useHotkeys(
    "ctrl+s, command+s",
    (event) => {
      event.preventDefault();
      save();
    },
    [save],
  );
  useHotkeys(
    "ctrl+o, command+o",
    (event) => {
      event.preventDefault();
      openFlows();
    },
    [openFlows],
  );
  useHotkeys(
    "ctrl+shift+s, command+shift+s",
    (event) => {
      event.preventDefault();
      saveAs();
    },
    [saveAs],
  );
  useHotkeys(
    "ctrl+k, command+k",
    (event) => {
      event.preventDefault();
      clear();
    },
    [clear],
  );
  useHotkeys(
    "ctrl+z, command+z",
    (event) => {
      event.preventDefault();
      undo();
    },
    [undo],
  );
  useHotkeys(
    "ctrl+shift+z, command+shift+z",
    (event) => {
      event.preventDefault();
      redo();
    },
    [redo],
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
          {!loading && !restoring && <AddBlock />}
          <DropZoneWrapper>
            {!loading && <FlowView />}
            {restoring && (
              <Box
                position="absolute"
                inset={0}
                bg="bg.dark"
                zIndex={90}
                display="flex"
                alignItems="center"
                justifyContent="center"
                color="silverDarken15"
              >
                Restoring session…
              </Box>
            )}
          </DropZoneWrapper>
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
      <FlowLibrary />
    </Box>
  );
};

const App = ({ demoMode = false, ...rest }) => (
  <ReactFlowProvider>
    <AppInner demoMode={demoMode} {...rest} />
  </ReactFlowProvider>
);

export default App;
