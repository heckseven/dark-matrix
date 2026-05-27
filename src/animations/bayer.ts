export const BAYER4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]] as const;
export const BAYER_THRESHOLD = BAYER4.map(row => row.map(v => (v + 0.5) * (255 / 16))) as unknown as readonly [readonly [number,number,number,number],readonly [number,number,number,number],readonly [number,number,number,number],readonly [number,number,number,number]];
