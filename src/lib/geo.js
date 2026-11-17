/**
 * Geometry helpers used by geo blocks: bbox, centroid, spherical area, buffering, and TopoJSON
 * simplification. Coordinates are WGS84 lon/lat pairs; area is expressed in square meters.
 */
import buffer from "@turf/buffer";
import * as topojsonServer from "topojson-server";
import * as topojsonClient from "topojson-client";
import { presimplify, simplify, planarTriangleArea, quantile } from "topojson-simplify";
import { isFeatureCollection } from "./types";

export const makeFeatureCollection = (features) => ({
  type: "FeatureCollection",
  features,
});

export const makePoint = (coordinates, properties = {}) => ({
  type: "Feature",
  properties,
  geometry: { type: "Point", coordinates },
});

export const makePolygon = (coordinates, properties = {}, bbox = null, id = undefined) => ({
  type: "Feature",
  ...(id !== undefined ? { id } : {}),
  ...(bbox ? { bbox } : {}),
  properties,
  geometry: { type: "Polygon", coordinates },
});

const eachCoordinate = (coords, fn) => {
  if (typeof coords[0] === "number") {
    fn(coords);
    return;
  }
  coords.forEach((c) => eachCoordinate(c, fn));
};

/** Returns `[minX, minY, maxX, maxY]` for any GeoJSON object. */
export const getBbox = (geojson) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (geometry) => {
    if (!geometry) return;
    if (geometry.type === "GeometryCollection") {
      geometry.geometries.forEach(visit);
      return;
    }
    if (geometry.type === "FeatureCollection") {
      geometry.features.forEach(visit);
      return;
    }
    if (geometry.type === "Feature") return visit(geometry.geometry);
    if (geometry.coordinates) {
      eachCoordinate(geometry.coordinates, ([x, y]) => {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      });
    }
  };
  visit(geojson);
  return [minX, minY, maxX, maxY];
};

export const bboxPolygon = (geojson) => {
  const bbox = getBbox(geojson);
  const [minX, minY, maxX, maxY] = bbox;
  const polygon = makePolygon(
    [
      [
        [minX, minY],
        [minX, maxY],
        [maxX, maxY],
        [maxX, minY],
        [minX, minY],
      ],
    ],
    geojson.properties,
    bbox,
  );
  return { ...polygon, bbox };
};

export const centroid = (geojson) => {
  let count = 0;
  let x = 0;
  let y = 0;
  const visit = (geometry) => {
    if (!geometry) return;
    if (geometry.type === "FeatureCollection") {
      geometry.features.forEach(visit);
      return;
    }
    if (geometry.type === "Feature") return visit(geometry.geometry);
    if (geometry.type === "GeometryCollection") {
      geometry.geometries.forEach(visit);
      return;
    }
    if (geometry.coordinates) {
      eachCoordinate(geometry.coordinates, ([cx, cy]) => {
        x += cx;
        y += cy;
        count += 1;
      });
    }
  };
  visit(geojson);
  if (!count) return null;
  return makePoint([x / count, y / count], geojson.properties || {});
};

const RADIUS = 6378137;

const ringArea = (coords) => {
  let area = 0;
  const len = coords.length;
  if (len <= 2) return 0;
  for (let i = 0; i < len; i += 1) {
    const lowerIndex = (i + len - 1) % len;
    const middleIndex = i % len;
    const upperIndex = (i + 1) % len;
    const p1 = coords[lowerIndex];
    const p2 = coords[middleIndex];
    const p3 = coords[upperIndex];
    area += (toRad(p3[0]) - toRad(p1[0])) * Math.sin(toRad(p2[1]));
  }
  area = (area * RADIUS * RADIUS) / 2;
  return area;
};

const toRad = (degree) => (degree * Math.PI) / 180;

/** Spherical polygon area in square meters (outer rings minus holes). */
export const area = (geojson) => {
  let total = 0;
  const visit = (geometry) => {
    if (!geometry) return;
    if (geometry.type === "FeatureCollection") {
      geometry.features.forEach(visit);
      return;
    }
    if (geometry.type === "Feature") return visit(geometry.geometry);
    if (geometry.type === "GeometryCollection") {
      geometry.geometries.forEach(visit);
      return;
    }
    if (geometry.type === "Polygon") {
      geometry.coordinates.forEach((ring, index) => {
        total += (index === 0 ? 1 : -1) * Math.abs(ringArea(ring));
      });
    } else if (geometry.type === "MultiPolygon") {
      geometry.coordinates.forEach((polygon) => {
        polygon.forEach((ring, index) => {
          total += (index === 0 ? 1 : -1) * Math.abs(ringArea(ring));
        });
      });
    }
  };
  visit(geojson);
  return total;
};

export const bufferGeo = (geojson, distance, options) => buffer(geojson, distance, options);

export const geoToTopology = (geojson) => topojsonServer.topology({ data: geojson });

export const topologyToGeo = (topology, layer) =>
  topojsonClient.feature(topology, topology.objects[layer]);

/**
 * Simplifies GeoJSON or TopoJSON using a quantile weight between 0 (max simplification) and 1
 * (full detail). GeoJSON is converted to a topology first.
 */
export const simplifyTopology = (geojsonOrTopology, weight) => {
  const topology =
    geojsonOrTopology.type === "Topology" ? geojsonOrTopology : geoToTopology(geojsonOrTopology);
  const presimplified = presimplify(topology, planarTriangleArea);
  const threshold = quantile(presimplified, weight);
  return simplify(presimplified, threshold);
};

export { isFeatureCollection };
