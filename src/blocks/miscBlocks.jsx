/**
 * Misc blocks: statistics, markdown, and export.
 *
 * Markdown is rendered from user input, so the converted HTML is sanitized with DOMPurify
 * before it reaches `dangerouslySetInnerHTML`. Keep that boundary if the renderer changes.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, Flex, Textarea } from "@chakra-ui/react";
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
    <Box>
      {values.map(([name, value]) => (
        <Flex justifyContent="space-between" py={2} key={name}>
          <Box pr={2}>{name}</Box>
          <Box fontWeight="bold">{value}</Box>
        </Flex>
      ))}
    </Box>
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
    <Box minWidth={200} p={2}>
      <ColumnSelect
        onChange={onChange}
        onChangeData={onChangeData}
        fromHandle={id}
        value={column}
        inputData={input}
        inputValid={valid}
      />
      <StatsTable column={column} data={input} />
    </Box>
  );
};
StatsComponent.displayName = "Stats";
export const Stats = withNodeWrapper(StatsComponent);

/* -------------------------------- Markdown --------------------------------- */

const MARKDOWN_STYLES = {
  p: { margin: "0.5rem 0" },
  h1: { margin: "0.8rem 0", fontSize: "20px", fontWeight: 700 },
  h2: { margin: "0.5rem 0", fontSize: "18px", fontWeight: 700 },
  "h3, h4, h4, h6": { margin: "0.25rem 0", fontSize: "16px", fontWeight: 700 },
  "ul, ol": { paddingLeft: "20px" },
};

const HOVER_STYLES = { ".toggle-wrapper": { display: "flex" } };

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
    <Box width="300px" _hover={HOVER_STYLES} className={write ? "nodrag" : ""} position="relative">
      {write ? (
        <Textarea
          bg="white"
          height="200px"
          resize="vertical"
          color="black"
          p={2}
          onChange={onChange}
          borderRadius="1px"
          border="none"
          value={inputValue}
        />
      ) : (
        // `html` comes from sanitizeHtml (DOMPurify) above.
        // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
        <Box lineHeight={1.4} sx={MARKDOWN_STYLES} dangerouslySetInnerHTML={{ __html: html }} />
      )}
      <Flex
        position="absolute"
        top={0}
        right={0}
        display="none"
        className="toggle-wrapper"
        color={write ? "black" : "white"}
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
      </Flex>
    </Box>
  );
};
Markdown.displayName = "MarkdownNode";

/* ---------------------------------- Export --------------------------------- */

const ExportComponent = ({ id }) => {
  const [current, type] = useInputData(id);
  const formats = useMemo(() => getExportFormats(type), [type]);

  useUpdateNodeCurrent(id, current);

  return (
    <Box p={2} minWidth={200}>
      {current
        ? formats.map((format, index) => (
            <Box key={format.filetype}>
              <Button
                onClick={() => format.handler(current, type)}
                width="100%"
                mb={index < formats.length - 1 ? 1 : 0}
              >
                Download {format.filetype}
              </Button>
            </Box>
          ))
        : "← connect data…"}
    </Box>
  );
};
ExportComponent.displayName = "Export";
export const Export = withNodeWrapper(ExportComponent, { sourceHandle: false });
