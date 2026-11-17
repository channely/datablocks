/**
 * Misc blocks: statistics, markdown, and export.
 *
 * Markdown is rendered from user input, so the converted HTML is sanitized with DOMPurify
 * before it reaches `dangerouslySetInnerHTML`. Keep that boundary if the renderer changes.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { min, max, mean, median, sum } from "d3-array";
import DOMPurify from "dompurify";
import useStore from "../store";
import useInputData from "../hooks/useInputData";
import useUpdateNodeCurrent from "../hooks/useUpdateNodeCurrent";
import { TYPES } from "../lib/types";
import { getExportFormats } from "../lib/exporters";
import ColumnSelect from "../components/ColumnSelect";
import { PencilIcon, EyeIcon, XIcon } from "../components/icons";
import { withNodeWrapper } from "../components/NodeWrapper";
import "./markdown.css";

/* ---------------------------------- Stats ---------------------------------- */

const STATS = {
  Min: (data, column) => min(data, (row) => row[column]),
  Max: (data, column) => max(data, (row) => row[column]),
  Average: (data, column) => mean(data, (row) => row[column]),
  Median: (data, column) => median(data, (row) => row[column]),
  Sum: (data, column) => sum(data, (row) => row[column]),
};

const StatsTable = ({ column, data }) => {
  // Five full passes over the dataset; recompute only when the data or column changes.
  const values = useMemo(
    () =>
      data && column
        ? Object.entries(STATS).map(([name, fn]) => [
            name,
            Number.parseFloat(fn(data, column)).toFixed(2),
          ])
        : null,
    [data, column],
  );
  if (!values) return null;
  return (
    <div>
      {values.map(([name, value]) => (
        <div className="flex justify-between py-2" key={name}>
          <div className="pr-2">{name}</div>
          <div className="font-bold">{value}</div>
        </div>
      ))}
    </div>
  );
};

const StatsComponent = ({ id, data }) => {
  const [input, , valid] = useInputData(id, [TYPES.DATASET]);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const { column } = data;

  const onChange = useCallback(
    (value) => updateNodeData({ id, data: { column: value } }),
    [id, updateNodeData],
  );
  const onChangeData = useCallback(
    (value) =>
      updateNodeData({
        id,
        data: { current: value.data, column: value.column },
        transient: true,
      }),
    [id, updateNodeData],
  );

  return (
    <div className="min-w-[200px] p-2">
      <ColumnSelect
        onChange={onChange}
        onChangeData={onChangeData}
        fromHandle={id}
        value={column}
        inputData={input}
        inputValid={valid}
      />
      <StatsTable column={column} data={input} />
    </div>
  );
};
StatsComponent.displayName = "Stats";
export const Stats = withNodeWrapper(StatsComponent);

/* -------------------------------- Markdown --------------------------------- */

const SHOWDOWN_OPTIONS = {
  tables: true,
  simplifiedAutoLink: true,
  strikethrough: true,
  tasklists: true,
};

let converterPromise = null;
/** Showdown is loaded the first time a Markdown node previews, keeping it off the first load. */
const loadConverter = () => {
  if (!converterPromise) {
    converterPromise = import("showdown").then(({ Converter }) => new Converter(SHOWDOWN_OPTIONS));
  }
  return converterPromise;
};

/** Sanitizes the HTML produced by Showdown; markdown authors are untrusted input. */
export const sanitizeHtml = (html) => DOMPurify.sanitize(html);

export const Markdown = ({ id, data }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const removeElements = useStore((state) => state.removeElements);
  const inputValue = data.inputValue;
  const write = data.mode === "write";

  const toggleMode = useCallback(
    () => updateNodeData({ id, data: { mode: write ? "preview" : "write" } }),
    [id, updateNodeData, write],
  );

  const onChange = useCallback(
    (event) => updateNodeData({ id, data: { inputValue: event.target.value } }),
    [id, updateNodeData],
  );

  const [html, setHtml] = useState("");
  useEffect(() => {
    if (write) return undefined;
    let cancelled = false;
    loadConverter().then((converter) => {
      if (!cancelled) setHtml(sanitizeHtml(converter.makeHtml(inputValue || "")));
    });
    return () => {
      cancelled = true;
    };
  }, [inputValue, write]);

  const remove = useCallback(() => removeElements([{ id }]), [removeElements, id]);

  return (
    <div className={cn("relative w-[300px] [&:hover_.toggle-wrapper]:flex", write ? "nodrag" : "")}>
      {write ? (
        <Textarea
          className="h-[200px] resize-y rounded-[1px] border-none bg-white p-2 text-black"
          onChange={onChange}
          value={inputValue}
        />
      ) : (
        // `html` comes from sanitizeHtml (DOMPurify) above.
        // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
        <div className="markdown-body leading-[1.4]" dangerouslySetInnerHTML={{ __html: html }} />
      )}
      <div
        className={cn(
          "toggle-wrapper absolute top-0 right-0 hidden",
          write ? "text-black" : "text-white",
        )}
      >
        <Button onClick={remove} data-testid="remove">
          <XIcon />
        </Button>
        <Button onClick={toggleMode}>
          {write ? (
            <EyeIcon size={12} data-testid="view" />
          ) : (
            <PencilIcon size={12} data-testid="edit" />
          )}
        </Button>
      </div>
    </div>
  );
};
Markdown.displayName = "MarkdownNode";

/* ---------------------------------- Export --------------------------------- */

const ExportComponent = ({ id }) => {
  const [current, type] = useInputData(id);
  const formats = useMemo(() => getExportFormats(type), [type]);

  useUpdateNodeCurrent(id, current);

  return (
    <div className="min-w-[200px] p-2">
      {current
        ? formats.map((format, index) => (
            <div key={format.filetype}>
              <Button
                onClick={() => format.handler(current, type)}
                className={cn("w-full", index < formats.length - 1 ? "mb-1" : "mb-0")}
              >
                Download {format.filetype}
              </Button>
            </div>
          ))
        : "← connect data…"}
    </div>
  );
};
ExportComponent.displayName = "Export";
export const Export = withNodeWrapper(ExportComponent, { sourceHandle: false });
