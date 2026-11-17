/**
 * Browser download helpers and the canvas rect lookup used to place dropped/created nodes.
 */
export const download = (data, mime, name) => {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/** Bounding rect of the flow canvas; used to convert pointer positions into node positions. */
export const getFlowRect = () => {
  const el = document.getElementById("reactflow");
  return el ? el.getBoundingClientRect() : null;
};
