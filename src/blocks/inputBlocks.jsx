/**
 * Input blocks. Each block acquires a value and publishes it through
 * `updateNodeData({ id, data: { current } })`; the store stores the value in the DataStore and
 * keeps only an id on the node. Input blocks have no target handle.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useDropzone } from "react-dropzone";
import useStore from "../store";
import { parseFile, parseText, parseCsv, parseJson, fetchData } from "../lib/dataIO";
import { withNodeWrapper } from "../components/NodeWrapper";

const DropZone = ({ onDrop }) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDropAccepted: (files) => files[0] && onDrop(files[0]),
    noDragEventsBubbling: true,
  });
  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex h-[100px] cursor-grab flex-col items-center justify-center p-2",
        isDragActive ? "opacity-80" : "opacity-100",
      )}
    >
      <input {...getInputProps()} />
      <div className="flex items-center">
        Drop file here or
        <Button className="ml-2">Open file dialog</Button>
      </div>
      <div className="mt-1 text-silver-darken30">Allowed types: csv, json, geojson, topojson</div>
    </div>
  );
};

const FileComponent = ({ id, data }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const addLogs = useStore((state) => state.addLogs);
  const fileName = data.fileName;

  const onDrop = useCallback(
    async (file) => {
      const result = await parseFile(file);
      if (result.error) {
        addLogs({ method: "error", data: [result.error] });
      } else {
        updateNodeData({ id, data: { current: result.data, fileName: file.name } });
      }
    },
    [id, updateNodeData, addLogs],
  );

  return (
    <div className="min-w-[200px] text-center">
      {data.current ? (
        <div className="min-w-[200px] p-2 text-center text-[11px]">{fileName}</div>
      ) : (
        <DropZone onDrop={onDrop} />
      )}
    </div>
  );
};

const PasteComponent = ({ id, data }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const addLogs = useStore((state) => state.addLogs);
  const [value, setValue] = useState(data.inputValue || "");
  const [type, setType] = useState(data.inputType || "json");

  useEffect(() => {
    if (!value.length) return;
    let cancelled = false;
    parseText(value, type).then((result) => {
      if (cancelled) return;
      if (result.error) {
        addLogs({ method: "error", data: [result.error.message || result.error] });
      } else {
        updateNodeData({ id, data: { current: result.data } });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value, type, id, updateNodeData, addLogs]);

  return (
    <div className="p-2">
      <Label className="mb-1 text-silver-darken30">Data type</Label>
      <NativeSelect
        wrapperClassName="mb-2"
        value={type}
        onChange={(e) => {
          setType(e.target.value);
          updateNodeData({ id, data: { inputType: e.target.value } });
        }}
      >
        {(data.inputTypeOptions || ["json", "csv", "text"]).map((option) => (
          <option value={option} key={option}>
            {option.toUpperCase()}
          </option>
        ))}
      </NativeSelect>
      <Textarea
        placeholder="Paste data here…"
        className="nodrag nowheel h-[150px] w-[250px]"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          updateNodeData({ id, data: { inputValue: e.target.value } });
        }}
      />
    </div>
  );
};

/** Static demo datasets; paths are base-aware so sub-path hosting (GitHub Pages) works. */
const EXAMPLES = [
  {
    name: "Countries Indicators",
    file: `${import.meta.env.BASE_URL}data/examples/countries_indicators.csv`,
    source: "gapminder.com",
  },
  {
    name: "UFO Sightings",
    file: `${import.meta.env.BASE_URL}data/examples/ufo-sightings.csv`,
    source: "nuforc.org/",
  },
  {
    name: "Berlin Geojson",
    file: `${import.meta.env.BASE_URL}data/examples/berlin.geojson`,
    source: "daten.odis-berlin.de",
  },
  {
    name: "Berlin Outline Geojson",
    file: `${import.meta.env.BASE_URL}data/examples/berlin_outline.geojson`,
    source: "daten.odis-berlin.de",
  },
];

const ExampleDataComponent = ({ id, data }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const [index, setIndex] = useState(data.index || 0);

  useEffect(() => {
    const controller = new AbortController();
    const example = EXAMPLES[index];
    fetch(example.file, { signal: controller.signal })
      .then((response) => response.text())
      .then((text) => {
        const result = example.file.endsWith(".csv") ? parseCsv(text) : parseJson(text);
        if (!result.error) updateNodeData({ id, data: { current: result.data } });
      })
      .catch((error) => {
        if (error.name !== "AbortError") throw error;
      });
    return () => controller.abort();
  }, [index, id, updateNodeData]);

  return (
    <div className="w-[200px] p-2">
      <NativeSelect
        value={index}
        onChange={(e) => {
          const next = Number(e.target.value);
          setIndex(next);
          updateNodeData({ id, data: { index: next } });
        }}
      >
        {EXAMPLES.map((example, i) => (
          <option value={i} key={example.name}>
            {example.name}
          </option>
        ))}
      </NativeSelect>
      <div className="mt-2 text-comment">Data Source: {EXAMPLES[index].source}</div>
    </div>
  );
};

const RequestComponent = ({ id }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const addLogs = useStore((state) => state.addLogs);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!url) {
      addLogs({ method: "error", data: ["Request: Please type in an URL."] });
      return;
    }
    setLoading(true);
    const result = await fetchData(url);
    setLoading(false);
    if (result.error) {
      addLogs({ method: "error", data: [result.error] });
    } else {
      updateNodeData({ id, data: { url, current: result.data } });
    }
  };

  return (
    <div className="min-w-[300px] p-2">
      <Label className="mb-1 text-silver-darken30">URL:</Label>
      <form onSubmit={submit}>
        <Input
          className="nodrag"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
        <Button className="mt-2" type="submit" disabled={loading}>
          {loading ? "Loading…" : "Load Data"}
        </Button>
      </form>
    </div>
  );
};

const FUNCTIONS_ENDPOINT = import.meta.env.VITE_FUNCTIONS_ENDPOINT || "";

const SpreadsheetComponent = ({ id }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const addLogs = useStore((state) => state.addLogs);
  const [sheetId, setSheetId] = useState("");
  const [sheets, setSheets] = useState([]);
  const [activeSheet, setActiveSheet] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${FUNCTIONS_ENDPOINT}/spreadsheet?id=${sheetId}`);
      const spreadsheet = await response.json();
      if (response.status === 200) {
        setSheets(spreadsheet.sheets);
        const sheet = activeSheet || spreadsheet.sheets[0];
        setActiveSheet(sheet);
        updateNodeData({ id, data: { current: spreadsheet.data } });
      } else if (response.status === 400) {
        addLogs({ method: "error", data: ["Spreadsheet: Sheet could not be loaded."] });
      }
    } catch (error) {
      addLogs({ method: "error", data: [error.message] });
    }
    setLoading(false);
  };

  return (
    <div className="relative min-w-[300px] p-2">
      <Label className="mb-1 text-silver-darken30">Google Sheet Id:</Label>
      <form onSubmit={load}>
        <Input className="nodrag" value={sheetId} onChange={(e) => setSheetId(e.target.value)} />
        <Button className="mt-2" type="submit" disabled={loading}>
          {loading ? "Loading…" : "Load Data"}
        </Button>
      </form>
      {sheets.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-silver-darken30">Active sheet:</div>
          {sheets.map((sheet) => (
            <label key={sheet} style={{ display: "block" }}>
              <input
                type="radio"
                name={`sheet-${id}`}
                checked={activeSheet === sheet}
                onChange={() => setActiveSheet(sheet)}
              />{" "}
              {sheet}
            </label>
          ))}
        </div>
      )}
      {loading && <div className="absolute inset-0 bg-[rgba(0,0,0,0.25)]" />}
    </div>
  );
};

export const File = withNodeWrapper(FileComponent, { targetHandle: false });
export const Paste = withNodeWrapper(PasteComponent, { targetHandle: false });
export const ExampleData = withNodeWrapper(ExampleDataComponent, { targetHandle: false });
export const Request = withNodeWrapper(RequestComponent, { targetHandle: false });
export const Spreadsheet = withNodeWrapper(SpreadsheetComponent, { targetHandle: false });
