import { describe, it, expect } from "vitest";
import {
  area,
  bboxPolygon,
  bufferGeo,
  centroid,
  geoToTopology,
  getBbox,
  isFeatureCollection,
  makeFeatureCollection,
  makePoint,
  makePolygon,
  presimplifyTopology,
  simplifyPresimplified,
  simplifyTopology,
  topologyToGeo,
} from "./geo";

const square = (x0, y0, size) => [
  [
    [x0, y0],
    [x0 + size, y0],
    [x0 + size, y0 + size],
    [x0, y0 + size],
    [x0, y0],
  ],
];

const R = 6378137;
const rad = (d) => (d * Math.PI) / 180;
/** Exact spherical area of a lon/lat rectangle. */
const rectArea = (lon0, lat0, lon1, lat1) =>
  R * R * Math.abs(rad(lon1) - rad(lon0)) * Math.abs(Math.sin(rad(lat1)) - Math.sin(rad(lat0)));

/** A wiggly ring with many vertices so simplification has something to remove. */
const wigglyPolygon = () => {
  const ring = [];
  for (let i = 0; i < 64; i += 1) {
    const angle = (i / 64) * Math.PI * 2;
    const r = 1 + (i % 2 ? 0.05 : 0);
    ring.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }
  ring.push(ring[0]);
  return makeFeatureCollection([makePolygon([ring], { name: "w" })]);
};

const countPoints = (geojson) => {
  let n = 0;
  const walk = (c) => (typeof c[0] === "number" ? (n += 1) : c.forEach(walk));
  geojson.features.forEach((f) => walk(f.geometry.coordinates));
  return n;
};

describe("constructors", () => {
  it("makes features and collections", () => {
    expect(makeFeatureCollection([])).toEqual({ type: "FeatureCollection", features: [] });
    expect(makePoint([1, 2])).toEqual({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [1, 2] },
    });
    expect(makePoint([1, 2], { a: 1 }).properties).toEqual({ a: 1 });
    const coords = square(0, 0, 1);
    expect(makePolygon(coords)).toEqual({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: coords },
    });
    const withExtras = makePolygon(coords, { a: 1 }, [0, 0, 1, 1], 7);
    expect(withExtras.id).toBe(7);
    expect(withExtras.bbox).toEqual([0, 0, 1, 1]);
    expect(withExtras.properties).toEqual({ a: 1 });
    expect(isFeatureCollection(makeFeatureCollection([]))).toBe(true);
  });
});

describe("getBbox / bboxPolygon", () => {
  it("computes bounds across features, collections and nested geometries", () => {
    const geo = makeFeatureCollection([
      makePoint([-5, 2]),
      makePolygon(square(1, 1, 3)),
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "GeometryCollection",
          geometries: [
            {
              type: "LineString",
              coordinates: [
                [10, -7],
                [0, 0],
              ],
            },
          ],
        },
      },
      { type: "Feature", properties: {}, geometry: null },
    ]);
    expect(getBbox(geo)).toEqual([-5, -7, 10, 4]);
  });

  it("returns infinite bounds for empty input", () => {
    expect(getBbox(makeFeatureCollection([]))).toEqual([Infinity, Infinity, -Infinity, -Infinity]);
  });

  it("builds a bbox polygon keeping the input properties", () => {
    const feature = makePolygon(square(0, 0, 2), { name: "sq" });
    const result = bboxPolygon(feature);
    expect(result.bbox).toEqual([0, 0, 2, 2]);
    expect(result.properties).toEqual({ name: "sq" });
    expect(result.geometry.coordinates[0]).toEqual([
      [0, 0],
      [0, 2],
      [2, 2],
      [2, 0],
      [0, 0],
    ]);
  });
});

describe("centroid", () => {
  it("averages all coordinates", () => {
    const geo = makeFeatureCollection([makePoint([0, 0]), makePoint([2, 4])]);
    expect(centroid(geo).geometry.coordinates).toEqual([1, 2]);
    expect(centroid(geo).properties).toEqual({});
  });

  it("handles geometry collections and feature properties", () => {
    const feature = {
      type: "Feature",
      properties: { id: 1 },
      geometry: {
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: [0, 0] },
          { type: "Point", coordinates: [4, 0] },
        ],
      },
    };
    const result = centroid(feature);
    expect(result.geometry.coordinates).toEqual([2, 0]);
    expect(result.properties).toEqual({ id: 1 });
  });

  it("returns null without coordinates", () => {
    expect(centroid(makeFeatureCollection([]))).toBeNull();
    expect(centroid({ type: "Feature", properties: {}, geometry: null })).toBeNull();
  });
});

describe("area", () => {
  it("computes spherical polygon area in square meters", () => {
    const expected = rectArea(0, 0, 1, 1);
    const result = area(makePolygon(square(0, 0, 1)));
    expect(Math.abs(result - expected) / expected).toBeLessThan(1e-9);
    // Roughly 12,391 km² at the equator.
    expect(result / 1e6).toBeGreaterThan(12000);
    expect(result / 1e6).toBeLessThan(12500);
  });

  it("subtracts holes and sums multipolygons and collections", () => {
    const outer = square(0, 0, 2)[0];
    const hole = square(0.5, 0.5, 1)[0];
    const withHole = area({ type: "Polygon", coordinates: [outer, hole] });
    const expected = rectArea(0, 0, 2, 2) - rectArea(0.5, 0.5, 1.5, 1.5);
    expect(Math.abs(withHole - expected) / expected).toBeLessThan(1e-9);

    const multi = area({
      type: "MultiPolygon",
      coordinates: [square(0, 0, 1), [outer, hole]],
    });
    expect(multi).toBeCloseTo(rectArea(0, 0, 1, 1) + expected, -2);

    const collection = area(
      makeFeatureCollection([
        makePolygon(square(0, 0, 1)),
        {
          type: "Feature",
          properties: {},
          geometry: { type: "GeometryCollection", geometries: [makePolygon(square(0, 0, 1))] },
        },
      ]),
    );
    expect(collection).toBeCloseTo(2 * rectArea(0, 0, 1, 1), -2);
  });

  it("is zero for non-polygons and degenerate rings", () => {
    expect(area(makePoint([0, 0]))).toBe(0);
    expect(
      area({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 1],
          ],
        ],
      }),
    ).toBe(0);
    expect(area(null)).toBe(0);
  });
});

describe("bufferGeo", () => {
  it("lazy-loads @turf/buffer and buffers a point into a polygon", async () => {
    const result = await bufferGeo(makePoint([0, 0]), 10, { units: "kilometers" });
    expect(result.type).toBe("Feature");
    expect(result.geometry.type).toBe("Polygon");
    const [minX, minY, maxX, maxY] = getBbox(result);
    // 10km ≈ 0.09° at the equator.
    expect(maxX).toBeGreaterThan(0.08);
    expect(maxX).toBeLessThan(0.1);
    expect(minX).toBeLessThan(-0.08);
    expect(maxY).toBeGreaterThan(0.08);
    expect(minY).toBeLessThan(-0.08);
  });
});

describe("topology", () => {
  it("converts GeoJSON to TopoJSON and back", () => {
    const geo = makeFeatureCollection([
      makePolygon(square(0, 0, 1), { name: "a" }),
      makePolygon(square(1, 0, 1), { name: "b" }),
    ]);
    const topology = geoToTopology(geo);
    expect(topology.type).toBe("Topology");
    expect(Object.keys(topology.objects)).toEqual(["data"]);
    const back = topologyToGeo(topology, "data");
    expect(back.type).toBe("FeatureCollection");
    expect(back.features.map((f) => f.properties.name)).toEqual(["a", "b"]);
    expect(getBbox(back)).toEqual([0, 0, 2, 1]);
  });

  it("simplifies: weight 1 keeps detail, weight 0 removes vertices", () => {
    const geo = wigglyPolygon();
    const full = topologyToGeo(simplifyTopology(geo, 1), "data");
    const simple = topologyToGeo(simplifyTopology(geo, 0), "data");
    expect(countPoints(full)).toBe(countPoints(geo));
    expect(countPoints(simple)).toBeLessThan(countPoints(full));
  });

  it("simplifyTopology equals presimplify + simplifyPresimplified, for GeoJSON and Topology", () => {
    const geo = wigglyPolygon();
    const pre = presimplifyTopology(geo);
    for (const weight of [0, 0.3, 0.7, 1]) {
      expect(simplifyPresimplified(pre, weight)).toEqual(simplifyTopology(geo, weight));
    }
    const topology = geoToTopology(geo);
    const preTopo = presimplifyTopology(topology);
    expect(simplifyPresimplified(preTopo, 0.5)).toEqual(simplifyTopology(topology, 0.5));
  });
});
