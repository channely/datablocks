/**
 * Local flow library.
 *
 * Lists flows saved in this browser (metadata comes from `flow__index`), and offers open,
 * rename, duplicate, export, delete, and import. Everything stays on the device; there is no
 * backend or account. Import validation and error reporting live in the store/commands layer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Flex,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalOverlay,
} from "@chakra-ui/react";
import useStore from "../store";
import SectionLabel from "./SectionLabel";
import { useFlowCommands } from "../hooks/useFlowCommands";
import { STORAGE_WARN_RATIO, formatBytes, getStorageEstimate } from "../lib/storageHealth";

const formatDate = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

const FlowRow = ({ flow, onOpen, onRename, onDuplicate, onExport, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(flow.title);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const submit = (event) => {
    event.preventDefault();
    const name = draft.trim();
    if (!name || name === flow.title) {
      setEditing(false);
      setDraft(flow.title);
      return;
    }
    onRename(flow.id, name);
    setEditing(false);
  };

  return (
    <Box
      display="flex"
      alignItems="center"
      py={3}
      borderBottom="1px solid"
      borderColor="bg.light"
      data-testid={`flow-row-${flow.id}`}
    >
      <Box flexGrow={1} minWidth={0}>
        {editing ? (
          <Box as="form" display="flex" onSubmit={submit}>
            <Input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setEditing(false);
                  setDraft(flow.title);
                }
              }}
              size="sm"
              data-testid="flow-rename-input"
            />
            <Button type="submit" size="sm" ml={2}>
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              ml={1}
              onClick={() => {
                setEditing(false);
                setDraft(flow.title);
              }}
            >
              Cancel
            </Button>
          </Box>
        ) : (
          <>
            <Box fontWeight={700} isTruncated>
              {flow.title}
            </Box>
            <Box fontSize="11px" color="silverDarken15">
              {flow.nodeCount} nodes · updated {formatDate(flow.updatedAt)}
            </Box>
          </>
        )}
      </Box>
      {!editing && (
        <Flex flexShrink={0}>
          <Button size="xs" ml={2} onClick={() => onOpen(flow.id)} data-testid="flow-open">
            Open
          </Button>
          <Button size="xs" ml={1} onClick={() => setEditing(true)} data-testid="flow-rename">
            Rename
          </Button>
          <Button
            size="xs"
            ml={1}
            onClick={() => onDuplicate(flow.id)}
            data-testid="flow-duplicate"
          >
            Duplicate
          </Button>
          <Button
            size="xs"
            ml={1}
            onClick={() => onExport(flow.id, flow.title)}
            data-testid="flow-export"
          >
            Export
          </Button>
          <Button size="xs" ml={1} onClick={() => onDelete(flow)} data-testid="flow-delete">
            Delete
          </Button>
        </Flex>
      )}
    </Box>
  );
};

const FlowLibraryModal = () => {
  const setModal = useStore((state) => state.setModal);
  const listFlows = useStore((state) => state.listFlows);
  const loadFlowById = useStore((state) => state.loadFlowById);
  const renameFlow = useStore((state) => state.renameFlow);
  const duplicateFlow = useStore((state) => state.duplicateFlow);
  const deleteFlow = useStore((state) => state.deleteFlow);
  const addLogs = useStore((state) => state.addLogs);
  const { exportFlow, importFlowFile } = useFlowCommands();
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState(null);
  const fileInputRef = useRef(null);

  // State is only set in promise callbacks, so the mount effect does not render twice.
  const load = useCallback(() => {
    getStorageEstimate().then(setEstimate);
    return listFlows()
      .then(setFlows)
      .catch((error) =>
        addLogs({ method: "error", data: ["Loading saved flows failed.", error.message] }),
      )
      .finally(() => setLoading(false));
  }, [listFlows, addLogs]);

  const refresh = useCallback(() => {
    setLoading(true);
    return load();
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (id) => {
    try {
      await loadFlowById(id);
      setModal(null);
      addLogs({ method: "info", data: ["Flow opened."] });
    } catch (error) {
      addLogs({ method: "error", data: ["Opening the flow failed.", error.message] });
    }
  };

  const rename = async (id, title) => {
    try {
      await renameFlow(id, title);
      await refresh();
    } catch (error) {
      addLogs({ method: "error", data: ["Renaming the flow failed.", error.message] });
    }
  };

  const duplicate = async (id) => {
    try {
      const meta = await duplicateFlow(id);
      await refresh();
      addLogs({ method: "info", data: [`Duplicated as "${meta.title}".`] });
    } catch (error) {
      addLogs({ method: "error", data: ["Duplicating the flow failed.", error.message] });
    }
  };

  const remove = async (flow) => {
    if (!window.confirm(`Delete "${flow.title}"? This cannot be undone.`)) return;
    try {
      await deleteFlow(flow.id);
      await refresh();
      addLogs({ method: "info", data: [`Deleted "${flow.title}".`] });
    } catch (error) {
      addLogs({ method: "error", data: ["Deleting the flow failed.", error.message] });
    }
  };

  const onImportChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    await importFlowFile(file);
  };

  return (
    <Modal
      scrollBehavior="inside"
      size="5xl"
      isOpen
      onClose={() => setModal(null)}
      data-testid="flow-library"
    >
      <ModalOverlay />
      <ModalContent bg="bg.grey">
        <ModalCloseButton />
        <ModalBody py={4}>
          {/* Right padding keeps the import button clear of the modal close button. */}
          <Flex alignItems="center" mb={3} pr={8}>
            <Box fontSize="2xl" fontWeight="bold" flexGrow={1}>
              Your flows
            </Box>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              data-testid="flow-import"
            >
              Import flow…
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={onImportChange}
            />
          </Flex>
          <SectionLabel>
            Stored in this browser only. Export a flow to share it or move it to another device.
          </SectionLabel>
          <Box mt={3}>
            {loading ? (
              <Box color="silverDarken15" py={4}>
                Loading…
              </Box>
            ) : flows.length === 0 ? (
              <Box color="silverDarken15" py={4}>
                No saved flows yet. Use File → Save (Ctrl/Cmd+S) to add the current canvas.
              </Box>
            ) : (
              flows.map((flow) => (
                <FlowRow
                  key={flow.id}
                  flow={flow}
                  onOpen={open}
                  onRename={rename}
                  onDuplicate={duplicate}
                  onExport={exportFlow}
                  onDelete={remove}
                />
              ))
            )}
          </Box>
          {estimate && (
            <Box
              mt={4}
              fontSize="11px"
              color={estimate.ratio >= STORAGE_WARN_RATIO ? "orange.300" : "silverDarken15"}
              data-testid="storage-estimate"
            >
              Browser storage: {formatBytes(estimate.usage)} used of {formatBytes(estimate.quota)} (
              {(estimate.ratio * 100).toFixed(1)}%)
              {estimate.ratio >= STORAGE_WARN_RATIO &&
                " — almost full; export and delete old flows."}
            </Box>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

/** Renders nothing unless the store asks for the flow library modal. */
const FlowLibrary = () => {
  const modal = useStore((state) => state.modal);
  if (!modal || modal.type !== "flows") return null;
  return <FlowLibraryModal />;
};

export default FlowLibrary;
