/**
 * Transform blocks: filtering, merging, grouping, JavaScript, geocoding, and color scales.
 *
 * Every block reads upstream values through `useInputData` and publishes its result through
 * `updateNodeData` or `useUpdateNodeCurrent`. The Javascript block executes user code through
 * `lib/execution`; geocoding sends the user-supplied key to the selected provider.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import orderBy from "lodash-es/orderBy";
import groupBy from "lodash-es/groupBy";
import { CodeJar } from "codejar";
import hljs from "highlight.js/lib/core";
import javascriptLanguage from "highlight.js/lib/languages/javascript";
import ColorscalePicker, { Colorscale } from "react-colorscales";
import { extent } from "d3-array";
import { scaleSequential } from "d3-scale";
import useStore from "../store";
import useInputData from "../hooks/useInputData";
import useUpdateNodeCurrent from "../hooks/useUpdateNodeCurrent";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

// Only the JavaScript grammar is needed; the full highlight.js bundle ships ~190 languages.
hljs.registerLanguage("javascript", javascriptLanguage);

const labelClassName = "mb-1 text-silver-darken30";

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
    <NativeSelect value={value} onChange={onChange} wrapperClassName="mb-2">
      {options}
    </NativeSelect>
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
  const columnType = useMemo(() => getColumnType(input, column), [input, column]);

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
      updateNodeData({ id, data: { current: next, column: newColumn }, transient: true });
    },
    [id, updateNodeData, conditionId, conditionValue],
  );

  const runnable = current && columns;

  return (
    <div className="relative flex w-[250px] flex-col text-left">
      <div className="p-2">
        <Label className={labelClassName}>Column name:</Label>
        <ColumnSelect
          onChange={(value) =>
            updateNodeData({
              id,
              data: { column: value, conditionValue: "", conditionId: "" },
            })
          }
          onChangeData={onColumnChangeData}
          className="mb-1"
          handleId={id}
          value={column}
          inputData={input}
          inputValid={valid}
        />
        {runnable && (
          <>
            <Label className={labelClassName}>Condition:</Label>
            <ConditionSelect
              columnType={columnType}
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
      </div>
      {runnable && <Button onClick={run}>Run</Button>}
    </div>
  );
};
FilterComponent.displayName = "Filter";
export const Filter = withNodeWrapper(FilterComponent, { targetHandle: false });

/* ----------------------------------- Merge --------------------------------- */

/**
 * Left-joins `insertRows` onto `baseRows` by column value. Without a second input or column
 * selection the base value passes through unchanged.
 */
const mergeData = (base, baseRows, insertRows, baseColumn, insertColumn, baseType) => {
  if (!baseRows) return { current: undefined, count: 0 };
  if (!insertRows || !baseColumn || !insertColumn) return { current: base, count: 0 };
  const lookup = new Map(insertRows.map((row) => [row[insertColumn], row]));
  const emptyRow = getColumnNames(insertRows).reduce((result, name) => {
    result[name] = null;
    return result;
  }, {});
  let count = 0;
  const data = baseRows.map((row) => {
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

/**
 * The merged result is derived from both inputs and the two column names, then published with
 * `useUpdateNodeCurrent`. Node data only stores the column names (no raw rows, see invariant 1).
 */
const MergeComponent = ({ id, data, color }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const baseHandle = `${id}-base`;
  const insertHandle = `${id}-insert`;
  const { baseColumn, insertColumn } = data;

  const [base, baseType, baseValid] = useInputData(baseHandle, [TYPES.DATASET, TYPES.GEOJSON]);
  const [insert, insertType, insertValid] = useInputData(insertHandle, [
    TYPES.DATASET,
    TYPES.GEOJSON,
  ]);

  const baseRows = useMemo(() => convert(base, baseType), [baseType, base]);
  const insertRows = useMemo(() => convert(insert, insertType), [insertType, insert]);

  const merged = useMemo(
    () =>
      mergeData(
        baseValid ? base : null,
        baseValid ? baseRows : null,
        insertValid ? insertRows : null,
        baseColumn,
        insertColumn,
        baseType,
      ),
    [base, baseRows, insertRows, baseValid, insertValid, baseColumn, insertColumn, baseType],
  );
  useUpdateNodeCurrent(id, merged.current);

  const onBaseColumnChange = useCallback(
    (column) => updateNodeData({ id, data: { baseColumn: column } }),
    [id, updateNodeData],
  );
  // ColumnSelect auto-selects a column when the input changes; that write is not a user edit.
  const onBaseDataChange = useCallback(
    ({ column }) => updateNodeData({ id, data: { baseColumn: column }, transient: true }),
    [id, updateNodeData],
  );
  const onInsertColumnChange = useCallback(
    (column) => updateNodeData({ id, data: { insertColumn: column } }),
    [id, updateNodeData],
  );
  const onInsertDataChange = useCallback(
    ({ column }) => updateNodeData({ id, data: { insertColumn: column }, transient: true }),
    [id, updateNodeData],
  );

  return (
    <div className="relative w-[200px] p-2 text-left">
      <ColumnSelect
        onChange={onBaseColumnChange}
        onChangeData={onBaseDataChange}
        color={color}
        className="mb-1"
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
      <div className="mt-2" data-testid="merge-count">
        merged {merged.count} rows
      </div>
    </div>
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
      updateNodeData({ id, data: { current: grouped, column }, transient: true });
    },
    [id, updateNodeData],
  );

  return (
    <div className="w-[200px] p-2">
      <Label className={labelClassName}>Column name:</Label>
      <ColumnSelect
        onChange={onChange}
        onChangeData={onChangeData}
        color={color}
        className="mb-1"
        handleId={id}
        value={data.column}
        inputData={rows}
        inputValid={valid}
      />
    </div>
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
      updateNodeData({
        id,
        data: { current: input.slice(start, end), endIndex: end },
        transient: true,
      });
    } else {
      updateNodeData({
        id,
        data: { current: null, startIndex: 0, endIndex: "" },
        transient: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, input, valid, updateNodeData]);

  return (
    <div className="p-2">
      {valid ? (
        <div>
          <Label className={labelClassName}>From index:</Label>
          <Input
            type="number"
            onChange={onStartChange}
            value={startIndex}
            className="nodrag min-w-[120px]"
            min={0}
            max={input.length}
          />
          <Label className="my-1 text-silver-darken30">To index:</Label>
          <Input
            type="number"
            onChange={onEndChange}
            value={endIndex}
            className="nodrag min-w-[120px]"
            min={0}
            max={input.length}
          />
        </div>
      ) : (
        "← connect dataset…"
      )}
    </div>
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
      updateNodeData({ id, data: { current: sorted, column: newColumn }, transient: true });
    },
    [id, updateNodeData, order],
  );

  return (
    <div className="w-[200px] p-2">
      <Label className={labelClassName}>Column name:</Label>
      <ColumnSelect
        onChange={onColumnChange}
        onChangeData={onChangeData}
        color={color}
        className="mb-1"
        handleId={sortHandle}
        value={column}
        inputData={input}
        inputValid={valid}
      />
      <Label className={labelClassName}>Order:</Label>
      <NativeSelect value={order} onChange={onOrderChange}>
        <option value="asc">Ascending</option>
        <option value="desc">Descending</option>
      </NativeSelect>
    </div>
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
        transient: true,
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
    // Copy the edited entry; mutating it in place would also rewrite the undo snapshot.
    const next = inputs.map((input, i) =>
      i === index ? { ...input, [field]: value || "" } : input,
    );
    updateNodeData({ id, data: { inputs: next } });
  };

  const hasRows = data && columns;
  const canAdd = hasRows && inputs.length < columns.length;

  return (
    <div className="relative flex w-[250px] flex-col text-left">
      <div className="p-2">
        {inputs.map((input, index) => (
          // Rename rows are positional (no stable id); index keys match that model.
          // eslint-disable-next-line @eslint-react/no-array-index-key
          <div key={`select-${index}`} className="flex items-start">
            <div className="mr-[10px] w-[119px]">
              <NativeSelect
                wrapperClassName="mb-[5px] w-[119px]"
                onChange={(event) => change(event.target.value, index, "old")}
                value={input.old}
              >
                {renderOptions(input.old)}
              </NativeSelect>
            </div>
            <Input
              placeholder="new name"
              value={input.new || ""}
              onChange={(event) => change(event.target.value, index, "new")}
              className="nodrag h-[31px] w-[109px]"
            />
          </div>
        ))}
        {canAdd && (
          <button
            className="cursor-pointer leading-none text-[#bbb]"
            onClick={addColumn}
            title="rename another column"
          >
            + add another column
          </button>
        )}
      </div>
      {hasRows && (
        <Button className="w-full" onClick={run}>
          Run
        </Button>
      )}
    </div>
  );
};
RenameColumnsComponent.displayName = "RenameColumns";
export const RenameColumns = withNodeWrapper(RenameColumnsComponent);

/* -------------------------------- Javascript ------------------------------- */

const Code = ({ code }) => (
  <div
    className="border-0 border-solid border-[rgba(255,255,255,0.16)] pl-[3px] leading-[1.2] text-[#6272a4] select-none"
    // highlight.js escapes the source text; its output only adds span markup.
    // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
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
    <div
      className={cn(
        "flex w-[360px] flex-col text-left font-mono text-[12px] leading-[1.2] font-normal",
        className,
      )}
    >
      <div className="my-1">
        <Code code={`async function f(${args}) {`} />
        <div className="pl-3">
          <div
            className="codejar-editor language-js"
            ref={editorRef}
            onFocus={() => {
              setCodeEditorFocused(true);
              if (onFocus) onFocus();
            }}
            onBlur={() => setCodeEditorFocused(false)}
          />
        </div>
        <Code code="}" />
      </div>
      <Button className="mt-auto" onClick={onRun} title="ctrl + enter">
        Run
      </Button>
    </div>
  );
};
CodeEditor.displayName = "CodeEditor";

const PRETTIER_OPTIONS = {
  parser: "babel",
  singleQuote: true,
  arrowParens: "avoid",
  trailingComma: "none",
  printWidth: 60,
};

/**
 * Formats user code for display; keeps the original text when it does not parse. Prettier and its
 * Babel parser (~1MB) are loaded on first use so they stay out of the initial bundle.
 */
const formatCode = async (code) => {
  try {
    const [prettier, babelPlugin] = await Promise.all([
      import("prettier/standalone"),
      import("prettier/plugins/babel"),
    ]);
    return await prettier.format(code, { ...PRETTIER_OPTIONS, plugins: [babelPlugin] });
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
      transient: true,
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
    <div>
      <Handle
        type="target"
        position={Position.Left}
        id={handleA}
        className="js-handle"
        data-label="a"
        data-testid="target-handle"
        style={{ top: 50, left: -22, height: 20, width: 20 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id={handleB}
        className="js-handle"
        data-label="b"
        data-testid="target-handle"
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
    </div>
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

const GEOCODE_BATCH = 50;

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

  const geocoded = Boolean(data.current?.[0]?.latitude || data.current?.[0]?.longitude);
  const onColumnChangeData = useCallback(
    ({ data: newData, column }) => {
      if (!geocoded) {
        updateNodeData({ id, data: { current: newData, column }, transient: true });
      }
    },
    [id, geocoded, updateNodeData],
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
      rows[index] = { ...rows[index], latitude: lat, longitude: lng };
      // Publish progress every GEOCODE_BATCH rows (and at the end) instead of once per request;
      // each publish is a fresh array so downstream blocks see a new value.
      if ((index + 1) % GEOCODE_BATCH === 0 || index === rows.length - 1) {
        updateNodeData({ id, data: { current: rows.slice() }, transient: true });
      }
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
    <div className="min-w-[200px] p-2">
      <Label className={labelClassName}>Provider:</Label>
      <NativeSelect value={data.provider} onChange={onProviderChange}>
        {PROVIDERS.map((provider) => (
          <option value={provider.value} key={provider.value}>
            {provider.label}
          </option>
        ))}
      </NativeSelect>
      <Label className={labelClassName}>Api key:</Label>
      <Input value={data.apiKey} onChange={onApiKeyChange} className="nodrag mb-2 w-[200px]" />
      <Label className={cn(labelClassName, "mt-2")}>Column to geocode:</Label>
      <ColumnSelect
        handleId={geocodeHandle}
        onChange={onColumnChange}
        onChangeData={onColumnChangeData}
        value={data.column}
        inputData={input}
        inputValid={valid}
      />
      <Button className="mt-2" disabled={processing} onClick={run}>
        {processing ? "Processing…" : "Run"}
      </Button>
    </div>
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
    <div className="min-w-[200px] p-2">
      <ColumnSelect
        onChange={onChange}
        handleId={id}
        inputData={input}
        inputValid={valid}
        value={columnName}
        noConnectionLabel="connect geojson or dataset…"
      />
      <div className="mt-2">
        <Colorscale
          colorscale={colorScale}
          onClick={() => updateNodeData({ id, data: { colorScaleExpanded: !colorScaleExpanded } })}
        />
      </div>
      {colorScaleExpanded && (
        <div className="nodrag nowheel">
          <ColorscalePicker
            onChange={(value) => updateNodeData({ id, data: { colorScale: value } })}
          />
        </div>
      )}
    </div>
  );
};
ColorizeComponent.displayName = "Colorize";
export const Colorize = withNodeWrapper(ColorizeComponent, { targetHandle: false });

export { formatValue };
