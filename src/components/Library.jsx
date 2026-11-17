/**
 * Block library modal (also used as an inline drop target). Blocks are filtered by group and
 * search text; clicking an item creates a node and closes the modal.
 */
import React, { useRef, useState } from "react";
import { Dialog, DialogBody, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
    <div
      className="blockitem flex scale-100 cursor-pointer flex-col rounded-[4px] border border-solid border-bg-light bg-bg-light p-[10px] text-text transition-transform duration-100 select-none hover:scale-[1.03] hover:border-bg-lighter hover:text-text"
      onClick={() => {
        addNode({ ...data });
        setModal(null);
      }}
      data-testid={`blockitem-${type}`}
    >
      <div className="mb-2 text-xl font-bold">
        {Icon && <Icon />} {title}
      </div>
      <div className="text-silver-darken15">{description}</div>
      <div className="mt-auto pt-[10px] text-[12px] text-silver-darken30">
        <div>Input: {typesLabel(input)}</div>
        <div>Output: {typesLabel(output)}</div>
      </div>
    </div>
  );
};

const GroupFilter = ({ isActive, children, ...props }) => (
  <Panel
    className={cn(
      "cursor-pointer pl-0 select-none hover:text-primary",
      isActive ? "text-primary" : "text-text",
    )}
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
    <div className="flex">
      <div className="flex-[0_0_180px] py-3 pr-2">
        <DialogTitle className="mb-3">Block Library</DialogTitle>
        <div className="mb-3">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value.toLowerCase());
              setActiveGroup(null);
            }}
            placeholder="Search..."
            ref={inputRef}
            data-testid="search"
            className="w-full"
          />
        </div>
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
                <div className="mr-2">
                  <Icon />
                </div>
              )}
              <SectionLabel>{group}</SectionLabel>
            </GroupFilter>
          );
        })}
      </div>
      <div className="h-full grow">
        {Object.entries(grouped).map(([group, blocks]) => (
          <React.Fragment key={group}>
            <div
              className="blockgroup flex px-3 pt-4 pb-2"
              data-testid={`blockgroup-${kebab(group)}`}
            >
              <SectionLabel>{group}</SectionLabel>
            </div>
            <div className="grid auto-rows-fr grid-cols-[repeat(3,200px)] gap-[15px] overflow-auto p-3">
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
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export const Library = () => {
  const modal = useStore((state) => state.modal);
  if (!modal || modal.type !== "library") return null;
  return <LibraryModal data={modal} />;
};

const LibraryModal = ({ data }) => {
  const setModal = useStore((state) => state.setModal);
  return (
    <Dialog open onOpenChange={(open) => !open && setModal(null)}>
      <DialogContent className="max-w-[72rem]" data-testid="modal-library">
        <DialogBody>
          <BlockLibrary data={data} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};

export default Library;
