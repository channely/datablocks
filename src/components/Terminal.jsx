/**
 * Log console and command line. Console output from the JS sandbox is forwarded through
 * console-feed; supported commands are `help`, `intro`, `stats`, and `clear`.
 */
import React, { memo, useState } from "react";
import { Box, Flex, Input, useTheme } from "@chakra-ui/react";
import { Console, Decode, Hook } from "console-feed";
import useStore from "../store";
import execution from "../lib/execution";
import dataStore from "../lib/dataStore";
import { getPerfSnapshot } from "../lib/perf";

/** Snapshot printed by the `stats` command; also the observation point for benchmarks and E2E. */
const collectStats = () => {
  const state = useStore.getState();
  return {
    nodes: state.nodes.length,
    edges: state.edges.length,
    dataStore: dataStore.size,
    history: { past: state.history.past.length, future: state.history.future.length },
    ...getPerfSnapshot(),
  };
};

const ConsoleComponent = memo(({ logs, addLogs }) => {
  const theme = useTheme();
  useState(() => {
    if (execution.iFrame) {
      Hook(execution.iFrame.contentWindow.console, (log) => addLogs(Decode(log)));
    }
    return null;
  });
  return (
    <Box>
      <Console styles={{ BASE_FONT_FAMILY: theme.fonts.mono }} logs={logs} variant="dark" />
    </Box>
  );
});
ConsoleComponent.displayName = "ConsoleComponent";

const HELP_LOGS = [
  { method: "command", data: ["help"] },
  {
    method: "log",
    data: [
      "You can use the following commands:\n> help - shows this information\n> intro - loads the intro a flow\n> stats - prints node, edge, cache, history, and timing counters\n> clear - clears this view",
    ],
  },
  {
    method: "log",
    data: ["Hint: You can see the console.log outputs of your Javascript blocks here."],
  },
];

const Terminal = memo(() => {
  const logs = useStore((state) => state.logs);
  const addLogs = useStore((state) => state.addLogs);
  const clearLogs = useStore((state) => state.clearLogs);
  const loadFlow = useStore((state) => state.loadFlow);

  return (
    <Flex flexDirection="column" flexGrow={1} overflow="hidden" data-testid="terminal">
      <Box bg="bg.dark" overflowY="auto" flexGrow={1} position="relative">
        <Box
          position="absolute"
          left={0}
          top={0}
          bottom={0}
          right={0}
          data-testid="terminal__output"
        >
          <ConsoleComponent logs={logs} addLogs={addLogs} />
        </Box>
      </Box>
      <Box
        as="form"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          const value = e.target.input.value;
          if (!value) return null;
          if (value === "help") {
            e.target.input.value = "";
            addLogs(HELP_LOGS);
          } else if (value === "intro") {
            e.target.input.value = "";
            loadFlow("introduction");
            clearLogs();
          } else if (value === "stats") {
            e.target.input.value = "";
            addLogs([
              { method: "command", data: ["stats"] },
              { method: "info", data: [`stats ${JSON.stringify(collectStats())}`] },
            ]);
          } else if (value === "clear") {
            e.target.input.value = "";
            clearLogs();
          } else {
            e.target.input.value = "";
            addLogs({
              method: "error",
              data: [`command "${value}" not found. Type "help" to see the list of commands.`],
            });
          }
        }}
      >
        <Input
          placeholder="type 'help' to see the commands"
          name="input"
          border="none"
          data-testid="terminal__input"
          borderRadius={0}
          boxShadow="none"
          borderTop="none"
          _focus={{ outline: "none" }}
        />
      </Box>
    </Flex>
  );
});
Terminal.displayName = "Terminal";

export default Terminal;
