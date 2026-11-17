/**
 * Application shell: header, React Flow canvas, data output panel, terminal, drop target, and
 * keyboard shortcuts. The standalone app restores the last session and autosaves edits; when
 * `data` is provided by an embedder it is loaded instead and autosave is skipped.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDropzone } from "react-dropzone";
import { useHotkeys } from "react-hotkeys-hook";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
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
      className="absolute top-[10px] left-[10px] z-[100] rounded-[20px] border border-violet-lighten30 bg-bg-dark text-[12px] text-violet-lighten85 hover:bg-bg-lighter"
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
    <div
      {...getRootProps()}
      className={cn("flex h-full grow flex-col bg-bg-dark", isDragActive && "opacity-90")}
    >
      <input {...getInputProps()} />
      <Library />
      {children}
    </div>
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
  // Embedders pass `data` instead of restoring the autosaved session.
  const [restorePending, setRestorePending] = useState(!data);
  const restoring = restorePending && !data;
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
    }
  }, [data, viewportInitialized, setFlowData]);

  // Standalone boot: restore the last autosaved session once the canvas is ready.
  useEffect(() => {
    if (!viewportInitialized || data || restoredRef.current) return;
    restoredRef.current = true;
    restoreSession()
      .catch(() => {})
      .finally(() => setRestorePending(false));
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
    <div className="relative h-full overflow-hidden">
      <div className="flex h-full grow flex-col">
        <Header onFlowTitleChange={onFlowTitleChange} />
        <div className="relative h-[65%] min-h-[150px] shrink-0 resize-y overflow-auto">
          {!loading && !restoring && <AddBlock />}
          <DropZoneWrapper>
            {!loading && <FlowView />}
            {restoring && (
              <div className="absolute inset-0 z-[90] flex items-center justify-center bg-bg-dark text-silver-darken15">
                Restoring session…
              </div>
            )}
          </DropZoneWrapper>
        </div>
        <div className="flex h-full grow border-t border-bg-light bg-bg-dark">
          <div className="flex h-full w-full grow flex-col bg-bg-dark">
            <DataView data={selectedData} type={selectedType} dataId={selectedCurrent} />
          </div>
          <div className="flex h-full w-[40%] max-w-[500px] flex-col border-l border-bg-light">
            <Panel borderBottom>
              <SectionLabel>Logs</SectionLabel>
            </Panel>
            <Terminal />
          </div>
        </div>
      </div>
      <FlowLibrary />
    </div>
  );
};

const App = ({ demoMode = false, ...rest }) => (
  <ReactFlowProvider>
    <AppInner demoMode={demoMode} {...rest} />
  </ReactFlowProvider>
);

export default App;
