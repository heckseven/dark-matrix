// No node:* imports, no Buffer — safe for both server and browser imports
export type AssetMeta = {
  name: string;
  width: 9 | 18;
  frameCount: number;
  firstFrame: string; // base64 pixels of first frame
};
