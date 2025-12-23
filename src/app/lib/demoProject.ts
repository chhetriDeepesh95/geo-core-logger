import type { ProjectFile } from "./model";

export const DEMO_PROJECT: ProjectFile = {
  version: "1.0.0",
  project: {
    name: "Demo Project",
    units: { length: "m" },
  },
  lithLegend: {
    FILL: "#d9d9d9",
    TOPS: "#b7b7b7",
    SILT: "#c2b280",
    CLAY: "#a97c50",
    SAND: "#e6d8ad",
    GRAV: "#c9c1a7",
    LAT: "#b87333",
    GRAN: "#d2b48c",
    BASA: "#8a8f99",
    DOL: "#9aa37b",
    SHAL: "#6f7a8c",
    UNKNOWN: "#888888",
  },
  drillholes: [
    {
      id: "DH-001",
      // origin reference
      collar: { x: 0, y: 0, z: 0 },
      depth: 42,
      intervals: [
        { id: "I-001", from: 0, to: 1.2, lith: "TOPS", recovery: 10, remarks: "Topsoil / organics" },
        { id: "I-002", from: 1.2, to: 6, lith: "FILL", rqd: 0, recovery: 20, remarks: "Loose fill / disturbed" },
        { id: "I-003", from: 6, to: 18, lith: "SILT", rqd: 35, recovery: 80, remarks: "Moist, slightly plastic" },
        { id: "I-004", from: 18, to: 42, lith: "GRAN", rqd: 75, recovery: 98, remarks: "Fresh to slightly weathered" },
      ],
    },
    {
      id: "DH-002",
      // east 6 m, north 4 m
      collar: { x: 6, y: 0, z: 4 },
      depth: 36,
      intervals: [
        { id: "I-005", from: 0, to: 0.8, lith: "TOPS", recovery: 8, remarks: "Topsoil" },
        { id: "I-006", from: 0.8, to: 4, lith: "FILL", rqd: 0, recovery: 15, remarks: "Fill / disturbed zone" },
        { id: "I-007", from: 4, to: 12, lith: "SAND", rqd: 15, recovery: 65, remarks: "Fine to medium sand" },
        { id: "I-008", from: 12, to: 22, lith: "GRAV", rqd: 20, recovery: 75, remarks: "Gravelly sand; cobbles" },
        { id: "I-009", from: 22, to: 36, lith: "BASA", rqd: 60, recovery: 92, remarks: "Moderately fractured basalt" },
      ],
    },
    {
      id: "DH-003",
      // west 5 m, north 3 m
      collar: { x: -5, y: 0, z: 3 },
      depth: 55,
      intervals: [
        { id: "I-010", from: 0, to: 2, lith: "TOPS", recovery: 12, remarks: "Topsoil; roots" },
        { id: "I-011", from: 2, to: 10, lith: "CLAY", recovery: 55, remarks: "Clay; medium plasticity" },
        { id: "I-012", from: 10, to: 20, lith: "SILT", rqd: 10, recovery: 70, remarks: "Silty clay; damp" },
        { id: "I-013", from: 20, to: 33, lith: "LAT", rqd: 25, recovery: 85, remarks: "Laterite; ironstone nodules" },
        { id: "I-014", from: 33, to: 55, lith: "GRAN", rqd: 82, recovery: 99, remarks: "Granite; fresh" },
      ],
    },
    {
      id: "DH-004",
      // east 3 m, south 6 m
      collar: { x: 3, y: 0, z: -6 },
      depth: 28,
      intervals: [
        { id: "I-015", from: 0, to: 1.5, lith: "TOPS", remarks: "Topsoil" },
        { id: "I-016", from: 1.5, to: 6, lith: "SAND", remarks: "Sand; loose; dry" },
        { id: "I-017", from: 6, to: 14, lith: "UNKNOWN", remarks: "Transition zone; poor recovery" },
        { id: "I-018", from: 14, to: 28, lith: "SHAL", rqd: 40, recovery: 88, remarks: "Shale; bedding visible" },
      ],
    },
    {
      id: "DH-005",
      // south-west cluster
      collar: { x: -4, y: 0, z: -4 },
      depth: 40,
      intervals: [],
    },
    {
      id: "DH-006",
      // north-east cluster
      collar: { x: 8, y: 0, z: 7 },
      depth: 80,
      intervals: [
        { id: "I-019", from: 0, to: 1, lith: "TOPS", recovery: 10, remarks: "Topsoil" },
        { id: "I-020", from: 1, to: 6, lith: "CLAY", recovery: 60, remarks: "Clay; stiff" },
        { id: "I-021", from: 6, to: 18, lith: "LAT", rqd: 10, recovery: 78, remarks: "Laterite; variable cementation" },
        { id: "I-022", from: 18, to: 42, lith: "BASA", rqd: 55, recovery: 90, remarks: "Basalt; fractured zones" },
        { id: "I-023", from: 42, to: 60, lith: "DOL", rqd: 65, recovery: 94, remarks: "Dolomite; vugs occasional" },
        { id: "I-024", from: 60, to: 80, lith: "GRAN", rqd: 88, recovery: 99, remarks: "Granitic intrusive; fresh" },
      ],
    },
  ],
};
