/** Inline SVG icon set. Icons inherit `currentColor` and accept standard SVG props. */
import React from "react";

const Svg = ({ viewBox = "0 0 24 24", children, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox={viewBox}
    width="1em"
    height="1em"
    style={{ display: "inline-block", verticalAlign: "middle" }}
    {...props}
  >
    {children}
  </svg>
);

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const CheckIcon = (props) => (
  <Svg {...props}>
    <polyline {...strokeProps} points="20 6 9 17 4 12" />
  </Svg>
);

export const ChevronDownIcon = (props) => (
  <Svg {...props}>
    <polyline {...strokeProps} points="6 9 12 15 18 9" />
  </Svg>
);

export const ChevronUpIcon = (props) => (
  <Svg {...props}>
    <polyline {...strokeProps} points="18 15 12 9 6 15" />
  </Svg>
);

export const EyeIcon = (props) => (
  <Svg {...props}>
    <path {...strokeProps} d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle {...strokeProps} cx="12" cy="12" r="3" />
  </Svg>
);

export const GridIcon = (props) => (
  <Svg {...props}>
    <rect {...strokeProps} x="3" y="3" width="7" height="7" />
    <rect {...strokeProps} x="14" y="3" width="7" height="7" />
    <rect {...strokeProps} x="14" y="14" width="7" height="7" />
    <rect {...strokeProps} x="3" y="14" width="7" height="7" />
  </Svg>
);

export const XIcon = (props) => (
  <Svg {...props}>
    <line {...strokeProps} x1="18" y1="6" x2="6" y2="18" />
    <line {...strokeProps} x1="6" y1="6" x2="18" y2="18" />
  </Svg>
);

export const PencilIcon = (props) => (
  <Svg viewBox="0 0 14 16" {...props}>
    <path
      fillRule="evenodd"
      fill="currentColor"
      d="M0 12v3h3l8-8-3-3-8 8zm3 2H1v-2h1v1h1v1zm10.3-9.3L12 6 9 3l1.3-1.3a.996.996 0 0 1 1.41 0l1.59 1.59c.39.39.39 1.02 0 1.41z"
    />
  </Svg>
);

export const DragIndicatorIcon = (props) => (
  <Svg viewBox="0 0 24 24" {...props}>
    <path fill="none" d="M0 0h24v24H0V0z" />
    <path
      fill="currentColor"
      d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
    />
  </Svg>
);

export const InputGroupIcon = (props) => (
  <Svg viewBox="0 0 14 16" {...props}>
    <path
      fillRule="evenodd"
      fill="currentColor"
      d="M6 9H3V7h3V4l5 4-5 4V9zm8-7v12c0 .55-.45 1-1 1H1c-.55 0-1-.45-1-1V2c0-.55.45-1 1-1h12c.55 0 1 .45 1 1zm-1 0H1v12h12V2z"
    />
  </Svg>
);

export const ChartIcon = (props) => (
  <Svg viewBox="0 0 16 16" {...props}>
    <path
      fillRule="evenodd"
      fill="currentColor"
      d="M16 14v1H0V0h1v14h15zM5 13H3V8h2v5zm4 0H7V3h2v10zm4 0h-2V6h2v7z"
    />
  </Svg>
);

export const OutputGroupIcon = (props) => (
  <Svg viewBox="0 0 16 16" {...props}>
    <path
      fillRule="evenodd"
      fill="currentColor"
      d="M4 6h3V0h2v6h3l-4 4-4-4zm11-4h-4v1h4v8H1V3h4V2H1c-.55 0-1 .45-1 1v9c0 .55.45 1 1 1h5.34c-.25.61-.86 1.39-2.34 2h8c-1.48-.61-2.09-1.39-2.34-2H15c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1z"
    />
  </Svg>
);

export const TransformGroupIcon = (props) => (
  <Svg viewBox="0 0 16 16" {...props}>
    <path
      fillRule="evenodd"
      fill="currentColor"
      d="M4.48 7.27c.26.26 1.28 1.33 1.28 1.33l.56-.58-.88-.91 1.69-1.8s-.76-.74-.43-.45c.32-1.19.03-2.51-.87-3.44C4.93.5 3.66.2 2.52.51l1.93 2-.51 1.96-1.89.52-1.93-2C-.19 4.17.1 5.48 1 6.4c.94.98 2.29 1.26 3.48.87zm6.44 1.94l-2.33 2.3 3.84 3.98c.31.33.73.49 1.14.49.41 0 .82-.16 1.14-.49.63-.65.63-1.7 0-2.35l-3.79-3.93zM16 2.53L13.55 0 6.33 7.46l.88.91-4.31 4.46-.99.53-1.39 2.27.35.37 2.2-1.44.51-1.02L7.9 9.08l.88.91L16 2.53z"
    />
  </Svg>
);

export const GeoGroupIcon = (props) => (
  <Svg viewBox="0 0 12 16" {...props}>
    <path
      fillRule="evenodd"
      fill="currentColor"
      d="M6 0C2.69 0 0 2.5 0 5.5 0 10.02 6 16 6 16s6-5.98 6-10.5C12 2.5 9.31 0 6 0zm0 14.55C4.14 12.52 1 8.44 1 5.5 1 3.02 3.25 1 6 1c1.34 0 2.61.48 3.56 1.36.92.86 1.44 1.97 1.44 3.14 0 2.94-3.14 7.02-5 9.05zM8 5.5c0 1.11-.89 2-2 2-1.11 0-2-.89-2-2 0-1.11.89-2 2-2 1.11 0 2 .89 2 2z"
    />
  </Svg>
);

export const MiscGroupIcon = (props) => (
  <Svg viewBox="0 0 13 16" {...props}>
    <path
      fillRule="evenodd"
      fill="currentColor"
      d="M1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm5 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM13 7.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"
    />
  </Svg>
);

export const Logo = ({ logoStyle = { width: 25 } }) => (
  <Svg viewBox="0 0 300 209" style={logoStyle}>
    <path
      d="M109 0H1C0.447715 0 0 0.447715 0 1V64C0 64.5523 0.447715 65 1 65H109C109.552 65 110 64.5523 110 64V1C110 0.447715 109.552 0 109 0Z"
      fill="white"
    />
    <path
      d="M110.5 32.5C123.089 30.923 134.255 35.756 144 47C157 62 153.573 63.798 166 78C175.333 88.667 183.5 93.833 190.5 93.5M156.5 176.5C182.312 177.658 202.478 174.158 217 166C231.522 157.842 241.022 144.675 245.5 126.5"
      stroke="white"
      strokeWidth="10"
      strokeLinecap="square"
    />
    <path
      d="M155 144H47C46.4477 144 46 144.448 46 145V208C46 208.552 46.4477 209 47 209H155C155.552 209 156 208.552 156 208V145C156 144.448 155.552 144 155 144Z"
      fill="white"
    />
    <path
      d="M299 61H191C190.448 61 190 61.4477 190 62V125C190 125.552 190.448 126 191 126H299C299.552 126 300 125.552 300 125V62C300 61.4477 299.552 61 299 61Z"
      fill="#FF0072"
    />
  </Svg>
);

export const LayoutIcon = (props) => (
  <Svg viewBox="0 0 16 16" {...props}>
    <path
      fillRule="evenodd"
      fill="currentColor"
      d="M5 2H3v2h2V2zm1 0v2h7V2H6zM3 6h2v2H3V6zm3 0h7v2H6V6zm-3 4h2v2H3v-2zm3 0h7v2H6v-2z"
    />
  </Svg>
);

export const UploadIcon = OutputGroupIcon;

export default Svg;
