/**
 * Transform blocks: filtering, merging, grouping, JavaScript, geocoding, and color scales.
 *
 * Every block reads upstream values through `useInputData` and publishes its result through
 * `updateNodeData` or `useUpdateNodeCurrent`. The Javascript block executes user code through
 * `lib/execution`; geocoding sends the user-supplied key to the selected provider.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Flex, FormLabel, Input, Select } from "@chakra-ui/react";
import { Handle, Position } from "react-flow-renderer";
import orderBy from "lodash-es/orderBy";
import groupBy from "lodash-es/groupBy";
import { CodeJar } from "codejar";
import hljs from "highlight.js";
import prettier from "prettier/standalone";
import * as babelPlugin from "prettier/plugins/babel";
import ColorscalePicker, { Colorscale } from "react-colorscales";
import { extent } from "d3-array";
import { scaleSequential } from "d3-scale";
import useStore from "../store";
import useInputData from "../hooks/useInputData";
import {
  TYPES,
  formatValue,
  getColumnNames,
  getColumnType,
  geoToRows,
  rowsToGeo,
} from "../lib/types";
import execution from "../lib/execution";
import ColumnSelect from "../components/ColumnSelect";
import { withNodeWrapper } from "../components/NodeWrapper";

const labelStyle = { mb: 1, color: "silverDarken30" };

/* ---------------------------------- Filter --------------------------------- */

const NUMBER_CONDITIONS = [
  { label: "number equals", test: (a, b) => a === b },
  { label: "number is greater than", test: (a, b) => a > b },
  { label: "number is greater than or equals", test: (a, b) => a >= b },
  { label: "number is less than", test: (a, b) => a < b },
  { label: "number is less than or equals", test: (a, b) => a <= b },
].map((condition) => ({ ...condition, columnType: TYPES.NUMBER }));

const STRING_CONDITIONS = [
  { label: "text is exactly", test: (a, b) => a === b },
  { label: "text is not exactly", test: (a, b) => a !== b },
  { label: "text includes", test: (a, b) => a?.includes?.(b) },
  { label: "text does not includes", test: (a, b) => !a?.includes?.(b) },
].map((condition) => ({ ...condition, columnType: TYPES.STRING }));

const COMMON_CONDITIONS = [
  {
    label: "data is not empty or null",
    test: (a) => typeof a !== "undefined" && a !== null,
    id: "notnull",
  },
  {
    label: "data matches regex",
    test: (a, b) => {
      const flags = b.replace(/.*\/([gimy]*)$/, "$1");
      const pattern = b.replace(new RegExp(`^/(.*?)/${flags}$`), "$1");
      return new RegExp(pattern, flags).test(a);
    },
    id: "regex",
  },
];

const CONDITIONS = NUMBER_CONDITIONS.concat(STRING_CONDITIONS, COMMON_CONDITIONS).map(
  (condition, index) => ({ ...condition, id: condition.id || `${index}` }),
);

const ConditionSelect = ({ columnType, value, onChange }) => {
  const options = useMemo(() => {
    let typed = null;
    if (columnType === TYPES.NUMBER || columnType === TYPES.STRING) {
      typed = CONDITIONS.filter((condition) => condition.columnType === columnType).map(
        (condition) => (
          <option value={condition.id} key={condition.label}>
            {condition.label}
          </option>
        ),
      );
    }
    return (
      <>
        <option value="">select condition</option>
        {typed}
        {COMMON_CONDITIONS.map((condition) => (
          <option value={condition.id} key={condition.label}>
            {condition.label}
          </option>
        ))}
      </>
    );
  }, [columnType]);

  return (
    <Select value={value} onChange={onChange} mb={2}>
      {options}
    </Select>
  );
};

const FilterComponent = ({ id, data }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const [input, , valid] = useInputData(id, [TYPES.DATASET]);
  const column = data.column;
  const conditionId = data.conditionId;
  const conditionValue = data.conditionValue;
  const current = data.current;

  const columns = useMemo(() => getColumnNames(input), [input]);

  const run = useCallback(() => {
    const condition = CONDITIONS.find((condition) => condition.id === conditionId);
    const filtered = input.filter((row) => condition.test(row[column], conditionValue));
    updateNodeData({ id, data: { current: filtered } });
  }, [column, conditionId, conditionValue, id, input, updateNodeData]);

  const onColumnChangeData = useCallback(
    ({ data: newData, column: newColumn }) => {
      let next = newData;
      if (conditionId && conditionValue) {
        const condition = CONDITIONS.find((condition) => condition.id === conditionId);
        next = newData.filter((row) => condition.test(row[newColumn], conditionValue));
      }
      updateNodeData({ id, data: { current: next, column: newColumn } });
    },
    [id, updateNodeData, conditionId, conditionValue],
  );

  const runnable = current && columns;

  return (
    <Flex width="250px" position="relative" textAlign="left" flexDirection="column">
      <Box p={2}>
        <FormLabel {...labelStyle}>Column name:</FormLabel>
        <ColumnSelect
          onChange={(value) =>
            updateNodeData({
              id,
              data: { column: value, conditionValue: "", conditionId: "" },
            })
          }
          onChangeData={onColumnChangeData}
          sx={{ mb: 1 }}
          handleId={id}
          value={column}
          inputData={input}
          inputValid={valid}
        />
        {runnable && (
          <>
            <FormLabel {...labelStyle}>Condition:</FormLabel>
            <ConditionSelect
              columnType={getColumnType(input, column)}
              value={conditionId}
              onChange={(event) =>
                updateNodeData({
                  id,
                  data: { conditionId: event.target.value, conditionValue: "" },
                })
              }
            />
            {conditionId && (
              <Input
                placeholder={conditionId === "regex" ? "/your_regex/g" : ""}
                value={conditionValue}
                onChange={(event) =>
                  updateNodeData({
                    id,
                    data: { conditionValue: event.target.value },
                  })
                }
                className="nodrag"
              />
            )}
          </>
        )}
      </Box>
      {runnable && <Button onClick={run}>Run</Button>}
    </Flex>
  );
};
FilterComponent.displayName = "Filter";
export const Filter = withNodeWrapper(FilterComponent, { targetHandle: false });

/* ----------------------------------- Merge --------------------------------- */

const mergeData = (baseData, insertData, baseColumn, insertColumn, baseType) => {
  if (!baseData) return null;
  if (!insertData || !baseColumn || !insertColumn) {
    return { data: baseData, count: 0 };
  }
  const lookup = new Map(insertData.map((row) => [row[insertColumn], row]));
  const emptyRow = getColumnNames(insertData).reduce((result, name) => {
    result[name] = null;
    return result;
  }, {});
  let count = 0;
  const data = baseData.map((row) => {
    const match = lookup.get(row[baseColumn]);
    if (match) {
      count += 1;
      return { ...match, ...row };
    }
    return { ...emptyRow, ...row };
  });
  const current = baseType === TYPES.GEOJSON ? rowsToGeo(data) : data;
  return { current, count };
};

const convert = (data, type) => (type === TYPES.GEOJSON ? geoToRows(data) : data);

const MergeComponent = ({ id, data, color }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const baseHandle = `${id}-base`;
  const insertHandle = `${id}-insert`;
  const { baseColumn, insertColumn, baseData, insertData, mergeCount } = data;

  const [base, baseType, baseValid] = useInputData(baseHandle, [TYPES.DATASET, TYPES.GEOJSON]);
  const [insert, insertType, insertValid] = useInputData(insertHandle, [
    TYPES.DATASET,
    TYPES.GEOJSON,
  ]);

  const baseRows = useMemo(() => convert(base, baseType), [baseType, base]);
  const insertRows = useMemo(() => convert(insert, insertType), [insertType, insert]);

  const onBaseColumnChange = useCallback(
    (column) => {
      const result = mergeData(baseData, insertData, column, insertColumn, baseType);
      updateNodeData({ id, data: { ...result, baseColumn: column } });
    },
    [baseData, insertData, insertColumn, baseType, id, updateNodeData],
  );

  const onBaseDataChange = useCallback(
    ({ data: newData, column }) => {
      const result = mergeData(newData, insertData, column, insertColumn, baseType);
      updateNodeData({
        id,
        data: { ...result, baseData: newData, baseColumn: column },
      });
    },
    [id, insertData, insertColumn, baseType, updateNodeData],
  );

  const onInsertColumnChange = useCallback(
    (column) => {
      const result = mergeData(baseData, insertData, baseColumn, column, baseType);
      updateNodeData({ id, data: { ...result, insertColumn: column } });
    },
    [baseData, insertData, baseColumn, baseType, id, updateNodeData],
  );

  const onInsertDataChange = useCallback(
    ({ data: newData, column }) => {
      const result = mergeData(baseData, newData, baseColumn, column, baseType);
      updateNodeData({
        id,
        data: { ...result, insertData: newData, insertColumn: column },
      });
    },
    [baseData, baseColumn, baseType, id, updateNodeData],
  );

  return (
    <Box p={2} width="200px" position="relative" textAlign="left">
      <ColumnSelect
        onChange={onBaseColumnChange}
        onChangeData={onBaseDataChange}
        color={color}
        sx={{ mb: 1 }}
        handleId={baseHandle}
        value={baseColumn}
        inputData={baseRows}
        inputValid={baseValid}
      />
      <ColumnSelect
        onChange={onInsertColumnChange}
        onChangeData={onInsertDataChange}
        color={color}
        handleId={insertHandle}
        value={insertColumn}
        inputData={insertRows}
        inputValid={insertValid}
      />
      <Box mt={2}>merged {mergeCount} rows</Box>
    </Box>
  );
};
MergeComponent.displayName = "Merge";
export const Merge = withNodeWrapper(MergeComponent, { targetHandle: false });

/* ----------------------------------- Group --------------------------------- */

const GroupComponent = ({ id, data, color }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const [input, inputType, valid] = useInputData(id, [TYPES.DATASET, TYPES.GEOJSON]);
  const rows = useMemo(
    () => (inputType === TYPES.GEOJSON ? geoToRows(input) : input),
    [inputType, input],
  );

  const onChange = useCallback(
    (column) => {
      const grouped = groupBy(rows, (row) => row[column]);
      updateNodeData({ id, data: { current: grouped, column } });
    },
    [id, rows, updateNodeData],
  );

  const onChangeData = useCallback(
    ({ data: newData, column }) => {
      const grouped = groupBy(newData, (row) => row[column]);
      updateNodeData({ id, data: { current: grouped, column } });
    },
    [id, updateNodeData],
  );

  return (
    <Box p={2} width={200}>
      <FormLabel {...labelStyle}>Column name:</FormLabel>
      <ColumnSelect
        onChange={onChange}
        onChangeData={onChangeData}
        color={color}
        sx={{ mb: 1 }}
        handleId={id}
        value={data.column}
        inputData={rows}
        inputValid={valid}
      />
    </Box>
  );
};
GroupComponent.displayName = "Group";
export const Group = withNodeWrapper(GroupComponent, { targetHandle: false });

/* ----------------------------------- Slice --------------------------------- */

const SliceComponent = ({ id, data }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const [input, , valid] = useInputData(id, [TYPES.DATASET, TYPES.ARRAY]);
  const { startIndex, endIndex } = data;

  const onStartChange = useCallback(
    (event) => {
      const value = event.target.value ?? 0;
      const end = endIndex ?? input.length;
      updateNodeData({ id, data: { startIndex: value, current: input.slice(value, end) } });
    },
    [input, endIndex, id, updateNodeData],
  );

  const onEndChange = useCallback(
    (event) => {
      const value = event.target.value ?? 0;
      const start = startIndex ?? 0;
      updateNodeData({ id, data: { endIndex: value, current: input.slice(start, value) } });
    },
    [input, startIndex, id, updateNodeData],
  );

  useEffect(() => {
    if (valid) {
      const start = startIndex ?? 0;
      const end = endIndex === "" ? input.length : endIndex;
      updateNodeData({ id, data: { current: input.slice(start, end), endIndex: end } });
    } else {
      updateNodeData({ id, data: { current: null, startIndex: 0, endIndex: "" } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, input, valid, updateNodeData]);

  return (
    <Box p={2}>
      {valid ? (
        <Box>
          <FormLabel {...labelStyle}>From index:</FormLabel>
          <Input
            type="number"
            onChange={onStartChange}
            value={startIndex}
            className="nodrag"
            min={0}
            max={input.length}
            minWidth={120}
          />
          <FormLabel my={1} color="silverDarken30">
            To index:
          </FormLabel>
          <Input
            type="number"
            onChange={onEndChange}
            value={endIndex}
            className="nodrag"
            min={0}
            max={input.length}
            minWidth={120}
          />
        </Box>
      ) : (
        "← connect dataset…"
      )}
    </Box>
  );
};
SliceComponent.displayName = "Slice";
export const Slice = withNodeWrapper(SliceComponent);

/* ----------------------------------- Sort ---------------------------------- */

const SortComponent = ({ id, data, color }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const sortHandle = `${id}-sort`;
  const { order, column } = data;
  const [input, , valid] = useInputData(sortHandle, [TYPES.DATASET]);

  const onOrderChange = useCallback(
    (event) => {
      const value = event.target.value;
      if (order !== value) {
        const sorted = orderBy(input, [column], [value]);
        updateNodeData({ id, data: { current: sorted, order: value } });
      }
    },
    [column, input, id, order, updateNodeData],
  );

  const onColumnChange = useCallback(
    (value) => {
      const sorted = orderBy(input, [value], [order]);
      updateNodeData({ id, data: { current: sorted, column: value } });
    },
    [input, id, order, updateNodeData],
  );

  const onChangeData = useCallback(
    ({ data: newData, column: newColumn }) => {
      const sorted = orderBy(newData, [newColumn], [order]);
      updateNodeData({ id, data: { current: sorted, column: newColumn } });
    },
    [id, updateNodeData, order],
  );

  return (
    <Box p={2} width={200}>
      <FormLabel {...labelStyle}>Column name:</FormLabel>
      <ColumnSelect
        onChange={onColumnChange}
        onChangeData={onChangeData}
        color={color}
        sx={{ mb: 1 }}
        handleId={sortHandle}
        value={column}
        inputData={input}
        inputValid={valid}
      />
      <FormLabel {...labelStyle}>Order:</FormLabel>
      <Select value={order} onChange={onOrderChange}>
        <option value="asc">Ascending</option>
        <option value="desc">Descending</option>
      </Select>
    </Box>
  );
};
SortComponent.displayName = "Sort";
export const Sort = withNodeWrapper(SortComponent, { targetHandle: false });

/* ------------------------------ Rename Columns ----------------------------- */

const RenameColumnsComponent = ({ id, data }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const [input] = useInputData(id, [TYPES.DATASET]);
  const columns = useMemo(() => getColumnNames(input), [input]);
  const inputs = useMemo(() => data.inputs || [{ old: "", new: null }], [data.inputs]);
  const current = data.current;

  useEffect(() => {
    if (input && inputs.length === 1 && !inputs[0].old) {
      updateNodeData({
        id,
        data: { current: input, inputs: [{ old: columns[0], new: null }] },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, input, inputs, columns]);

  const renderOptions = useCallback(
    (value) => {
      if (!current || !current.length) {
        return (
          <option disabled value="">
            connect …
          </option>
        );
      }
      const used = inputs.map((input) => input.old);
      return columns
        .filter((column) => column === value || !used.includes(column))
        .map((column) => (
          <option value={column} key={column}>
            {column}
          </option>
        ));
    },
    [current, columns, inputs],
  );

  const addColumn = useCallback(() => {
    const used = inputs.map((input) => input.old);
    const next = columns.find((column) => !used.includes(column));
    updateNodeData({ id, data: { inputs: inputs.concat([{ old: next, new: null }]) } });
  }, [id, inputs, columns, updateNodeData]);

  const run = useCallback(() => {
    const next = input.map((row) => {
      const copy = { ...row };
      inputs
        .filter((input) => input.new)
        .forEach((input) => {
          if (typeof copy[input.old] !== "undefined") {
            copy[input.new] = copy[input.old];
            delete copy[input.old];
          }
        });
      return copy;
    });
    updateNodeData({ id, data: { current: next } });
  }, [input, id, inputs, updateNodeData]);

  const change = (value, index, field) => {
    const next = inputs.map((input, i) => {
      if (i === index) input[field] = value || "";
      return input;
    });
    updateNodeData({ id, data: { inputs: next } });
  };

  const hasRows = data && columns;
  const canAdd = hasRows && inputs.length < columns.length;

  return (
    <Flex width="250px" position="relative" textAlign="left" flexDirection="column">
      <Box p={2}>
        {inputs.map((input, index) => (
          <Flex key={`select-${index}`} alignItems="flex-start">
            <Box width="119px" marginRight="10px">
              <Select
                mb="5px"
                width="119px"
                onChange={(event) => change(event.target.value, index, "old")}
                value={input.old}
              >
                {renderOptions(input.old)}
              </Select>
            </Box>
            <Input
              sx={{ height: 31, width: 109 }}
              placeholder="new name"
              value={input.new || ""}
              onChange={(event) => change(event.target.value, index, "new")}
              className="nodrag"
            />
          </Flex>
        ))}
        {canAdd && (
          <Box
            as="button"
            lineHeight={1}
            color="#bbb"
            cursor="pointer"
            onClick={addColumn}
            title="rename another column"
          >
            + add another column
          </Box>
        )}
      </Box>
      {hasRows && (
        <Button width="100%" onClick={run}>
          Run
        </Button>
      )}
    </Flex>
  );
};
RenameColumnsComponent.displayName = "RenameColumns";
export const RenameColumns = withNodeWrapper(RenameColumnsComponent);

/* -------------------------------- Javascript ------------------------------- */

const Code = ({ code }) => (
  <Box
    borderWidth={0}
    borderStyle="solid"
    borderColor="rgba(255, 255, 255, 0.16)"
    userSelect="none"
    color="#6272a4"
    lineHeight={1.2}
    paddingLeft="3px"
    dangerouslySetInnerHTML={{
      __html: hljs.highlight(code, { language: "javascript" }).value,
    }}
  />
);

const CodeEditor = ({ value, onChange, onRun, onFocus, hasInputData, className = null }) => {
  const setCodeEditorFocused = useStore((state) => state.setCodeEditorFocused);
  const editorRef = useRef(null);
  const jarRef = useRef(null);

  useEffect(() => {
    if (!editorRef.current) return undefined;
    const jar = CodeJar(editorRef.current, hljs.highlightElement, {
      tab: " ".repeat(2),
    });
    jar.updateCode(value || "");
    jar.onUpdate((code) => onChange(code));
    jarRef.current = jar;
    return () => {
      jar.destroy();
      jarRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const args = Object.entries(hasInputData)
    .filter(([, hasData]) => hasData)
    .map(([name]) => name)
    .join(", ");

  return (
    <Flex
      width="360px"
      textAlign="left"
      fontFamily="mono"
      fontSize="12px"
      fontWeight={400}
      lineHeight={1.2}
      flexDirection="column"
      className={className}
    >
      <Box my={1}>
        <Code code={`async function f(${args}) {`} />
        <Box pl={3}>
          <div
            className="codejar-editor language-js"
            ref={editorRef}
            onFocus={() => {
              setCodeEditorFocused(true);
              if (onFocus) onFocus();
            }}
            onBlur={() => setCodeEditorFocused(false)}
          />
        </Box>
        <Code code="}" />
      </Box>
      <Button mt="auto" onClick={onRun} title="ctrl + enter">
        Run
      </Button>
    </Flex>
  );
};
CodeEditor.displayName = "CodeEditor";

const PRETTIER_OPTIONS = {
  parser: "babel",
  singleQuote: true,
  arrowParens: "avoid",
  trailingComma: "none",
  printWidth: 60,
  plugins: [babelPlugin],
};

/** Formats user code for display; keeps the original text when it does not parse. */
const formatCode = async (code) => {
  try {
    return await prettier.format(code, PRETTIER_OPTIONS);
  } catch {
    return code;
  }
};

const runCode = async (code, a, b) => {
  try {
    const result = await execution.execute(`(async function funcWrapper() { ${code} })();`, {
      a,
      b,
    });
    return { result };
  } catch (error) {
    return { logs: [{ method: "error", data: [error.name, error.message] }] };
  }
};

const JsComponent = ({ id, data }) => {
  const handleA = `${id}_a`;
  const handleB = `${id}_b`;
  const [a, , hasA] = useInputData(handleA);
  const [b, , hasB] = useInputData(handleB);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const selectNode = useStore((state) => state.selectNode);
  const addLogs = useStore((state) => state.addLogs);
  const code = data?.code || "";

  const run = useCallback(async () => {
    const result = await runCode(code, a, b);
    updateNodeData({
      id,
      data: {
        current: result.result,
        code: await formatCode(code),
      },
    });
    if (result.logs && result.logs.length) addLogs(result.logs);
  }, [a, addLogs, b, id, updateNodeData, code]);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, id]);

  const onCodeChange = useCallback(
    (value) => updateNodeData({ id, data: { code: value } }),
    [id, updateNodeData],
  );

  const onFocus = useCallback(() => selectNode({ id }), [id, selectNode]);

  const hasInputData = useMemo(() => ({ a: hasA, b: hasB }), [hasA, hasB]);

  return (
    <Box>
      <Handle
        type="target"
        position={Position.Left}
        id={handleA}
        className="js-handle"
        data-label="a"
        style={{ top: 50, left: -22, height: 20, width: 20 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id={handleB}
        className="js-handle"
        data-label="b"
        style={{ top: 80, left: -22, height: 20, width: 20 }}
      />
      <CodeEditor
        value={code}
        onChange={onCodeChange}
        hasInputData={hasInputData}
        onRun={run}
        onFocus={onFocus}
        className="nodrag"
      />
    </Box>
  );
};
JsComponent.displayName = "CodeNode";
export const Js = withNodeWrapper(JsComponent, { targetHandle: false });

/* --------------------------------- Geocode --------------------------------- */

const PROVIDERS = [
  { value: "googlemaps", label: "Google Maps" },
  { value: "here", label: "Here" },
];

const replaceSpecial = (value = "") =>
  value
    .replace(/\s/g, "+")
    .replace(/ß/g, "ss")
    .replace(/ö|Ö/g, "oe")
    .replace(/ä|Ä/g, "ae")
    .replace(/ü|Ü/g, "ue");

/**
 * Builds a geocoding request URL. Both providers require the key as a query parameter in their
 * public APIs, so keys typed into this node are visible in network requests and flow data.
 * Recommend referrer restrictions and quotas in the UI copy and docs.
 */
const geocodeUrl = (value, apiKey, provider) => {
  const query = encodeURIComponent(replaceSpecial(value));
  if (provider === "googlemaps") {
    return `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}`;
  }
  return `https://geocode.search.hereapi.com/v1/geocode?q=${query}&apiKey=${apiKey}`;
};

const parseGeocodeResult = (json, provider) => {
  if (provider === "googlemaps") {
    return json.results?.[0]?.geometry?.location || {};
  }
  return json.items?.[0]?.position || {};
};

const GeocodeComponent = ({ id, data }) => {
  const geocodeHandle = `${id}-geocode`;
  const [input, , valid] = useInputData(geocodeHandle, [TYPES.DATASET]);
  const [processing, setProcessing] = useState(false);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const addLogs = useStore((state) => state.addLogs);

  const onApiKeyChange = useCallback(
    (event) => updateNodeData({ id, data: { apiKey: event.target.value } }),
    [id, updateNodeData],
  );

  const onColumnChange = useCallback(
    (column) => updateNodeData({ id, data: { column } }),
    [id, updateNodeData],
  );

  const onColumnChangeData = useCallback(
    ({ data: newData, column }) => {
      if (!data.current?.[0]?.latitude && !data.current?.[0]?.longitude) {
        updateNodeData({ id, data: { current: newData, column } });
      }
    },
    [id, data, updateNodeData],
  );

  const onProviderChange = useCallback(
    (event) => updateNodeData({ id, data: { provider: event.target.value } }),
    [id, updateNodeData],
  );

  const run = useCallback(async () => {
    if (!valid) {
      addLogs({ method: "error", data: ["Geocode: Invalid data or no data available."] });
      return;
    }
    if (!data.apiKey) {
      addLogs({ method: "error", data: ["Geocode: Please specify an api key."] });
      return;
    }
    setProcessing(true);
    const rows = input.map((row) => ({ ...row }));
    for (const [index, row] of rows.entries()) {
      const url = geocodeUrl(row[data.column], data.apiKey, data.provider);
      const response = await fetch(url);
      const json = await response.json();
      const { lat = "", lng = "" } = parseGeocodeResult(json, data.provider);
      rows[index].latitude = lat;
      rows[index].longitude = lng;
      updateNodeData({ id, data: { current: rows } });
      if (lat === "" || lng === "" || (data.provider === "googlemaps" && json.status !== "OK")) {
        addLogs({
          method: "error",
          data: [
            `Geocode error: Could not geocode ${data.column}:"${row[data.column]}". Status: ${json.status}`,
          ],
        });
      }
    }
    setProcessing(false);
  }, [valid, data.apiKey, data.column, data.provider, addLogs, input, updateNodeData, id]);

  return (
    <Box p={2} minWidth={200}>
      <FormLabel {...labelStyle}>Provider:</FormLabel>
      <Select value={data.provider} onChange={onProviderChange}>
        {PROVIDERS.map((provider) => (
          <option value={provider.value} key={provider.value}>
            {provider.label}
          </option>
        ))}
      </Select>
      <FormLabel {...labelStyle}>Api key:</FormLabel>
      <Input
        value={data.apiKey}
        onChange={onApiKeyChange}
        className="nodrag"
        mb={2}
        width="200px"
      />
      <FormLabel {...labelStyle} mt={2}>
        Column to geocode:
      </FormLabel>
      <ColumnSelect
        handleId={geocodeHandle}
        onChange={onColumnChange}
        onChangeData={onColumnChangeData}
        value={data.column}
        inputData={input}
        inputValid={valid}
      />
      <Button mt={2} disabled={processing} onClick={run}>
        {processing ? "Processing…" : "Run"}
      </Button>
    </Box>
  );
};
GeocodeComponent.displayName = "Geocode";
export const Geocode = withNodeWrapper(GeocodeComponent, { targetHandle: false });

/* -------------------------------- Colorize --------------------------------- */

const colorizeGeo = (geojson, columnName, colorScale) => {
  const domain = extent(geojson.features, (feature) => +feature.properties[columnName]);
  const scale = scaleSequential().domain(domain).range(colorScale);
  return {
    ...geojson,
    features: geojson.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        color: scale(+feature.properties[columnName]),
      },
    })),
  };
};

const colorizeRows = (rows, columnName, colorScale) => {
  const domain = extent(rows, (row) => +row[columnName]);
  const scale = scaleSequential().domain(domain).range(colorScale);
  return rows.map((row) => ({
    ...row,
    color: scale(+row[columnName]),
  }));
};

const ColorizeComponent = ({ id, data }) => {
  const { columnName, colorScale, colorScaleExpanded } = data;
  const [input, inputType, valid] = useInputData(id, [TYPES.GEOJSON, TYPES.DATASET]);
  const addLogs = useStore((state) => state.addLogs);
  const updateNodeData = useStore((state) => state.updateNodeData);

  const isGeoValid = inputType === TYPES.GEOJSON && valid && !!input?.features;
  const isDataValid = inputType === TYPES.DATASET && valid;
  const hasValidInput = isGeoValid || isDataValid;

  useEffect(() => {
    if (hasValidInput) {
      const result = (isGeoValid ? colorizeGeo : colorizeRows)(input, columnName, colorScale);
      updateNodeData({ id, data: { current: result } });
    } else if (inputType === TYPES.GEOJSON && !input?.features) {
      addLogs({
        method: "error",
        data: ["Colorize: only a feature collection is valid geo input."],
      });
    }
  }, [
    id,
    input,
    inputType,
    hasValidInput,
    isGeoValid,
    columnName,
    updateNodeData,
    colorScale,
    addLogs,
  ]);

  const onChange = useCallback(
    (column) => {
      const result = (isGeoValid ? colorizeGeo : colorizeRows)(input, column, colorScale);
      updateNodeData({ id, data: { columnName: column, current: result } });
    },
    [id, input, colorScale, updateNodeData, isGeoValid],
  );

  return (
    <Box minWidth={200} p={2}>
      <ColumnSelect
        onChange={onChange}
        handleId={id}
        inputData={input}
        inputValid={valid}
        value={columnName}
        noConnectionLabel="connect geojson or dataset…"
      />
      <Box mt={2}>
        <Colorscale
          colorscale={colorScale}
          onClick={() => updateNodeData({ id, data: { colorScaleExpanded: !colorScaleExpanded } })}
        />
      </Box>
      {colorScaleExpanded && (
        <Box className="nodrag nowheel">
          <ColorscalePicker
            onChange={(value) => updateNodeData({ id, data: { colorScale: value } })}
          />
        </Box>
      )}
    </Box>
  );
};
ColorizeComponent.displayName = "Colorize";
export const Colorize = withNodeWrapper(ColorizeComponent, { targetHandle: false });

export { formatValue };
