/**
 * Application header: logo, File/View/Help menus, and the inline flow title editor. Save and
 * Clear are hidden in demo mode, matching the reference behavior.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useReactFlow } from "@xyflow/react";
import useStore from "../store";
import { CheckIcon, Logo, PencilIcon } from "./icons";
import Dropdown from "./Dropdown";
import { useAutoLayout, useFlowCommands, useLoadAllNodes } from "../hooks/useFlowCommands";

export const Header = ({ children, showDatablocksLabel = false }) => (
  <div
    className="flex w-full shrink-0 items-center border-b border-solid border-bg-light bg-bg-dark px-[16px] py-[12px]"
    data-testid="header"
  >
    <a href={import.meta.env.BASE_URL}>
      <div className="mr-[10px] flex items-center select-none">
        <Logo />
        {showDatablocksLabel && <div className="text-[14px] font-bold text-silver">datablocks</div>}
      </div>
    </a>
    {children}
  </div>
);

export const HeaderMenu = ({ children }) => <div className="flex w-full">{children}</div>;

export const HeaderLabel = ({ children, className, ...props }) => (
  <div
    className={cn(
      "mr-[1em] cursor-pointer text-center text-[11px] tracking-[0.1em] text-text uppercase select-none hover:text-primary",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

const TitleEditor = ({ onFlowTitleChange }) => {
  const demoMode = useStore((state) => state.demoMode);
  const title = useStore((state) => state.title);
  const setTitle = useStore((state) => state.setTitle);
  const inputRef = useRef(null);
  const [isEditing, setIsEditing] = useState(false);

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
    const value = inputRef.current?.value?.trim();
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
    <div className="absolute left-1/2 flex -translate-x-1/2 font-bold">
      {isEditing && !demoMode ? (
        <form
          onSubmit={submit}
          className="mb-[5px] flex w-full grow overflow-hidden rounded-[2px] border border-solid border-silver-darken30"
        >
          <Input
            type="text"
            defaultValue={title}
            onFocus={prevent}
            onClick={prevent}
            onBlur={submit}
            ref={inputRef}
            className="w-full rounded-l-[2px] rounded-r-none border-0 font-bold shadow-none focus-visible:shadow-none focus-visible:outline-none"
          />
          <Button type="submit">
            <CheckIcon style={{ width: 16, height: 16 }} />
          </Button>
        </form>
      ) : (
        <div
          className={cn("group relative px-[15px]", !demoMode && "cursor-pointer")}
          onClick={onTitleClick}
        >
          {title}
          {!demoMode && (
            <PencilIcon
              className="absolute top-0 right-0 hidden group-hover:block"
              style={{ width: 12, height: 12 }}
            />
          )}
        </div>
      )}
    </div>
  );
};

const HeaderTools = ({ onFlowTitleChange }) => {
  const demoMode = useStore((state) => state.demoMode);
  const loadFlow = useStore((state) => state.loadFlow);
  const saveStatus = useStore((state) => state.saveStatus);
  const lastSavedAt = useStore((state) => state.lastSavedAt);
  const undo = useStore((state) => state.undo);
  const redo = useStore((state) => state.redo);
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
  const { save, saveAs, openFlows, newFlow, exportFlow, importFlowFile, clear } = useFlowCommands();
  const loadAllNodes = useLoadAllNodes();
  const autoLayout = useAutoLayout();
  const fileInputRef = useRef(null);

  const statusLabel = (() => {
    if (saveStatus === "saving") return "Saving…";
    if (saveStatus === "error") return "Save failed";
    if (lastSavedAt) {
      return `Saved ${new Date(lastSavedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }
    return null;
  })();

  const onImportChange = (event) => {
    importFlowFile(event.target.files?.[0]);
    event.target.value = "";
  };

  return (
    <>
      <HeaderMenu>
        {!demoMode && (
          <Dropdown
            items={[
              { label: "Save", onSelect: save },
              { label: "Save as…", onSelect: saveAs },
              { label: "Open…", onSelect: openFlows },
              { label: "New flow", onSelect: newFlow },
              { label: "Import flow…", onSelect: () => fileInputRef.current?.click() },
              { label: "Export flow", onSelect: () => exportFlow() },
              { label: "Clear", onSelect: clear },
            ]}
            label={<HeaderLabel className="mr-0">File</HeaderLabel>}
            testId="menu-file"
          />
        )}
        <Dropdown
          items={[
            { label: "Undo", onSelect: () => undo() },
            { label: "Redo", onSelect: () => redo() },
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
          label={<HeaderLabel className="mr-0">View</HeaderLabel>}
          testId="menu-view"
        />
        <Dropdown
          items={[
            {
              label: "Introduction Flow",
              onSelect: () => loadFlow("introduction").catch(() => {}),
            },
          ]}
          label={<HeaderLabel className="mr-0">Help</HeaderLabel>}
          testId="menu-help"
        />
        <div className="ml-auto flex items-center">
          {!demoMode && statusLabel && (
            <div className="mr-[1em] text-[11px] text-silver-darken15" data-testid="save-status">
              {statusLabel}
            </div>
          )}
          <HeaderLabel className="mr-0">
            <a href="https://github.com/channely/datablocks" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </HeaderLabel>
        </div>
      </HeaderMenu>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={onImportChange}
        data-testid="flow-import-input"
      />
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
