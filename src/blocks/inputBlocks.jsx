/**
 * Input blocks. Each block acquires a value and publishes it through
 * `updateNodeData({ id, data: { current } })`; the store stores the value in the DataStore and
 * keeps only an id on the node. Input blocks have no target handle.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Box, Button, Flex, FormLabel, Input, Select, Textarea } from "@chakra-ui/react";
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
    <Flex
      {...getRootProps()}
      opacity={isDragActive ? 0.8 : 1}
      alignItems="center"
      justifyContent="center"
      flexDirection="column"
      p={2}
      height="100px"
      cursor="grab"
    >
      <input {...getInputProps()} />
      <Flex alignItems="center">
        Drop file here or
        <Button ml={2}>Open file dialog</Button>
      </Flex>
      <Box mt={1} color="silverDarken30">
        Allowed types: csv, json, geojson, topojson
      </Box>
    </Flex>
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
    <Box minWidth="200px" textAlign="center">
      {data.current ? (
        <Box minWidth="200px" textAlign="center" p={2} fontSize="11px">
          {fileName}
        </Box>
      ) : (
        <DropZone onDrop={onDrop} />
      )}
    </Box>
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
    <Box p={2}>
      <FormLabel mb={1} color="silverDarken30">
        Data type
      </FormLabel>
      <Select
        mb={2}
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
      </Select>
      <Textarea
        placeholder="Paste data here…"
        className="nodrag nowheel"
        height={150}
        width={250}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          updateNodeData({ id, data: { inputValue: e.target.value } });
        }}
      />
    </Box>
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
    let cancelled = false;
    const example = EXAMPLES[index];
    fetch(example.file)
      .then((response) => response.text())
      .then((text) => {
        if (cancelled) return;
        const result = example.file.endsWith(".csv") ? parseCsv(text) : parseJson(text);
        if (!result.error) updateNodeData({ id, data: { current: result.data } });
      });
    return () => {
      cancelled = true;
    };
  }, [index, id, updateNodeData]);

  return (
    <Box p={2} width={200}>
      <Select
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
      </Select>
      <Box mt={2} color="comment">
        Data Source: {EXAMPLES[index].source}
      </Box>
    </Box>
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
    <Box p={2} minWidth="300px">
      <FormLabel mb={1} color="silverDarken30">
        URL:
      </FormLabel>
      <form onSubmit={submit}>
        <Input
          className="nodrag"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
        <Button mt={2} type="submit" disabled={loading}>
          {loading ? "Loading…" : "Load Data"}
        </Button>
      </form>
    </Box>
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
    <Box p={2} minWidth="300px" position="relative">
      <FormLabel mb={1} color="silverDarken30">
        Google Sheet Id:
      </FormLabel>
      <form onSubmit={load}>
        <Input className="nodrag" value={sheetId} onChange={(e) => setSheetId(e.target.value)} />
        <Button mt={2} type="submit" disabled={loading}>
          {loading ? "Loading…" : "Load Data"}
        </Button>
      </form>
      {sheets.length > 0 && (
        <Box mt={2}>
          <Box mb={1} color="silverDarken30">
            Active sheet:
          </Box>
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
        </Box>
      )}
      {loading && <Box position="absolute" inset={0} bg="rgba(0,0,0,0.25)" />}
    </Box>
  );
};

export const File = withNodeWrapper(FileComponent, { targetHandle: false });
export const Paste = withNodeWrapper(PasteComponent, { targetHandle: false });
export const ExampleData = withNodeWrapper(ExampleDataComponent, { targetHandle: false });
export const Request = withNodeWrapper(RequestComponent, { targetHandle: false });
export const Spreadsheet = withNodeWrapper(SpreadsheetComponent, { targetHandle: false });
