export type Vec3 = { x: number; y: number; z: number };

export type Interval = {
  id: string;
  from: number;
  to: number;
  lith: string;
  rqd?: number;
  recovery?: number;
  remarks?: string;
};

export type Drillhole = {
  id: string;
  collar: Vec3;
  depth: number;
  intervals?: Interval[];
};

export type ProjectFile = {
  version: string;
  project: {
    name: string;
    units: { length: "m" };
  };
  drillholes: Drillhole[];
  lithLegend?: Record<string, string>;
};