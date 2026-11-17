/**
 * Log console and command line. Console output from the JS sandbox is forwarded through
 * console-feed; supported commands are `help`, `intro`, `stats`, and `clear`.
 */
import { memo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Console, Decode, Hook, Unhook } from "console-feed";
import useStore from "../store";
import execution from "../lib/execution";
import dataStore from "../lib/dataStore";
import { getPerfSnapshot } from "../lib/perf";
import { fonts } from "../lib/themeTokens";

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
  // Mirror the execution iframe's console into the terminal for as long as it is mounted.
  useEffect(() => {
    if (!execution.iFrame) return undefined;
    const hooked = Hook(execution.iFrame.contentWindow.console, (log) => addLogs(Decode(log)));
    return () => Unhook(hooked);
  }, [addLogs]);
  return (
    <div>
      <Console styles={{ BASE_FONT_FAMILY: fonts.mono }} logs={logs} variant="dark" />
    </div>
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
    <div className="flex grow flex-col overflow-hidden" data-testid="terminal">
      <div className="relative grow overflow-y-auto bg-bg-dark">
        <div className="absolute inset-0" data-testid="terminal__output">
          <ConsoleComponent logs={logs} addLogs={addLogs} />
        </div>
      </div>
      <form
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
          data-testid="terminal__input"
          className="rounded-none border-0 shadow-none focus-visible:shadow-none focus-visible:outline-none"
        />
      </form>
    </div>
  );
});
Terminal.displayName = "Terminal";

export default Terminal;
